import { delay, http, HttpResponse } from 'msw'
import type { AuctionDetail, AuditEntry, TransactionDetail } from '@/domain/types'
import { disputeTransition, resolveOutcome, validateResolution } from '@/domain/dispute'
import { reputationScore } from '@/domain/reputation'
import { formatIdr } from '@/domain/format'
import type {
  AccountStatus, AdminAuction, AdminAuctionDetail, AdminBid, AdminMarket, AdminOverview, AdminUser, AdminUserDetail, AdminWithdrawal,
  AdminWithdrawalDetail, AlertActionInput, WithdrawalActionInput,
  AlertType, AuctionAction, DisputeActionInput, DisputeCase, DisputeParty, DisputeSummary, EscalationAction, Finding, FraudAlert, MarketAction,
  UserAction, VerificationAction,
} from '@/features/admin/types'
import { publish } from '@/lib/realtime'
import { audit, auditLog } from './audit'
import { db } from './db'
import { economy, toAuction } from './economy'
import { allPersonal, newId, notify, personal, savePersonal } from './personal'
import { allWithdrawals, decideWithdrawal, mirror, type StoredWithdrawal } from './trade'
import { normName, payoutDueAt } from '@/domain/payout'
import { admin, saveAdmin, type DisputeOverlay } from './admin'
import { reputationTxs } from './profileHandlers'

// Governance API (PRD §11). Admins inspect, freeze and decide; nothing here edits bids or
// transaction amounts directly. Every write requires a reason where it is punitive and is audited.

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const H = 3_600_000

type Ctx = { actor: string; params: Record<string, string | readonly string[] | undefined>; request: Request }

/** Session must carry the admin capability (403 otherwise). */
export const asAdmin = (fn: (ctx: Ctx) => Response | Promise<Response>) =>
  async ({ params, request }: { params: Ctx['params']; request: Request }) => {
    await delay(250)
    const user = db.users.find((u) => u.id === db.sessionUserId)
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    if (!user.capabilities.includes('admin')) return fail(403, 'forbidden', 'Butuh capability admin')
    return fn({ actor: `${user.name} (Admin)`, params, request })
  }

const MIN_REASON = 10
/** Punitive actions need a written reason; returns the 422 or null. */
export const reasonError = (reason: unknown) =>
  typeof reason === 'string' && reason.trim().length >= MIN_REASON
    ? null
    : fail(422, 'reason_required', 'Alasan wajib diisi', { reason: `Tulis alasan minimal ${MIN_REASON} karakter; tercatat di audit trail` })

const dbUserId = (name: string) => db.users.find((u) => u.name === name)?.id

// ── Users ────────────────────────────────────────────────────────

function users(): AdminUser[] {
  const fromDb = db.users.map((u) => {
    const p = personal(u.id)
    const txs = reputationTxs(u.id)
    return {
      id: u.id, name: u.name, username: u.username, email: u.email, location: u.location, kind: 'person' as const, capabilities: u.capabilities,
      verified: admin.users[u.id]?.verified ?? p.identity.profile.verification.identity === 'verified',
      status: admin.users[u.id]?.status ?? 'active', joinedAt: txs.map((t) => t.createdAt).sort()[0] ?? now(),
      reputation: reputationScore(txs).score, transactions: txs.length, reportCount: admin.reports[u.id]?.length ?? 0,
    }
  })
  const extras = admin.accounts.map((a) => {
    const txs = reputationTxs(a.id)
    return {
      id: a.id, name: a.name, username: a.username, email: a.email, location: a.location, kind: a.kind, capabilities: [],
      verified: !!admin.users[a.id]?.verified, status: admin.users[a.id]?.status ?? 'active', joinedAt: a.joinedAt,
      reputation: reputationScore(txs).score, transactions: txs.length, reportCount: admin.reports[a.id]?.length ?? 0,
    }
  })
  return [...fromDb, ...extras]
}

const STATUS_VERB: Record<AccountStatus, string> = { active: 'Pulihkan akun', restricted: 'Batasi akun', suspended: 'Suspend akun' }

function setUserStatus(u: AdminUser, status: AccountStatus, actor: string, reason: string, via?: string) {
  admin.users[u.id] = { ...admin.users[u.id], status }
  saveAdmin()
  audit({ actor, action: `${STATUS_VERB[status]}${via ? ` (eskalasi ${via})` : ''}`, entity: { type: 'user', id: u.id, label: u.name }, reason, changes: [{ field: 'status', before: u.status, after: status }] })
}

// ── Markets & auctions ───────────────────────────────────────────

const ACTIVE_AUCTION = ['scheduled', 'qualification', 'live', 'extended']

function freezeAuction(a: AuctionDetail, actor: string, reason: string, via?: string) {
  admin.frozen[a.id] = a.status
  const before = a.status
  a.status = 'frozen'
  saveAdmin()
  if (economy.owners.has(a.id)) savePersonal()
  publish({ channel: `auction:${a.id}`, type: 'auction.closed', payload: { kind: 'closed', status: 'frozen' }, ts: now() })
  audit({ actor, action: `Freeze auction${via ? ` (eskalasi ${via})` : ''}`, entity: { type: 'auction', id: a.id, label: `${a.code} · ${a.title}` }, reason, changes: [{ field: 'status', before, after: 'frozen' }] })
  const owner = economy.owners.get(a.id)
  if (owner) notify(owner, { type: 'auction_ending', title: `${a.title} dibekukan Admin`, body: 'Bid dan penetapan pemenang ditahan selama pemeriksaan.', href: `/auctions/${a.id}` })
}

function setMarketStatus(id: string, status: 'suspended' | 'active', actor: string, reason: string, via?: string) {
  const m = economy.markets.find((x) => x.id === id)!
  const before = m.status
  m.status = status
  admin.markets[id] = { ...(admin.markets[id] ?? { flags: [], reports: [] }), status }
  saveAdmin()
  audit({ actor, action: `${status === 'suspended' ? 'Suspend market' : 'Pulihkan market'}${via ? ` (eskalasi ${via})` : ''}`, entity: { type: 'market', id, label: `${m.code} · ${m.name}` }, reason, changes: [{ field: 'status', before, after: status }] })
}

const IDENTITIES = ['CV Kilat Jaya', 'PT Mitra Karton Abadi', 'PT Kemas Prima', 'UD Makmur Jaya', 'CV Sumber Pangan', 'PT Logistik Andalan', 'Koperasi Mitra Tani', 'PT Rasa Nusantara', 'Budi Santoso', 'Hendra Gunawan']

/** The unmasked bid ledger. Participants' own bids come from their stores; the rest is the engine's book. */
function ledger(a: AuctionDetail): AdminBid[] | null {
  if (a.type === 'sealed' && ACTIVE_AUCTION.includes(a.status)) return null
  const who = (masked: string) => (masked === 'Supplier 3' && a.id === 'auc-karton-100k' ? 'CV Kilat Jaya' : IDENTITIES[hash(a.id + masked) % IDENTITIES.length])
  const users: AdminBid[] = allPersonal().flatMap(([userId, p]) => {
    const b = p.bids[a.id]
    return b ? [{ id: `${a.id}-${userId}`, bidder: `${db.users.find((u) => u.id === userId)?.name ?? userId} (akun pengguna)`, masked: 'Kamu', priceIdr: b.priceIdr, at: b.updatedAt }] : []
  })
  if (a.visibility === 'full') return [...a.bids.filter((b) => !b.mine).map((b) => ({ id: b.id, bidder: who(b.bidder), masked: b.bidder, priceIdr: b.priceIdr, at: b.at })), ...users].sort((x, y) => y.at.localeCompare(x.at))
  const best = economy.bestPrice.get(a.id) ?? a.openingPriceIdr
  const n = Math.min(a.bidCount, 12)
  const start = new Date(a.startsAt).getTime()
  const end = Math.min(Date.now(), new Date(a.endsAt).getTime())
  const engine = Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n
    const masked = `Peserta ${1 + (hash(a.id + i) % Math.max(1, a.participants))}`
    return { id: `${a.id}-h${i}`, bidder: who(masked), masked, priceIdr: Math.round(a.openingPriceIdr + (best - a.openingPriceIdr) * t), at: new Date(start + (end - start) * t).toISOString() }
  })
  return [...engine, ...users].sort((x, y) => y.at.localeCompare(x.at))
}

function findings(a: AuctionDetail, bids: AdminBid[] | null): Finding[] {
  const out: Finding[] = admin.alerts
    .filter((al) => al.status !== 'dismissed' && al.subjects.some((s) => s.type === 'auction' && s.id === a.id))
    .map((al) => ({ id: al.id, rule: `${al.source === 'system' ? 'Rekomendasi sistem' : 'Kasus manual'} ${al.code}`, severity: al.score >= 80 ? 'high' : al.score >= 60 ? 'medium' : 'low', detail: al.title }))
  if (!bids?.length) return out
  const chrono = [...bids].reverse()
  let run = 1
  for (let i = 1; i < chrono.length; i++) {
    run = chrono[i].bidder === chrono[i - 1].bidder ? run + 1 : 1
    if (run === 3) {
      out.push({ id: `${a.id}-run`, rule: 'Bid beruntun', severity: 'medium', detail: `${chrono[i].bidder} memasang ≥ 3 bid berturut-turut tanpa ada pesaing di antaranya.` })
      break
    }
  }
  const step = Math.max(1, a.minStepIdr)
  const jump = chrono.slice(1).find((b, i) => Math.abs(b.priceIdr - chrono[i].priceIdr) > step * 20)
  if (jump) out.push({ id: `${a.id}-jump`, rule: 'Lonjakan harga', severity: 'low', detail: `Selisih bid ${formatIdr(Math.abs(jump.priceIdr - chrono[chrono.indexOf(jump) - 1].priceIdr))} > 20× langkah minimum.` })
  return out
}

const adminAuction = (a: AuctionDetail): AdminAuction => ({ ...toAuction(a), findings: findings(a, ledger(a)) })

function adminMarkets(): AdminMarket[] {
  const cases = disputeCases()
  return economy.markets.map(({ description: _d, rules: _r, priceHistory: _p, activity: _a, auctions: _u, ...m }) => ({
    ...m, flags: admin.markets[m.id]?.flags ?? [], reports: admin.markets[m.id]?.reports ?? [], reviewedAt: admin.markets[m.id]?.reviewedAt,
    disputes: cases.filter((c) => c.marketId === m.id && c.status !== 'resolved').length,
  }))
}

// ── Disputes ─────────────────────────────────────────────────────

interface CaseRef {
  case: DisputeCase
  tx: TransactionDetail
  overlay: DisputeOverlay
  /** Persists whichever store holds the transaction. */
  save: () => void
}

function overlayFor(id: string) {
  return (admin.disputes[id] ??= { evidence: [], timeline: [] })
}

function caseRefs(): CaseRef[] {
  const seeded = admin.seedDisputes.map((s): CaseRef => {
    const t = s.transaction
    const overlay = overlayFor(s.id)
    return {
      tx: t, overlay, save: saveAdmin,
      case: {
        id: s.id, code: `DSP-${s.id.slice(-2).toUpperCase()}`, status: t.dispute!.status, reason: t.dispute!.reason, openedAt: t.dispute!.openedAt,
        openedBy: s.openedBy, parties: s.parties, transaction: t, marketId: s.marketId, evidence: overlay.evidence, timeline: overlay.timeline, resolution: overlay.resolution,
      },
    }
  })
  const real = allPersonal().flatMap(([userId, p]) =>
    // A linked trade has two records; the buyer's copy carries the case.
    p.transactions.filter((t) => t.dispute && !(t.peer && t.role === 'supplier')).map((t): CaseRef => {
      const id = `dsp-${t.id}`
      const user = db.users.find((u) => u.id === userId)
      const name = user?.name ?? userId
      const other = t.role === 'buyer' ? 'supplier' : 'buyer'
      const overlay = overlayFor(id)
      const parties: DisputeParty[] = [
        { role: t.role, name, kind: 'person', verified: !!user?.emailVerified, userId },
        { role: other, ...t.counterparty, userId: t.peer?.userId ?? dbUserId(t.counterparty.name) },
      ]
      const partyEvidence = (t.dispute!.evidence ?? []).map((e) => ({ id: e.id, side: e.by, by: e.name, text: e.text, file: e.file, url: e.url, at: e.at }))
      return {
        tx: t, overlay, save: () => { mirror(t); savePersonal(); saveAdmin() },
        case: {
          id, code: `DSP-${t.code.slice(4)}`, status: t.dispute!.status, reason: t.dispute!.reason, openedAt: t.dispute!.openedAt, openedBy: name,
          parties: t.role === 'buyer' ? parties : parties.reverse(), transaction: t, marketId: economy.auctions.find((a) => a.id === t.auctionId)?.marketId,
          evidence: [...(partyEvidence.length ? partyEvidence : [{ id: `${id}-open`, side: t.role, by: name, text: t.dispute!.reason, at: t.dispute!.openedAt }]), ...overlay.evidence],
          timeline: [{ at: t.dispute!.openedAt, by: name, label: 'Dispute dibuka' }, ...overlay.timeline],
          resolution: overlay.resolution,
        },
      }
    }),
  )
  return [...real, ...seeded].sort((a, b) => b.case.openedAt.localeCompare(a.case.openedAt))
}

const disputeCases = () => caseRefs().map((r) => r.case)

const summary = ({ evidence: _e, timeline: _t, transaction: t, ...c }: DisputeCase): DisputeSummary => ({ ...c, totalIdr: t.totalIdr, title: t.title })

function notifyParties(c: DisputeCase, roles: ('buyer' | 'supplier')[], title: string, body: string) {
  for (const p of c.parties) {
    if (!roles.includes(p.role) || !p.userId || !db.users.some((u) => u.id === p.userId)) continue
    const owns = personal(p.userId).transactions.some((t) => t.id === c.transaction.id)
    notify(p.userId, { type: 'transaction_update', title, body, href: owns ? `/app/transactions/${c.transaction.id}` : '/app/transactions' })
  }
}

const ROLE_LABEL = { buyer: 'pembeli', supplier: 'supplier', both: 'kedua pihak' }

// ── Fraud ────────────────────────────────────────────────────────

const ALERT_LABEL: Record<AlertType, string> = {
  bid_manipulation: 'Bid manipulation', collusion: 'Collusion pattern', fake_accounts: 'Fake accounts', abnormal_bidding: 'Abnormal bidding',
  wash_trading: 'Wash trading', price_manipulation: 'Sudden price manipulation', transaction_network: 'Suspicious transaction network',
}

const alertEntity = (al: FraudAlert): AuditEntry['entity'] => ({ type: 'alert', id: al.id, label: `${al.code} · ${al.title}` })

// ── Payouts ──────────────────────────────────────────────────────

function adminWithdrawal(userId: string, w: StoredWithdrawal): AdminWithdrawal {
  const u = db.users.find((x) => x.id === userId)
  return {
    id: w.id, code: w.code, status: w.status, amountIdr: w.amountIdr, requestedAt: w.at, dueAt: payoutDueAt(w.at),
    requester: { id: userId, name: u?.name ?? userId, email: u?.email ?? '' }, party: { id: `pty-${userId}`, name: u?.name ?? userId },
    bank: w.bank.bank, holder: w.bank.holder, accountLast4: w.bank.accountNo.slice(-4),
    transferRef: w.transferRef, paidAt: w.paidAt, note: w.note, reason: w.reason, decidedAt: w.decidedAt, decidedBy: w.decidedBy,
  }
}

// ── Handlers ─────────────────────────────────────────────────────

export const adminHandlers = [
  http.get(api('/admin/overview'), asAdmin(() => {
    const cases = disputeCases()
    const open = cases.filter((c) => c.status !== 'resolved')
    const pending = admin.verifications.filter((v) => v.status === 'pending')
    const age = (iso: string) => Date.now() - new Date(iso).getTime()
    const oldest = (isos: string[]) => isos.sort()[0]
    const payouts = allWithdrawals().filter(({ w }) => w.status === 'processing').map(({ w }) => w)
    const overview: AdminOverview = {
      queues: {
        users: users().filter((u) => (u.reportCount > 0 && u.status === 'active') || admin.appeals?.[u.id]?.status === 'pending').length,
        verification: pending.length,
        markets: adminMarkets().filter((m) => m.status !== 'suspended' && m.flags.some((f) => !m.reviewedAt || f.at > m.reviewedAt)).length,
        auctions: economy.auctions.filter((a) => ACTIVE_AUCTION.includes(a.status) && adminAuction(a).findings.length > 0).length,
        disputes: open.length,
        fraud: admin.alerts.filter((a) => a.status === 'new' || a.status === 'investigating').length,
        withdrawals: payouts.length,
      },
      newAlerts: admin.alerts.filter((a) => a.status === 'new').sort((a, b) => b.score - a.score).slice(0, 4),
      openDisputes: open.map(summary).slice(0, 5),
      sla: [
        { module: 'verification', label: 'Verifikasi bisnis', slaHours: 48, total: pending.length, breached: pending.filter((v) => age(v.submittedAt) > 48 * H).length, oldestAt: oldest(pending.map((v) => v.submittedAt)) },
        { module: 'disputes', label: 'Dispute', slaHours: 72, total: open.length, breached: open.filter((c) => age(c.openedAt) > 72 * H).length, oldestAt: oldest(open.map((c) => c.openedAt)) },
        { module: 'withdrawals', label: 'Pencairan dana', slaHours: 24, total: payouts.length, breached: payouts.filter((w) => payoutDueAt(w.at) < now()).length, oldestAt: oldest(payouts.map((w) => w.at)) },
      ],
    }
    return HttpResponse.json(overview)
  })),

  // Users
  http.get(api('/admin/users'), asAdmin(({ request }) => {
    const p = new URL(request.url).searchParams
    const q = p.get('q')?.trim().toLowerCase()
    const status = p.get('status')
    return HttpResponse.json(users().filter((u) => (!q || `${u.name} ${u.username} ${u.email}`.toLowerCase().includes(q)) && (!status || u.status === status)))
  })),
  http.get(api('/admin/users/:id'), asAdmin(({ params }) => {
    const u = users().find((x) => x.id === params.id)
    if (!u) return fail(404, 'not_found', 'Pengguna tidak ditemukan')
    const dbUser = db.users.find((x) => x.id === u.id)
    const detail: AdminUserDetail = {
      ...u, appeal: admin.appeals?.[u.id], reports: admin.reports[u.id] ?? [], orgs: dbUser?.orgs.map((o) => o.orgName) ?? [],
      history: dbUser ? personal(u.id).transactions.map(({ timeline: _t, documents: _d, payment: _p, delivery: _v, dispute: _x, ...t }) => t) : [],
      audit: auditLog({ type: 'user', id: u.id }),
    }
    return HttpResponse.json(detail)
  })),
  http.post(api('/admin/users/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const u = users().find((x) => x.id === params.id)
    if (!u) return fail(404, 'not_found', 'Pengguna tidak ditemukan')
    const { action, reason } = (await request.json()) as { action: UserAction; reason?: string }
    const err = reasonError(reason)
    if (err) return err
    if (action === 'verify') {
      if (u.verified) return fail(409, 'already_verified', 'Akun sudah terverifikasi')
      admin.users[u.id] = { ...(admin.users[u.id] ?? { status: u.status }), verified: true }
      saveAdmin()
      audit({ actor, action: 'Verifikasi identitas', entity: { type: 'user', id: u.id, label: u.name }, reason, changes: [{ field: 'verified', before: 'tidak', after: 'ya' }] })
    } else if (action === 'deny_appeal') {
      const ap = admin.appeals?.[u.id]
      if (ap?.status !== 'pending') return fail(409, 'no_appeal', 'Tidak ada banding yang menunggu')
      Object.assign(ap, { status: 'denied', decision: { at: now(), by: actor, note: reason!.trim() } })
      saveAdmin()
      audit({ actor, action: 'Tolak banding suspend', entity: { type: 'user', id: u.id, label: u.name }, reason, changes: [{ field: 'banding', before: 'pending', after: 'ditolak' }] })
    } else {
      const ap = admin.appeals?.[u.id]
      if (action === 'restore' && ap?.status === 'pending') Object.assign(ap, { status: 'granted', decision: { at: now(), by: actor, note: reason!.trim() } })
      const to: AccountStatus = action === 'suspend' ? 'suspended' : action === 'restrict' ? 'restricted' : 'active'
      if (u.status === to) return fail(409, 'no_change', 'Status akun sudah seperti itu')
      setUserStatus(u, to, actor, reason!)
    }
    return HttpResponse.json(users().find((x) => x.id === u.id))
  })),

  // Business verification
  http.get(api('/admin/verifications'), asAdmin(() => HttpResponse.json(admin.verifications))),
  http.get(api('/admin/verifications/:id'), asAdmin(({ params }) => {
    const v = admin.verifications.find((x) => x.id === params.id)
    return v ? HttpResponse.json(v) : fail(404, 'not_found', 'Pengajuan tidak ditemukan')
  })),
  http.post(api('/admin/verifications/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const v = admin.verifications.find((x) => x.id === params.id)
    if (!v) return fail(404, 'not_found', 'Pengajuan tidak ditemukan')
    if (v.status !== 'pending') return fail(409, 'decided', 'Pengajuan ini sudah diputuskan')
    const { action, reason } = (await request.json()) as { action: VerificationAction; reason?: string }
    const err = action === 'approve' ? null : reasonError(reason)
    if (err) return err
    const to = ({ approve: 'approved', reject: 'rejected', reupload: 'reupload' } as const)[action]
    v.status = to
    v.decision = { at: now(), by: actor, note: reason?.trim() || 'Dokumen sesuai' }
    saveAdmin()
    audit({ actor, action: { approve: 'Setujui verifikasi bisnis', reject: 'Tolak verifikasi bisnis', reupload: 'Minta unggah ulang dokumen' }[action], entity: { type: 'business', id: v.id, label: v.business }, reason: reason?.trim() || undefined, changes: [{ field: 'status', before: 'pending', after: to }] })
    const owner = dbUserId(v.owner)
    if (owner && v.kind === 'personal') {
      if (to === 'approved') admin.users[owner] = { ...admin.users[owner], status: admin.users[owner]?.status ?? 'active', verified: true }
      personal(owner).identity.profile.verification.identity = to === 'approved' ? 'verified' : 'none'
      savePersonal()
      saveAdmin()
    }
    if (owner) notify(owner, { type: 'transaction_update', title: `Verifikasi ${v.business}: ${{ approved: 'disetujui', rejected: 'ditolak', reupload: 'perlu unggah ulang' }[to]}`, body: v.decision.note, href: '/app/settings' })
    return HttpResponse.json(v)
  })),

  // Market moderation
  http.get(api('/admin/markets'), asAdmin(() => HttpResponse.json(adminMarkets()))),
  http.get(api('/admin/markets/:id'), asAdmin(({ params }) => {
    const m = adminMarkets().find((x) => x.id === params.id)
    if (!m) return fail(404, 'not_found', 'Market tidak ditemukan')
    return HttpResponse.json({ ...m, auctions: economy.auctions.filter((a) => a.marketId === m.id).map(adminAuction), audit: auditLog({ type: 'market', id: m.id }) })
  })),
  http.post(api('/admin/markets/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const m = economy.markets.find((x) => x.id === params.id)
    if (!m) return fail(404, 'not_found', 'Market tidak ditemukan')
    const { action, reason } = (await request.json()) as { action: MarketAction; reason?: string }
    const store = (admin.markets[m.id] ??= { flags: [], reports: [] })
    const label = `${m.code} · ${m.name}`
    if (action === 'review') {
      store.reviewedAt = now()
      saveAdmin()
      audit({ actor, action: 'Review market', entity: { type: 'market', id: m.id, label }, reason: reason?.trim() || undefined })
      return HttpResponse.json({ ok: true })
    }
    const err = reasonError(reason)
    if (err) return err
    if (action === 'flag') {
      store.flags.unshift({ id: newId('flg'), by: actor, label: reason!.trim(), at: now() })
      saveAdmin()
      audit({ actor, action: 'Flag market', entity: { type: 'market', id: m.id, label }, reason })
    } else if (action === 'suspend') {
      if (m.status === 'suspended') return fail(409, 'no_change', 'Market sudah disuspend')
      setMarketStatus(m.id, 'suspended', actor, reason!)
    } else {
      if (m.status !== 'suspended') return fail(409, 'no_change', 'Market tidak sedang disuspend')
      setMarketStatus(m.id, 'active', actor, reason!)
    }
    return HttpResponse.json({ ok: true })
  })),

  // Auction governance
  http.get(api('/admin/auctions'), asAdmin(() => HttpResponse.json(economy.auctions.map(adminAuction)))),
  http.get(api('/admin/auctions/:id'), asAdmin(({ params }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    const bids = ledger(a)
    const detail: AdminAuctionDetail = {
      ...toAuction(a), minStepIdr: a.minStepIdr, bids, findings: findings(a, bids),
      caseId: admin.alerts.find((al) => al.status === 'investigating' && al.subjects.some((s) => s.type === 'auction' && s.id === a.id))?.id,
      audit: auditLog({ type: 'auction', id: a.id }),
    }
    return HttpResponse.json(detail)
  })),
  http.post(api('/admin/auctions/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    const { action, reason, type } = (await request.json()) as { action: AuctionAction; reason?: string; type?: AlertType }
    const err = reasonError(reason)
    if (err) return err
    if (action === 'freeze') {
      if (!ACTIVE_AUCTION.includes(a.status)) return fail(409, 'not_active', 'Hanya auction yang belum ditutup yang bisa dibekukan')
      freezeAuction(a, actor, reason!)
      return HttpResponse.json({ ok: true })
    }
    if (action === 'unfreeze') {
      if (a.status !== 'frozen') return fail(409, 'not_frozen', 'Auction tidak sedang dibekukan')
      const prev = admin.frozen[a.id] ?? 'closed'
      // Time kept running while frozen: an expired live auction reopens as closed.
      a.status = (prev === 'live' || prev === 'extended') && new Date(a.endsAt).getTime() < Date.now() ? 'closed' : prev
      delete admin.frozen[a.id]
      saveAdmin()
      audit({ actor, action: 'Cabut freeze auction', entity: { type: 'auction', id: a.id, label: `${a.code} · ${a.title}` }, reason, changes: [{ field: 'status', before: 'frozen', after: a.status }] })
      return HttpResponse.json({ ok: true })
    }
    const al: FraudAlert = {
      id: newId('frd'), code: `FRD-${1040 + admin.alerts.length}`, type: type ?? 'bid_manipulation', source: 'manual', title: `Pemeriksaan ${a.code}: ${a.title}`,
      score: 0, confidence: 0, status: 'investigating', detectedAt: now(), subjects: [{ type: 'auction', id: a.id, label: `${a.code} · ${a.title}` }],
      evidence: findings(a, ledger(a)).map((f) => `${f.rule}: ${f.detail}`),
      investigation: { openedAt: now(), by: actor, notes: [{ at: now(), by: actor, text: reason!.trim() }] },
    }
    admin.alerts.unshift(al)
    saveAdmin()
    audit({ actor, action: `Buka kasus ${al.code}`, entity: alertEntity(al), reason })
    return HttpResponse.json({ caseId: al.id })
  })),

  // Disputes
  http.get(api('/admin/disputes'), asAdmin(() => HttpResponse.json(disputeCases().map(summary)))),
  http.get(api('/admin/disputes/:id'), asAdmin(({ params }) => {
    const c = disputeCases().find((x) => x.id === params.id)
    return c ? HttpResponse.json(c) : fail(404, 'not_found', 'Kasus tidak ditemukan')
  })),
  http.post(api('/admin/disputes/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const ref = caseRefs().find((x) => x.case.id === params.id)
    if (!ref) return fail(404, 'not_found', 'Kasus tidak ditemukan')
    const { case: c, tx, overlay } = ref
    const input = (await request.json()) as DisputeActionInput
    const next = disputeTransition(c.status, input.action)
    if (!next) return fail(409, 'invalid_transition', 'Aksi ini tidak tersedia untuk status kasus sekarang')
    const entity = { type: 'dispute' as const, id: c.id, label: `${c.code} · ${tx.title}` }
    const before = c.status

    if (input.action === 'request_evidence') {
      const err = reasonError(input.reason)
      if (err) return err
      overlay.timeline.push({ at: now(), by: actor, label: `Bukti diminta dari ${ROLE_LABEL[input.from]}: ${input.reason.trim()}` })
      notifyParties(c, input.from === 'both' ? ['buyer', 'supplier'] : [input.from], `${c.code}: Admin meminta bukti`, input.reason.trim())
    } else if (input.action === 'start_review') {
      overlay.timeline.push({ at: now(), by: actor, label: 'Review dimulai' })
    } else {
      const err = reasonError(input.reason)
      if (err) return err
      const r = input.resolution
      const invalid = validateResolution(tx.totalIdr, r)
      if (invalid) return fail(422, 'validation', invalid, { refundIdr: invalid })
      const out = resolveOutcome(tx.totalIdr, r)
      const changes = [{ field: 'status transaksi', before: tx.status, after: out.status }, { field: 'pembayaran', before: tx.payment.status, after: out.payment }]
      tx.status = out.status
      tx.payment.status = out.payment
      tx.updatedAt = now()
      if (out.status === 'completed') Object.assign(tx.timeline.find((s) => s.status === 'completed') ?? {}, { at: now(), note: `Putusan dispute: ${out.note}` })
      overlay.resolution = { ...r, refundIdr: out.refundIdr, releaseIdr: out.releaseIdr, reason: input.reason.trim(), at: now(), by: actor }
      overlay.timeline.push({ at: now(), by: actor, label: `Diputuskan: ${out.note}` })
      tx.dispute!.status = next
      ref.save()
      audit({ actor, action: `Putuskan dispute (${{ refund: 'refund penuh', release: 'lepas dana', partial: 'refund sebagian' }[r.kind]})`, entity, reason: input.reason, changes: [{ field: 'status kasus', before, after: next }, ...changes] })
      notifyParties(c, ['buyer', 'supplier'], `${c.code} diputuskan`, out.note)
      return HttpResponse.json(caseRefs().find((x) => x.case.id === c.id)!.case)
    }
    tx.dispute!.status = next
    ref.save()
    audit({ actor, action: input.action === 'request_evidence' ? 'Minta bukti dispute' : 'Mulai review dispute', entity, reason: input.reason?.trim() || undefined, changes: before === next ? undefined : [{ field: 'status kasus', before, after: next }] })
    return HttpResponse.json(caseRefs().find((x) => x.case.id === c.id)!.case)
  })),

  // Fraud detection
  http.get(api('/admin/alerts'), asAdmin(() => HttpResponse.json([...admin.alerts].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))))),
  http.get(api('/admin/alerts/:id'), asAdmin(({ params }) => {
    const al = admin.alerts.find((x) => x.id === params.id)
    return al ? HttpResponse.json({ ...al, audit: auditLog().filter((e) => e.action.includes(al.code)) }) : fail(404, 'not_found', 'Alert tidak ditemukan')
  })),
  http.post(api('/admin/alerts/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const al = admin.alerts.find((x) => x.id === params.id)
    if (!al) return fail(404, 'not_found', 'Alert tidak ditemukan')
    const input = (await request.json()) as AlertActionInput
    if (input.action === 'investigate') {
      if (al.status !== 'new') return fail(409, 'invalid_state', 'Alert ini sudah ditangani')
      al.status = 'investigating'
      al.investigation = { openedAt: now(), by: actor, notes: [] }
      saveAdmin()
      audit({ actor, action: `Buka investigasi ${al.code} (${ALERT_LABEL[al.type]})`, entity: alertEntity(al), changes: [{ field: 'status alert', before: 'new', after: 'investigating' }] })
      return HttpResponse.json(al)
    }
    // Everything below is only possible on an open case.
    if (al.status !== 'investigating' || !al.investigation) return fail(409, 'no_case', 'Buka investigasi dulu sebelum mengambil tindakan')
    if (input.action === 'note') {
      if (!input.text?.trim()) return fail(422, 'validation', 'Catatan kosong', { text: 'Tulis catatan' })
      al.investigation.notes.push({ at: now(), by: actor, text: input.text.trim() })
      saveAdmin()
      audit({ actor, action: `Catatan ${al.code}: ${input.text.trim()}`, entity: alertEntity(al) })
      return HttpResponse.json(al)
    }
    const err = reasonError(input.reason)
    if (err) return err
    if (input.action === 'escalate') {
      const subject = al.subjects.find((s) => s.id === input.subjectId)
      const allowed: Record<string, EscalationAction[]> = { user: ['suspend_user', 'restrict_user'], auction: ['freeze_auction'], market: ['suspend_market'] }
      if (!subject || !allowed[subject.type].includes(input.escalation)) return fail(422, 'validation', 'Pilih subjek dan tindakan yang sesuai', { subjectId: 'Tindakan tidak cocok untuk subjek ini' })
      const via = al.code
      if (subject.type === 'user') {
        const u = users().find((x) => x.id === subject.id)
        if (!u) return fail(404, 'not_found', 'Pengguna tidak ditemukan')
        setUserStatus(u, input.escalation === 'suspend_user' ? 'suspended' : 'restricted', actor, input.reason, via)
      } else if (subject.type === 'auction') {
        const a = economy.auctions.find((x) => x.id === subject.id)!
        if (!ACTIVE_AUCTION.includes(a.status)) return fail(409, 'not_active', 'Auction ini sudah tidak aktif; tidak bisa dibekukan')
        freezeAuction(a, actor, input.reason, via)
      } else {
        setMarketStatus(subject.id, 'suspended', actor, input.reason, via)
      }
      const outcome = `${{ suspend_user: 'Suspend', restrict_user: 'Batasi', freeze_auction: 'Freeze', suspend_market: 'Suspend' }[input.escalation]} ${subject.label}`
      al.status = 'escalated'
      al.resolution = { at: now(), by: actor, outcome, reason: input.reason.trim() }
      saveAdmin()
      audit({ actor, action: `Eskalasi ${al.code}: ${outcome}`, entity: alertEntity(al), reason: input.reason, changes: [{ field: 'status alert', before: 'investigating', after: 'escalated' }] })
      return HttpResponse.json(al)
    }
    const to = input.action === 'dismiss' ? 'dismissed' : 'closed'
    al.status = to
    al.resolution = { at: now(), by: actor, outcome: to === 'dismissed' ? 'Ditolak: bukan pelanggaran' : 'Ditutup tanpa tindakan', reason: input.reason.trim() }
    saveAdmin()
    audit({ actor, action: `${to === 'dismissed' ? 'Dismiss' : 'Tutup'} ${al.code}`, entity: alertEntity(al), reason: input.reason, changes: [{ field: 'status alert', before: 'investigating', after: to }] })
    return HttpResponse.json(al)
  })),

  // Audit trail
  // Manual payouts: the admin transfers by hand, then records it here.
  http.get(api('/admin/withdrawals'), asAdmin(({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const rows = allWithdrawals().filter(({ w }) => !status || w.status === status).map(({ userId, w }) => adminWithdrawal(userId, w))
    rows.sort((a, b) => (status === 'processing' ? 1 : -1) * a.requestedAt.localeCompare(b.requestedAt))
    return HttpResponse.json(rows.slice(0, 500))
  })),
  http.get(api('/admin/withdrawals/:id'), asAdmin(({ params, actor }) => {
    const found = allWithdrawals().find(({ w }) => w.id === params.id)
    if (!found) return fail(404, 'not_found', 'Pencairan tidak ditemukan')
    const { userId, w } = found
    const base = adminWithdrawal(userId, w)
    const u = db.users.find((x) => x.id === userId)
    const ktp = admin.verifications.find((v) => v.kind === 'personal' && v.status === 'approved' && v.owner === u?.name)?.business
    const detail: AdminWithdrawalDetail = {
      ...base, identityName: ktp, nameMismatch: !!ktp && normName(ktp) !== normName(w.bank.holder),
      recent: allWithdrawals().filter((x) => x.userId === userId && x.w.id !== w.id).map((x) => adminWithdrawal(userId, x.w))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 10),
    }
    if (w.status === 'processing') {
      detail.accountNo = w.bank.accountNo
      audit({ actor, action: `Melihat nomor rekening ${w.code}`, entity: { type: 'user', id: userId, label: base.requester.name } })
    }
    return HttpResponse.json(detail)
  })),
  http.post(api('/admin/withdrawals/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const found = allWithdrawals().find(({ w }) => w.id === params.id)
    if (!found) return fail(404, 'not_found', 'Pencairan tidak ditemukan')
    const { userId, w } = found
    if (w.status !== 'processing') return fail(409, 'decided', 'Pencairan ini sudah diproses')
    const body = (await request.json()) as WithdrawalActionInput
    const dest = `${w.bank.bank} ••${w.bank.accountNo.slice(-4)}`
    const entity = { type: 'user' as const, id: userId, label: db.users.find((x) => x.id === userId)?.name ?? userId }
    if (body.action === 'mark_paid') {
      const ref = body.transferRef?.trim() ?? ''
      const fields: Record<string, string> = {}
      if (!ref) fields.transferRef = 'Isi nomor referensi transfer'
      else if (ref.length > 100) fields.transferRef = 'Maksimal 100 karakter'
      if (body.paidAt && body.paidAt > new Date(Date.now() + 5 * 60_000).toISOString()) fields.paidAt = 'Waktu transfer tidak boleh di masa depan'
      else if (body.paidAt && body.paidAt < w.at) fields.paidAt = 'Waktu transfer sebelum pengajuan'
      if (Object.keys(fields).length) return fail(422, 'validation', 'Data transfer belum lengkap', fields)
      decideWithdrawal(w, { status: 'paid', transferRef: ref, paidAt: body.paidAt ?? now(), note: body.note?.trim() || undefined, decidedAt: now(), decidedBy: actor })
      audit({ actor, action: `Tandai pencairan ${w.code} dibayar`, entity, changes: [{ field: 'status', before: 'processing', after: 'paid' }, { field: 'Ref transfer', after: ref }] })
      notify(userId, { type: 'payment', title: `Dana ${formatIdr(w.amountIdr)} sudah ditransfer ke ${dest}`, body: `Ref transfer ${ref}`, href: '/app/finance' })
    } else if (body.action === 'reject') {
      const err = reasonError(body.reason)
      if (err) return err
      const reason = body.reason.trim()
      decideWithdrawal(w, { status: 'rejected', reason, decidedAt: now(), decidedBy: actor })
      audit({ actor, action: `Tolak pencairan ${w.code}`, entity, reason, changes: [{ field: 'status', before: 'processing', after: 'rejected' }] })
      notify(userId, { type: 'payment', title: `Pencairan ${formatIdr(w.amountIdr)} ditolak`, body: `${reason} Dana sudah kembali ke saldo yang bisa ditarik.`, href: '/app/finance' })
    } else {
      return fail(422, 'validation', 'Aksi tidak dikenal', { action: 'Pilih mark_paid atau reject' })
    }
    return HttpResponse.json(adminWithdrawal(userId, w))
  })),

  http.get(api('/admin/audit'), asAdmin(() => HttpResponse.json(auditLog()))),
]
