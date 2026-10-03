import { delay, http, HttpResponse } from 'msw'
import type { AllocationLine, AuctionDetail, AuditEntry, CategoryId } from '@/domain/types'
import { allowedActions, transition, type TransactionAction } from '@/domain/transaction'
import { CATEGORIES } from '@/domain/catalog'
import {
  approvalState, approverUserIds, auctionValue, can, canApprove, deniedReason, higherWins, inventoryFromCsv, orgAuctionStatus, pipelineCounts, procurementActions,
  requiredApprovers, scoreOf, statusAfterApproval, txDeniedReason, type Action, type Approval, type ApprovalRule, type InventoryItem, type LotOffer, type Module,
  type OrgAnalytics, type OrgAuction, type OrgAuctionEvaluation, type OrgAuctionInput, type OrgAuctionView, type OrgOverview, type OrgProfile,
  type OrgSettings, type OrgSupplier, type ProcurementAction, type ProcurementInput, type ProcurementRequest, type SupplierAction,
  type SupplierDetail, type WaitingItem,
} from '@/domain/org'
import { formatIdr } from '@/domain/format'
import { db } from './db'
import { economy } from './economy'
import { notify } from './personal'
import { SUPPLIERS, lotAuction, makeTx, newId, org, orgAudit, pools, saveOrg, supplierById, type HistoryRow, type OrgData, type StoredPool } from './org'

const api = (path: string) => `/api/v1/orgs/:orgId${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) => HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

interface Ctx {
  userId: string
  orgId: string
  o: OrgData
  role: string
  roleLabel: string
  /** "Ajar Pratama (Owner)" for audit entries. */
  actor: string
  allowed: (m: Module, a: Action) => boolean
  params: Record<string, string | readonly string[] | undefined>
  request: Request
}

/** Session + membership of the org in the URL (401 / 403 otherwise). */
const orgAuthed = (fn: (ctx: Ctx) => Response | Promise<Response>) =>
  async ({ params, request }: { params: Ctx['params']; request: Request }) => {
    await delay(250)
    const user = db.users.find((u) => u.id === db.sessionUserId)
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    const orgId = String(params.orgId)
    const membership = user.orgs.find((m) => m.orgId === orgId)
    if (!membership) return fail(403, 'forbidden', 'Kamu bukan anggota organisasi ini')
    const o = org(orgId)
    const role = membership.role
    const roleLabel = o.settings.roles.find((r) => r.id === role)?.label ?? role
    return fn({ userId: user.id, orgId, o, role, roleLabel, actor: `${user.name} (${roleLabel})`, allowed: (m, a) => can(o.settings.permissions, role, m, a), params, request })
  }

const deny = (c: Ctx, m: Module, a: Action) => fail(403, 'forbidden', deniedReason(c.roleLabel, m, a))
const body = async <T>(r: Request) => (await r.json()) as T
const roleLabelOf = (o: OrgData, role: string) => o.settings.roles.find((r) => r.id === role)?.label ?? role

// ── Auctions ↔ economy ───────────────────────────────────────────

function lotAuctions(oa: OrgAuction) {
  return oa.lots.map((l) => economy.auctions.find((a) => a.id === l.auctionId)).filter((a): a is AuctionDetail => !!a)
}

function toView(oa: OrgAuction): OrgAuctionView {
  const live = lotAuctions(oa).map((a) => ({
    auctionId: a.id, status: a.status, bidCount: a.bidCount, participants: a.participants, endsAt: a.endsAt,
    bestPriceIdr: a.type === 'sealed' && (a.status === 'live' || a.status === 'extended') ? undefined : economy.bestPrice.get(a.id),
  }))
  return { ...oa, status: orgAuctionStatus(oa, live.map((l) => l.status)), live }
}

function goLive(o: OrgData, oa: OrgAuction) {
  oa.lots.forEach((lot, i) => {
    const a = lotAuction(o.settings.profile.name, oa, lot, i)
    economy.auctions.unshift(a)
    economy.owners.set(a.id, o.ownerUserId)
    economy.bestPrice.set(a.id, a.openingPriceIdr)
    lot.auctionId = a.id
    o.economyAuctions.push(a)
  })
  oa.status = lotAuctions(oa).every((a) => a.status === 'scheduled') ? 'scheduled' : 'live'
  const p = o.procurements.find((r) => r.id === oa.procurementId)
  if (p) Object.assign(p, { status: 'in_auction', auctionId: oa.id, updatedAt: now() })
}

// ponytail: the realtime mock has no scheduled → live step, so org lots start here; a BE scheduler replaces this.
setInterval(() => {
  for (const a of economy.auctions) if (a.status === 'scheduled' && a.id.startsWith('oau-') && new Date(a.startsAt).getTime() <= Date.now()) a.status = 'live'
}, 5_000)

/** One offer per bidder (their best price for the org: lowest when buying, highest when selling), mapped onto the supplier directory for scoring. */
function lotOffers(a: AuctionDetail, categoryId: CategoryId, higher: boolean): LotOffer[] {
  const better = (x: number, y: number) => (higher ? x > y : x < y)
  const list = SUPPLIERS.filter((s) => s.categories.includes(categoryId))
  const dir = SUPPLIERS.length && list.length >= 3 ? list : SUPPLIERS
  const best = new Map<string, { priceIdr: number; at: string }>()
  if (a.bids.length) {
    for (const b of a.bids) {
      const prev = best.get(b.bidder)
      if (!prev || better(b.priceIdr, prev.priceIdr)) best.set(b.bidder, { priceIdr: b.priceIdr, at: b.at })
    }
  } else {
    // Hidden bids (sealed / rank only) aren't kept by the mock; the owner sees a plausible ladder behind the best price.
    const top = economy.bestPrice.get(a.id) ?? a.openingPriceIdr
    for (let k = 0; k < Math.min(a.bidCount, 6); k++) best.set(`Supplier ${k + 1}`, { priceIdr: Math.round(top * (1 + (higher ? -1 : 1) * k * 0.012)), at: a.endsAt })
  }
  const bySupplier = new Map<string, LotOffer>()
  for (const [bidder, b] of best) {
    const n = Number(bidder.match(/\d+/)?.[0] ?? hash(bidder))
    const s = dir[(n - 1 + dir.length) % dir.length]
    const card = s.scorecard[s.scorecard.length - 1]
    const offer: LotOffer = {
      id: `${a.id}-${bidder}`, supplierId: s.id, priceIdr: b.priceIdr, submittedAt: b.at,
      supplier: { name: s.name, kind: 'business', verified: s.verified, reputation: scoreOf(card) },
      capacity: { value: Math.round(a.lot.quantity.value * (0.35 + (hash(bidder + a.id) % 50) / 100)), unit: a.lot.quantity.unit },
      quality: card.quality, delivery: card.delivery, reliability: card.reliability,
    }
    const prev = bySupplier.get(s.id)
    if (!prev || better(offer.priceIdr, prev.priceIdr)) bySupplier.set(s.id, offer)
  }
  return [...bySupplier.values()].sort((x, y) => (higher ? y.priceIdr - x.priceIdr : x.priceIdr - y.priceIdr))
}

// ── Approvals ────────────────────────────────────────────────────

type Approvable = { status: string; requiredApprovers: string[]; approvals: Approval[] }

function settle(o: OrgData, kind: 'procurement' | 'auction', target: Approvable & { id: string }) {
  if (kind === 'procurement') {
    target.status = statusAfterApproval(target.requiredApprovers, target.approvals)
    return
  }
  const s = approvalState(target.requiredApprovers, target.approvals)
  if (s.approved) goLive(o, target as OrgAuction)
  if (!s.rejected) return
  target.status = 'rejected'
  // A rejected auction hands its procurement back so it can be re-run or sourced another way.
  const p = o.procurements.find((r) => r.auctionId === target.id && r.status === 'in_auction')
  if (p) Object.assign(p, { status: 'approved', auctionId: undefined, updatedAt: now() })
}

/** In-app notification for every teammate whose sign-off is still needed (PRD §9.2). */
function askApprovers(c: Ctx, kind: 'procurement' | 'auction', target: Approvable & { id: string; code: string }, title: string, valueIdr: number) {
  const members = db.users.flatMap((u) => u.orgs.filter((m) => m.orgId === c.orgId).map((m) => ({ userId: u.id, role: m.role })))
  const href = kind === 'procurement' ? `/org/${c.orgId}/procurement/${target.id}` : `/org/${c.orgId}/auctions?review=${target.id}`
  for (const userId of approverUserIds(target.requiredApprovers, target.approvals, members, c.userId)) {
    notify(userId, {
      type: 'transaction_update', title: `Perlu approval kamu: ${target.code}`,
      body: `${c.actor} mengajukan ${kind === 'procurement' ? 'procurement' : 'auction'} "${title}" senilai ${formatIdr(valueIdr)}.`, href,
    })
  }
}

function decide(c: Ctx, kind: 'procurement' | 'auction', target: Approvable & { id: string; code: string }, decision: 'approved' | 'rejected', note?: string) {
  if (!canApprove(c.role, target.requiredApprovers, target.approvals)) return fail(403, 'forbidden', `Approval ini tidak menunggu peran ${c.roleLabel}`)
  if (decision === 'rejected' && !note?.trim()) return fail(422, 'validation', 'Tulis alasan penolakan', { note: 'Alasan wajib diisi saat menolak' })
  target.approvals.push({ role: c.role, by: c.actor, at: now(), decision, note: note?.trim() || undefined })
  settle(c.o, kind, target)
  orgAudit(c.o, { actor: c.actor, action: `${decision === 'approved' ? 'Approve' : 'Tolak'} ${kind}`, entity: { type: kind, id: target.id, label: target.code }, reason: decision === 'rejected' ? note : undefined })
  return null
}

// ── Suppliers ────────────────────────────────────────────────────

function orgSuppliers(o: OrgData): OrgSupplier[] {
  return SUPPLIERS.map((s) => {
    const rel = o.suppliers[s.id]
    const txs = o.transactions.filter((t) => t.supplierId === s.id)
    const hist = o.history.filter((h) => h.supplierId === s.id)
    return {
      ...s, relation: rel?.relation ?? 'none', myRating: rel?.myRating, transactions: txs.length + hist.length,
      spendIdr: txs.reduce((x, t) => x + t.totalIdr, 0) + hist.reduce((x, h) => x + h.unitPriceIdr * h.quantity.value, 0),
    }
  })
}

// ── Pools ────────────────────────────────────────────────────────

const viewPool = (p: StoredPool, orgId: string) => ({
  ...p,
  members: p.members.map(({ orgId: owner, ...m }, i) => (owner === orgId ? { ...m, mine: true } : m.optIn ? m : { ...m, name: `Bisnis lain #${i + 1}` })),
})

function joinPool(o: OrgData, orgId: string, p: StoredPool, quantity: number, optIn: boolean) {
  const mine = p.members.find((m) => m.orgId === orgId)
  if (mine) Object.assign(mine, { quantity, optIn })
  else p.members.push({ name: o.settings.profile.name, quantity, optIn, orgId })
}

// ── Analytics ────────────────────────────────────────────────────

/** Seeded purchase history plus every procurement auction awarded since, oldest month first (PRD §9.9). */
function purchases(o: OrgData): HistoryRow[] {
  const awarded = o.auctions.flatMap((a) => {
    if (!a.award || a.objective === 'selling') return []
    const { award } = a
    return award.lines.flatMap((lot, i) => lot.flatMap((l, k): HistoryRow[] => {
      const s = SUPPLIERS.find((x) => x.name === l.supplier)
      const def = a.lots[i]
      if (!s || !def) return []
      return [{
        code: `${award.poNumber ?? a.code}-${i + 1}${lot.length > 1 ? String.fromCharCode(97 + k) : ''}`, month: award.at.slice(0, 7), item: def.item,
        categoryId: a.categoryId, supplierId: s.id, quantity: { value: l.quantity, unit: def.quantity.unit }, unitPriceIdr: l.priceIdr,
        // ponytail: the lot's target price stands in for budget and market until awards carry a market reference.
        budgetUnitIdr: def.reservePriceIdr, marketUnitIdr: def.reservePriceIdr, via: 'auction',
        bidders: economy.auctions.find((x) => x.id === def.auctionId)?.participants, openingIdr: def.reservePriceIdr,
      }]
    }))
  })
  return [...o.history, ...awarded].sort((a, b) => a.month.localeCompare(b.month))
}

function analytics(o: OrgData, months: number, category?: string): OrgAnalytics {
  const all = purchases(o)
  const keys = [...new Set(all.map((h) => h.month))].sort().slice(-months)
  const rows = all.filter((h) => keys.includes(h.month) && (!category || h.categoryId === category))
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
  const total = (h: (typeof rows)[number]) => h.unitPriceIdr * h.quantity.value
  const cats = [...new Set(rows.map((h) => h.categoryId))].sort((a, b) => o.settings.profile.categories.indexOf(a) - o.settings.profile.categories.indexOf(b))
  const items = [...new Set(rows.map((h) => h.item))]
  const top = items.sort((a, b) => sum(rows.filter((h) => h.item === b), total) - sum(rows.filter((h) => h.item === a), total))[0]
  const topRows = rows.filter((h) => h.item === top)
  const firstTop = topRows[0]
  return {
    categories: cats,
    spend: keys.map((month) => ({ month, ...Object.fromEntries(cats.map((c) => [c, sum(rows.filter((h) => h.month === month && h.categoryId === c), total)])) })),
    savings: keys.map((month) => {
      const m = rows.filter((h) => h.month === month)
      return { month, spendIdr: sum(m, total), budgetIdr: sum(m, (h) => h.budgetUnitIdr * h.quantity.value), marketIdr: sum(m, (h) => h.marketUnitIdr * h.quantity.value) }
    }),
    unitPrices: items.map((item) => {
      const r = rows.filter((h) => h.item === item)
      const qty = sum(r, (h) => h.quantity.value)
      return { item, unit: r[0].quantity.unit, avgIdr: Math.round(sum(r, total) / qty), marketIdr: Math.round(sum(r, (h) => h.marketUnitIdr * h.quantity.value) / qty) }
    }),
    priceTrend: {
      item: top ?? '',
      points: keys.flatMap((month) => {
        const h = topRows.find((x) => x.month === month)
        return h && firstTop ? [{ month, ours: Math.round((h.unitPriceIdr / firstTop.unitPriceIdr) * 1000) / 10, market: Math.round((h.marketUnitIdr / firstTop.marketUnitIdr) * 1000) / 10 }] : []
      }),
    },
    demand: {
      item: top ?? '', unit: firstTop?.quantity.unit ?? '',
      points: keys.map((month) => ({ month, quantity: sum(topRows.filter((h) => h.month === month), (h) => h.quantity.value), requests: rows.filter((h) => h.month === month).length })),
    },
    suppliers: [...new Set(rows.map((h) => h.supplierId))].map((id) => {
      const s = supplierById(id)!
      const card = s.scorecard[s.scorecard.length - 1]
      return { id, name: s.name, score: scoreOf(card), onTime: card.delivery / 100, spendIdr: sum(rows.filter((h) => h.supplierId === id), total) }
    }).sort((a, b) => b.spendIdr - a.spendIdr),
    auctions: rows.filter((h) => h.via === 'auction').slice(-8).reverse().map((h) => ({ code: h.code, title: `${h.item} · ${h.month}`, bidders: h.bidders ?? 0, openingIdr: h.openingIdr ?? h.marketUnitIdr, clearingIdr: h.unitPriceIdr })),
    history: [...rows].reverse().map((h) => ({ code: h.code, month: h.month, item: h.item, categoryId: h.categoryId, supplier: supplierById(h.supplierId)?.name ?? h.supplierId, quantity: h.quantity, unitPriceIdr: h.unitPriceIdr, totalIdr: total(h), via: h.via })),
  }
}

const ACTION_NOTE: Record<TransactionAction, string> = {
  issue_invoice: 'Invoice diterbitkan', pay: 'Dana masuk escrow', ship: 'Barang dikirim', upload_proof: 'Bukti pengiriman diunggah',
  confirm_receipt: 'Diterima, dana dilepas', cancel: 'Dibatalkan', dispute: 'Dispute diajukan',
}
const NPWP = /^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACTIVE_PROCUREMENT = ['pending_approval', 'approved', 'published', 'in_auction', 'in_collective']

// ── Handlers ─────────────────────────────────────────────────────

export const orgHandlers = [
  http.get(api(''), orgAuthed(({ o }) => HttpResponse.json(o.settings))),

  // Overview (PRD §9.1)
  http.get(api('/overview'), orgAuthed(({ o, role }) => {
    const month = new Date().toISOString().slice(0, 7)
    const thisMonth = purchases(o).filter((h) => h.month === month)
    const views = o.auctions.map(toView)
    const waiting: WaitingItem[] = [
      ...o.procurements.filter((r) => r.status === 'pending_approval' && canApprove(role, r.requiredApprovers, r.approvals))
        .map((r) => ({ kind: 'procurement' as const, id: r.id, code: r.code, title: r.need, valueIdr: r.budgetIdr, href: `procurement/${r.id}` })),
      ...o.auctions.filter((a) => a.status === 'pending_approval' && canApprove(role, a.requiredApprovers, a.approvals))
        .map((a) => ({ kind: 'auction' as const, id: a.id, code: a.code, title: a.title, valueIdr: a.valueIdr, href: `auctions?review=${a.id}` })),
    ]
    const overview: OrgOverview = {
      stats: {
        spendMonthIdr: thisMonth.reduce((s, h) => s + h.unitPriceIdr * h.quantity.value, 0),
        savingsMonthIdr: thisMonth.reduce((s, h) => s + (h.budgetUnitIdr - h.unitPriceIdr) * h.quantity.value, 0),
        savingsTargetIdr: o.savingsTargetIdr,
        activeProcurement: o.procurements.filter((r) => ACTIVE_PROCUREMENT.includes(r.status)).length,
        activeAuctions: views.filter((a) => a.status === 'live' || a.status === 'scheduled').length,
        activeSuppliers: Object.values(o.suppliers).filter((s) => s.relation === 'verified').length,
        runningTransactions: o.transactions.filter((t) => !['completed', 'cancelled'].includes(t.status)).length,
      },
      waiting,
      pipeline: pipelineCounts(o.procurements.map((r) => r.status)),
      activity: o.activity.slice(0, 12),
    }
    return HttpResponse.json(overview)
  })),

  // Profile (PRD §9.2)
  http.put(api('/profile'), orgAuthed(async (c) => {
    if (!c.allowed('profile', 'manage')) return deny(c, 'profile', 'manage')
    const next = await body<OrgProfile>(c.request)
    const fields: Record<string, string> = {}
    if (!next.name?.trim()) fields.name = 'Nama perusahaan wajib diisi'
    if (next.legal.npwp && !NPWP.test(next.legal.npwp)) fields.npwp = 'Format NPWP: 00.000.000.0-000.000'
    if (next.legal.nib && !/^\d{13}$/.test(next.legal.nib)) fields.nib = 'NIB terdiri dari 13 digit'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa kembali isian profil', fields)
    const prev = c.o.settings.profile
    const flat = (p: OrgProfile): Record<string, string> => ({
      Nama: p.name, Industri: p.industry, Lokasi: p.location, NIB: p.legal.nib, NPWP: p.legal.npwp, Akta: p.legal.akta, Deskripsi: p.description,
      Kategori: p.categories.map((x) => CATEGORIES[x].label).join(', '), 'Jam operasional': `${p.hours.days.length} hari · ${p.hours.from}–${p.hours.to}`,
    })
    const before = flat(prev)
    const after = flat(next)
    const changes = Object.keys(after).filter((k) => before[k] !== after[k]).map((field) => ({ field, before: before[field] || undefined, after: after[field] || undefined }))
    c.o.settings.profile = { ...next, documents: prev.documents, verification: prev.verification }
    orgAudit(c.o, { actor: c.actor, action: 'Ubah profil bisnis', entity: { type: 'business', id: c.orgId, label: next.name }, changes })
    return HttpResponse.json(c.o.settings.profile)
  })),
  http.post(api('/profile/documents'), orgAuthed(async (c) => {
    if (!c.allowed('profile', 'manage')) return deny(c, 'profile', 'manage')
    const { name, kind } = await body<{ name: string; kind: OrgProfile['documents'][number]['kind'] }>(c.request)
    if (!name) return fail(422, 'validation', 'Pilih file', { file: 'Pilih file dokumen' })
    const p = c.o.settings.profile
    p.documents = [...p.documents.filter((d) => d.kind === 'other' || d.kind !== kind), { name, kind, uploadedAt: now() }]
    orgAudit(c.o, { actor: c.actor, action: 'Unggah dokumen verifikasi', entity: { type: 'business', id: c.orgId, label: name } })
    return HttpResponse.json(p)
  })),
  http.post(api('/profile/verification'), orgAuthed((c) => {
    if (!c.allowed('profile', 'manage')) return deny(c, 'profile', 'manage')
    const p = c.o.settings.profile
    const missing = (['nib', 'npwp', 'akta'] as const).filter((k) => !p.documents.some((d) => d.kind === k))
    if (missing.length) return fail(422, 'validation', `Dokumen belum lengkap: ${missing.map((m) => m.toUpperCase()).join(', ')}`)
    const before = p.verification
    p.verification = 'pending'
    orgAudit(c.o, { actor: c.actor, action: 'Ajukan verifikasi bisnis', entity: { type: 'business', id: c.orgId, label: p.name }, changes: [{ field: 'Verifikasi', before, after: 'pending' }] })
    return HttpResponse.json(p)
  })),

  // Team (PRD §9.2)
  http.get(api('/team'), orgAuthed(({ o }) => HttpResponse.json({ ...o.settings, members: o.members.map(({ userId: _u, ...m }) => m) }))),
  http.post(api('/team/invite'), orgAuthed(async (c) => {
    if (!c.allowed('team', 'manage')) return deny(c, 'team', 'manage')
    const { email, role, department } = await body<{ email: string; role: string; department: string }>(c.request)
    const e = email?.trim().toLowerCase() ?? ''
    if (!EMAIL.test(e)) return fail(422, 'validation', 'Email tidak valid', { email: 'Masukkan email yang valid' })
    if (c.o.members.some((m) => m.email === e)) return fail(409, 'exists', 'Sudah anggota', { email: 'Email ini sudah ada di tim' })
    if (!c.o.settings.roles.some((r) => r.id === role)) return fail(422, 'validation', 'Pilih peran', { role: 'Pilih peran' })
    c.o.members.push({ id: newId('mem'), name: e, email: e, role, department, status: 'invited', joinedAt: now() })
    orgAudit(c.o, { actor: c.actor, action: 'Undang anggota', entity: { type: 'user', id: e, label: e }, changes: [{ field: 'Peran', after: roleLabelOf(c.o, role) }] })
    return new HttpResponse(null, { status: 204 })
  })),
  http.patch(api('/team/members/:memberId'), orgAuthed(async (c) => {
    if (!c.allowed('team', 'manage')) return deny(c, 'team', 'manage')
    const m = c.o.members.find((x) => x.id === c.params.memberId)
    if (!m) return fail(404, 'not_found', 'Anggota tidak ditemukan')
    const patch = await body<{ role?: string; department?: string }>(c.request)
    if (m.role === 'owner' && patch.role && patch.role !== 'owner' && c.o.members.filter((x) => x.role === 'owner').length < 2)
      return fail(409, 'last_owner', 'Organisasi butuh minimal satu Owner', { role: 'Tunjuk Owner lain dulu' })
    const changes = [
      ...(patch.role && patch.role !== m.role ? [{ field: 'Peran', before: roleLabelOf(c.o, m.role), after: roleLabelOf(c.o, patch.role) }] : []),
      ...(patch.department !== undefined && patch.department !== m.department ? [{ field: 'Departemen', before: m.department, after: patch.department }] : []),
    ]
    Object.assign(m, patch)
    orgAudit(c.o, { actor: c.actor, action: 'Ubah anggota', entity: { type: 'user', id: m.id, label: m.name }, changes })
    return new HttpResponse(null, { status: 204 })
  })),
  http.delete(api('/team/members/:memberId'), orgAuthed((c) => {
    if (!c.allowed('team', 'manage')) return deny(c, 'team', 'manage')
    const m = c.o.members.find((x) => x.id === c.params.memberId)
    if (!m) return fail(404, 'not_found', 'Anggota tidak ditemukan')
    if (m.userId === c.userId) return fail(409, 'self', 'Kamu tidak bisa mengeluarkan dirimu sendiri')
    if (m.role === 'owner' && c.o.members.filter((x) => x.role === 'owner').length < 2) return fail(409, 'last_owner', 'Organisasi butuh minimal satu Owner')
    c.o.members = c.o.members.filter((x) => x !== m)
    orgAudit(c.o, { actor: c.actor, action: 'Keluarkan anggota', entity: { type: 'user', id: m.id, label: m.name } })
    return new HttpResponse(null, { status: 204 })
  })),
  http.put(api('/team/settings'), orgAuthed(async (c) => {
    if (!c.allowed('team', 'manage')) return deny(c, 'team', 'manage')
    const next = await body<Pick<OrgSettings, 'roles' | 'permissions' | 'departments' | 'approvalRules'>>(c.request)
    const fields: Record<string, string> = {}
    next.approvalRules.forEach((r: ApprovalRule, i) => {
      if (!r.label.trim()) fields[`rule-${i}`] = 'Beri nama aturan'
      else if (!(r.minAmountIdr >= 0)) fields[`rule-${i}`] = 'Ambang harus angka ≥ 0'
      else if (!r.approvers.length) fields[`rule-${i}`] = 'Pilih minimal satu approver'
    })
    if (next.roles.some((r) => !r.label.trim())) fields.roles = 'Nama peran tidak boleh kosong'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa pengaturan tim', fields)
    const s = c.o.settings
    const ruleText = (rs: ApprovalRule[]) => rs.map((r) => `${r.label}: ${r.approvers.map((a) => roleLabelOf(c.o, a)).join(' + ')}`).join('; ')
    const changes = [
      ...(JSON.stringify(s.roles) !== JSON.stringify(next.roles) ? [{ field: 'Peran', before: s.roles.map((r) => r.label).join(', '), after: next.roles.map((r) => r.label).join(', ') }] : []),
      ...(JSON.stringify(s.permissions) !== JSON.stringify(next.permissions) ? [{ field: 'Matriks izin', after: 'diperbarui' }] : []),
      ...(JSON.stringify(s.departments) !== JSON.stringify(next.departments) ? [{ field: 'Departemen', before: s.departments.join(', '), after: next.departments.join(', ') }] : []),
      ...(JSON.stringify(s.approvalRules) !== JSON.stringify(next.approvalRules) ? [{ field: 'Aturan approval', before: ruleText(s.approvalRules), after: ruleText(next.approvalRules) }] : []),
    ]
    Object.assign(s, next)
    orgAudit(c.o, { actor: c.actor, action: 'Ubah pengaturan tim', entity: { type: 'rule', id: c.orgId, label: s.profile.name }, changes })
    return HttpResponse.json(s)
  })),

  // Inventory (PRD §9.3)
  http.get(api('/inventory'), orgAuthed(({ o }) => HttpResponse.json(o.inventory))),
  http.post(api('/inventory/items'), orgAuthed(async (c) => {
    if (!c.allowed('inventory', 'create')) return deny(c, 'inventory', 'create')
    const item = await body<Omit<InventoryItem, 'id'>>(c.request)
    const fields: Record<string, string> = {}
    if (!item.name?.trim()) fields.name = 'Nama item wajib diisi'
    if (typeof item.quantity?.value !== 'number' || !(item.quantity.value >= 0)) fields.quantity = 'Jumlah harus angka ≥ 0'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa isian item', fields)
    c.o.inventory.items.unshift({ ...item, id: newId('inv') })
    orgAudit(c.o, { actor: c.actor, action: 'Tambah item inventory', entity: { type: 'business', id: c.orgId, label: item.name } })
    return new HttpResponse(null, { status: 201 })
  })),
  http.post(api('/inventory/import'), orgAuthed(async (c) => {
    if (!c.allowed('inventory', 'create')) return deny(c, 'inventory', 'create')
    const { items, fileName } = await body<{ items: Omit<InventoryItem, 'id'>[]; fileName: string }>(c.request)
    // Re-validate server side: never trust the client parse.
    const checked = inventoryFromCsv([['sku', 'nama', 'kategori', 'gudang', 'jumlah', 'satuan'], ...items.map((i) => [i.sku, i.name, i.categoryId, i.warehouse, String(i.quantity.value), i.quantity.unit])], Object.keys(CATEGORIES) as CategoryId[])
    if (checked.errors.length) return fail(422, 'validation', checked.errors[0])
    c.o.inventory.items.unshift(...items.map((i) => ({ ...i, id: newId('inv') })))
    orgAudit(c.o, { actor: c.actor, action: `Import ${items.length} item inventory`, entity: { type: 'business', id: c.orgId, label: fileName } })
    return HttpResponse.json({ imported: items.length })
  })),
  http.post(api('/inventory/schedules'), orgAuthed(async (c) => {
    if (!c.allowed('inventory', 'manage')) return deny(c, 'inventory', 'manage')
    const s = await body<OrgData['inventory']['schedules'][number]>(c.request)
    if (!s.item?.trim()) return fail(422, 'validation', 'Isi item', { item: 'Item wajib diisi' })
    if (!(s.quantity?.value > 0)) return fail(422, 'validation', 'Isi jumlah', { quantity: 'Jumlah harus > 0' })
    c.o.inventory.schedules.push({ ...s, id: newId('sch') })
    orgAudit(c.o, { actor: c.actor, action: 'Tambah jadwal pasokan rutin', entity: { type: 'business', id: c.orgId, label: s.item } })
    return new HttpResponse(null, { status: 201 })
  })),

  // Procurement (PRD §9.4)
  http.get(api('/procurement'), orgAuthed(({ o }) => HttpResponse.json([...o.procurements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))),
  http.get(api('/procurement/:id'), orgAuthed(({ o, params, orgId }) => {
    const r = o.procurements.find((x) => x.id === params.id)
    if (!r) return fail(404, 'not_found', 'Procurement tidak ditemukan')
    const p = pools().find((x) => x.id === r.poolId)
    return HttpResponse.json({ request: r, activity: o.activity.filter((e) => e.entity.id === r.id || e.entity.id === r.auctionId), pool: p ? viewPool(p, orgId) : null })
  })),
  http.post(api('/procurement'), orgAuthed(async (c) => {
    if (!c.allowed('procurement', 'create')) return deny(c, 'procurement', 'create')
    const { submit, ...input } = await body<ProcurementInput & { submit: boolean }>(c.request)
    const fields: Record<string, string> = {}
    if (!input.need?.trim()) fields.need = 'Kebutuhan wajib diisi'
    if (!(input.quantity?.value > 0)) fields.quantity = 'Kuantitas harus lebih dari 0'
    if (!(input.budgetIdr > 0)) fields.budgetIdr = 'Budget harus lebih dari 0'
    if (!input.deadline || new Date(input.deadline).getTime() < Date.now()) fields.deadline = 'Deadline harus di masa depan'
    if (input.visibility === 'invite' && !input.invitedSupplierIds.length) fields.invited = 'Pilih minimal satu supplier untuk diundang'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa kembali isian procurement', fields)
    const id = newId('prq')
    const required = requiredApprovers(input.budgetIdr, 'procurement', c.o.settings.approvalRules)
    const r: ProcurementRequest = {
      ...input, id, code: `PRQ-${id.slice(-4).toUpperCase()}`, status: 'draft', requiredApprovers: required, approvals: [],
      createdBy: c.actor, createdAt: now(), updatedAt: now(),
    }
    if (submit) r.status = statusAfterApproval(required, [])
    c.o.procurements.unshift(r)
    orgAudit(c.o, { actor: c.actor, action: submit ? 'Ajukan procurement' : 'Simpan draft procurement', entity: { type: 'procurement', id, label: `${r.code} ${r.need}` } })
    if (r.status === 'pending_approval') askApprovers(c, 'procurement', r, r.need, r.budgetIdr)
    return HttpResponse.json(r, { status: 201 })
  })),
  http.post(api('/procurement/:id/actions'), orgAuthed(async (c) => {
    const r = c.o.procurements.find((x) => x.id === c.params.id)
    if (!r) return fail(404, 'not_found', 'Procurement tidak ditemukan')
    const { action, note, quantity, optIn } = await body<{ action: ProcurementAction; note?: string; quantity?: number; optIn?: boolean }>(c.request)
    if (!procurementActions(r, c.role, c.o.settings.permissions).includes(action)) return fail(409, 'invalid_action', 'Aksi ini tidak tersedia untuk status atau peranmu sekarang')
    const before = r.status
    if (action === 'approve' || action === 'reject') {
      const err = decide(c, 'procurement', r, action === 'approve' ? 'approved' : 'rejected', note)
      if (err) return err
    } else {
      if (action === 'submit') {
        r.requiredApprovers = requiredApprovers(r.budgetIdr, 'procurement', c.o.settings.approvalRules)
        r.status = statusAfterApproval(r.requiredApprovers, [])
        if (r.status === 'pending_approval') askApprovers(c, 'procurement', r, r.need, r.budgetIdr)
      }
      if (action === 'publish') r.status = 'published'
      if (action === 'cancel') r.status = 'cancelled'
      if (action === 'collective') {
        const qty = quantity ?? r.quantity.value
        if (!(qty > 0)) return fail(422, 'validation', 'Isi kuantitas', { quantity: 'Kuantitas harus > 0' })
        let p = pools().find((x) => x.categoryId === r.categoryId && x.unit === r.quantity.unit && x.status === 'open')
        if (!p) {
          p = { id: newId('pool'), title: r.need, categoryId: r.categoryId, spec: r.spec, region: c.o.settings.profile.location.split(', ').pop() || 'Jawa Barat', deadline: r.deadline, unit: r.quantity.unit, baseUnitPriceIdr: Math.round(r.budgetIdr / r.quantity.value), refQty: r.quantity.value, thresholdQty: r.quantity.value * 8, status: 'open', members: [] }
          pools().unshift(p)
        }
        joinPool(c.o, c.orgId, p, qty, optIn ?? false)
        Object.assign(r, { status: 'in_collective', poolId: p.id, visibility: 'aggregate' })
      }
      orgAudit(c.o, { actor: c.actor, action: { submit: 'Ajukan procurement', publish: 'Publish procurement', cancel: 'Batalkan procurement', collective: 'Gabungkan ke collective' }[action], entity: { type: 'procurement', id: r.id, label: `${r.code} ${r.need}` }, changes: [{ field: 'Status', before, after: r.status }] })
    }
    r.updatedAt = now()
    saveOrg()
    return HttpResponse.json(r)
  })),

  // Collective procurement (PRD §9.5)
  http.get(api('/collective'), orgAuthed(({ o, orgId }) => {
    const cats = o.settings.profile.categories
    return HttpResponse.json(pools().map((p) => ({ ...viewPool(p, orgId), match: cats.includes(p.categoryId) })))
  })),
  http.post(api('/collective'), orgAuthed(async (c) => {
    if (!c.allowed('collective', 'create')) return deny(c, 'collective', 'create')
    const b = await body<{ title: string; categoryId: CategoryId; spec: string; region: string; deadline: string; unit: string; quantity: number; baseUnitPriceIdr: number; optIn: boolean }>(c.request)
    const fields: Record<string, string> = {}
    if (!b.title?.trim()) fields.title = 'Nama kebutuhan wajib diisi'
    if (!(b.quantity > 0)) fields.quantity = 'Kuantitas harus > 0'
    if (!(b.baseUnitPriceIdr > 0)) fields.baseUnitPriceIdr = 'Isi harga satuan saat ini'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa isian pool', fields)
    const p: StoredPool = { id: newId('pool'), title: b.title.trim(), categoryId: b.categoryId, spec: b.spec, region: b.region, deadline: b.deadline, unit: b.unit, baseUnitPriceIdr: b.baseUnitPriceIdr, refQty: b.quantity, thresholdQty: b.quantity * 8, status: 'open', members: [] }
    joinPool(c.o, c.orgId, p, b.quantity, b.optIn)
    pools().unshift(p)
    orgAudit(c.o, { actor: c.actor, action: 'Buat pool collective', entity: { type: 'procurement', id: p.id, label: p.title } })
    return HttpResponse.json(viewPool(p, c.orgId), { status: 201 })
  })),
  http.post(api('/collective/:poolId/join'), orgAuthed(async (c) => {
    if (!c.allowed('collective', 'create')) return deny(c, 'collective', 'create')
    const p = pools().find((x) => x.id === c.params.poolId)
    if (!p) return fail(404, 'not_found', 'Pool tidak ditemukan')
    if (p.status !== 'open') return fail(409, 'closed', 'Pool sudah diproses jadi market')
    const { quantity, optIn } = await body<{ quantity: number; optIn: boolean }>(c.request)
    if (!(quantity > 0)) return fail(422, 'validation', 'Isi kuantitas', { quantity: 'Kuantitas harus > 0' })
    const prev = p.members.find((m) => m.orgId === c.orgId)?.quantity
    joinPool(c.o, c.orgId, p, quantity, optIn)
    orgAudit(c.o, { actor: c.actor, action: prev ? 'Ubah demand di pool' : 'Gabung pool collective', entity: { type: 'procurement', id: p.id, label: p.title }, changes: [{ field: 'Demand', before: prev ? `${prev} ${p.unit}` : undefined, after: `${quantity} ${p.unit}` }] })
    return HttpResponse.json(viewPool(p, c.orgId))
  })),
  http.post(api('/collective/:poolId/leave'), orgAuthed((c) => {
    if (!c.allowed('collective', 'create')) return deny(c, 'collective', 'create')
    const p = pools().find((x) => x.id === c.params.poolId)
    if (!p) return fail(404, 'not_found', 'Pool tidak ditemukan')
    if (p.status !== 'open') return fail(409, 'closed', 'Pool sudah diproses jadi market')
    p.members = p.members.filter((m) => m.orgId !== c.orgId)
    for (const r of c.o.procurements) if (r.poolId === p.id && r.status === 'in_collective') Object.assign(r, { status: 'approved', poolId: undefined })
    orgAudit(c.o, { actor: c.actor, action: 'Keluar dari pool collective', entity: { type: 'procurement', id: p.id, label: p.title } })
    return new HttpResponse(null, { status: 204 })
  })),
  http.post(api('/collective/:poolId/market'), orgAuthed((c) => {
    if (!c.allowed('collective', 'manage')) return deny(c, 'collective', 'manage')
    const p = pools().find((x) => x.id === c.params.poolId)
    if (!p) return fail(404, 'not_found', 'Pool tidak ditemukan')
    const total = p.members.reduce((s, m) => s + m.quantity, 0)
    if (total < p.thresholdQty) return fail(409, 'not_ready', 'Demand gabungan belum mencapai ambang market')
    if (!p.members.some((m) => m.orgId === c.orgId)) return fail(409, 'not_member', 'Gabung pool dulu')
    p.status = 'market_requested'
    p.marketRequestedAt = now()
    orgAudit(c.o, { actor: c.actor, action: 'Minta market maker membentuk market', entity: { type: 'market', id: p.id, label: p.title } })
    return HttpResponse.json(viewPool(p, c.orgId))
  })),

  // Business auctions (PRD §9.6)
  http.get(api('/auctions'), orgAuthed(({ o }) => {
    saveOrg() // bots mutate live lots in place
    return HttpResponse.json(o.auctions.map(toView))
  })),
  http.post(api('/auctions'), orgAuthed(async (c) => {
    if (!c.allowed('auctions', 'create')) return deny(c, 'auctions', 'create')
    const input = await body<OrgAuctionInput>(c.request)
    const fields: Record<string, string> = {}
    if (!input.title?.trim()) fields.title = 'Judul wajib diisi'
    if (!input.lots?.length) fields.lots = 'Tambah minimal satu lot'
    input.lots?.forEach((l, i) => {
      if (!l.item.trim() || !(l.quantity.value > 0) || !(l.reservePriceIdr > 0)) fields[`lot-${i}`] = 'Lengkapi item, kuantitas, dan harga'
    })
    if (!(input.schedule?.durationMinutes > 0)) fields.duration = 'Pilih durasi'
    if (input.schedule?.startsAt && new Date(input.schedule.startsAt).getTime() < Date.now() - 60_000) fields.startsAt = 'Waktu mulai sudah lewat'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa kembali isian auction', fields)
    const id = newId('oau')
    const value = auctionValue(input.lots)
    const required = requiredApprovers(value, 'auction', c.o.settings.approvalRules)
    const oa: OrgAuction = {
      ...input, id, code: `OAU-${id.slice(-4).toUpperCase()}`, multiLot: input.lots.length > 1,
      lots: input.lots.map((l, i) => ({ ...l, id: `lot-${i + 1}` })), status: 'pending_approval', valueIdr: value,
      requiredApprovers: required, approvals: [], createdBy: c.actor, createdAt: now(),
    }
    c.o.auctions.unshift(oa)
    const p = c.o.procurements.find((r) => r.id === input.procurementId && (r.status === 'approved' || r.status === 'published'))
    if (p) Object.assign(p, { status: 'in_auction', auctionId: id, updatedAt: now() })
    if (!required.length) goLive(c.o, oa)
    else askApprovers(c, 'auction', oa, oa.title, value)
    orgAudit(c.o, { actor: c.actor, action: required.length ? 'Ajukan auction untuk approval' : 'Buka auction', entity: { type: 'auction', id, label: `${oa.code} ${oa.title}` } })
    return HttpResponse.json(toView(oa), { status: 201 })
  })),
  http.post(api('/auctions/:aid/actions'), orgAuthed(async (c) => {
    const oa = c.o.auctions.find((x) => x.id === c.params.aid)
    if (!oa) return fail(404, 'not_found', 'Auction tidak ditemukan')
    if (oa.status !== 'pending_approval') return fail(409, 'invalid_action', 'Auction ini tidak menunggu approval')
    const { action, note } = await body<{ action: 'approve' | 'reject'; note?: string }>(c.request)
    const err = decide(c, 'auction', oa, action === 'approve' ? 'approved' : 'rejected', note)
    if (err) return err
    saveOrg()
    return HttpResponse.json(toView(oa))
  })),
  http.get(api('/auctions/:aid/evaluation'), orgAuthed(({ o, params }) => {
    const oa = o.auctions.find((x) => x.id === params.aid)
    if (!oa) return fail(404, 'not_found', 'Auction tidak ditemukan')
    saveOrg()
    const p = o.settings.profile
    const evaluation: OrgAuctionEvaluation = {
      auction: toView(oa),
      lots: oa.lots.map((lot) => {
        const a = economy.auctions.find((x) => x.id === lot.auctionId)
        return { lot, status: a?.status ?? 'scheduled', offers: a ? lotOffers(a, oa.categoryId, higherWins(oa.type)) : [] }
      }),
      org: { name: p.name, location: p.location, npwp: p.legal.npwp },
    }
    return HttpResponse.json(evaluation)
  })),
  http.post(api('/auctions/:aid/award'), orgAuthed(async (c) => {
    if (!c.allowed('auctions', 'manage')) return deny(c, 'auctions', 'manage')
    const oa = c.o.auctions.find((x) => x.id === c.params.aid)
    if (!oa) return fail(404, 'not_found', 'Auction tidak ditemukan')
    if (oa.award) return fail(409, 'awarded', 'Pemenang sudah ditetapkan')
    const lots = lotAuctions(oa)
    if (!lots.length || lots.some((a) => a.status !== 'closed')) return fail(409, 'not_closed', 'Award hanya setelah semua lot ditutup')
    const { lines, reason } = await body<{ lines: AllocationLine[][]; reason: string }>(c.request)
    if (!reason?.trim()) return fail(422, 'validation', 'Tulis alasan award', { reason: 'Alasan award wajib diisi (tercatat di audit trail)' })
    if (lines.length !== oa.lots.length || lines.some((l) => !l.length || l.some((x) => !(x.quantity > 0)))) return fail(422, 'validation', 'Setiap lot harus punya pemenang')
    oa.award = { lines, reason: reason.trim(), at: now(), by: c.actor }
    for (const a of lots) a.status = 'awarded'
    const p = c.o.procurements.find((r) => r.id === oa.procurementId)
    if (p) Object.assign(p, { status: 'awarded', updatedAt: now() })
    orgAudit(c.o, {
      actor: c.actor, action: 'Award auction', entity: { type: 'auction', id: oa.id, label: `${oa.code} ${oa.title}` }, reason: oa.award.reason,
      changes: lines.map((l, i) => ({ field: oa.lots[i].item, after: l.map((x) => `${x.supplier} ${x.quantity.toLocaleString('id-ID')} × ${formatIdr(x.priceIdr)}`).join('; ') })),
    })
    return HttpResponse.json(toView(oa))
  })),
  http.post(api('/auctions/:aid/po'), orgAuthed((c) => {
    if (!c.allowed('auctions', 'manage')) return deny(c, 'auctions', 'manage')
    const oa = c.o.auctions.find((x) => x.id === c.params.aid)
    if (!oa?.award) return fail(409, 'not_awarded', 'Tetapkan pemenang dulu')
    if (oa.award.poNumber) return fail(409, 'exists', 'PO sudah diterbitkan')
    const poNumber = `PO-${c.o.settings.profile.name.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 4)}-${String(Date.now()).slice(-4)}`
    const txs = oa.award.lines.flatMap((lot, i) => lot.map((l) => makeTx({
      title: `${oa.lots[i].item} · ${l.quantity.toLocaleString('id-ID')} ${oa.lots[i].quantity.unit}`, role: oa.objective === 'selling' ? 'supplier' : 'buyer',
      counterparty: { name: l.supplier, kind: 'business', verified: SUPPLIERS.find((s) => s.name === l.supplier)?.verified ?? false },
      supplierId: SUPPLIERS.find((s) => s.name === l.supplier)?.id, quantity: { value: l.quantity, unit: oa.lots[i].quantity.unit }, unitPriceIdr: l.priceIdr,
      auctionId: oa.lots[i].auctionId, poNumber, address: c.o.settings.profile.location,
    })))
    c.o.transactions.unshift(...txs)
    oa.award.poNumber = poNumber
    oa.award.transactionIds = txs.map((t) => t.id)
    const p = c.o.procurements.find((r) => r.id === oa.procurementId)
    if (p) Object.assign(p, { status: 'po_issued', updatedAt: now() })
    orgAudit(c.o, { actor: c.actor, action: `Terbitkan ${poNumber}`, entity: { type: 'transaction', id: oa.id, label: `${oa.code} ${oa.title}` }, changes: [{ field: 'Transaksi', after: `${txs.length} PO` }] })
    return HttpResponse.json({ poNumber, transactionIds: oa.award.transactionIds })
  })),

  // Suppliers (PRD §9.7)
  http.get(api('/suppliers'), orgAuthed(({ o, request }) => {
    const p = new URL(request.url).searchParams
    const term = p.get('q')?.toLowerCase()
    return HttpResponse.json(orgSuppliers(o).filter((s) =>
      (!term || s.name.toLowerCase().includes(term)) && (!p.get('category') || s.categories.includes(p.get('category') as CategoryId)) &&
      (!p.get('region') || s.region === p.get('region')) && s.rating >= Number(p.get('minRating') ?? 0) &&
      (!p.get('verified') || s.verified) && (!p.get('relation') || s.relation === p.get('relation')),
    ))
  })),
  http.get(api('/suppliers/:sid'), orgAuthed(({ o, params }) => {
    const s = orgSuppliers(o).find((x) => x.id === params.sid)
    if (!s) return fail(404, 'not_found', 'Supplier tidak ditemukan')
    const detail: SupplierDetail = { ...s, history: o.transactions.filter((t) => t.supplierId === s.id) }
    return HttpResponse.json({ ...detail, purchases: o.history.filter((h) => h.supplierId === s.id).reverse().slice(0, 12).map((h) => ({ code: h.code, month: h.month, item: h.item, categoryId: h.categoryId, supplier: s.name, quantity: h.quantity, unitPriceIdr: h.unitPriceIdr, totalIdr: h.unitPriceIdr * h.quantity.value, via: h.via })), activity: o.activity.filter((e) => e.entity.id === s.id) })
  })),
  http.post(api('/suppliers/:sid/actions'), orgAuthed(async (c) => {
    const s = supplierById(String(c.params.sid))
    if (!s) return fail(404, 'not_found', 'Supplier tidak ditemukan')
    const { action, rating, reason } = await body<{ action: SupplierAction; rating?: number; reason?: string }>(c.request)
    const needs: Action = action === 'shortlist' || action === 'invite' ? 'create' : 'manage'
    if (!c.allowed('suppliers', needs)) return deny(c, 'suppliers', needs)
    const rel = (c.o.suppliers[s.id] ??= { relation: 'none' })
    const before = rel.relation
    if (action === 'block' && !reason?.trim()) return fail(422, 'validation', 'Tulis alasan blokir', { reason: 'Alasan wajib diisi' })
    if (action === 'rate' && !(rating && rating >= 1 && rating <= 5)) return fail(422, 'validation', 'Rating 1–5', { rating: 'Pilih 1–5 bintang' })
    if (action === 'verify' && !s.verified && s.documents.length < 2) return fail(409, 'docs_missing', 'Dokumen legal supplier belum lengkap untuk diverifikasi')
    if (before === 'blocked' && action !== 'unblock') return fail(409, 'blocked', 'Supplier diblokir. Buka blokir dulu.')
    if (action === 'rate') rel.myRating = rating
    else rel.relation = { shortlist: 'shortlisted', invite: 'invited', verify: 'verified', block: 'blocked', unblock: 'none' }[action] as typeof rel.relation
    const label = { shortlist: 'Shortlist supplier', invite: 'Undang supplier', verify: 'Verifikasi supplier', block: 'Blokir supplier', unblock: 'Buka blokir supplier', rate: 'Beri rating supplier' }[action]
    orgAudit(c.o, {
      actor: c.actor, action: label, entity: { type: 'supplier', id: s.id, label: s.name }, reason: action === 'block' ? reason : undefined,
      changes: action === 'rate' ? [{ field: 'Rating', after: `${rating}/5` }] : [{ field: 'Relasi', before, after: rel.relation }],
    })
    return HttpResponse.json(orgSuppliers(c.o).find((x) => x.id === s.id))
  })),

  // Transactions (PRD §9.8)
  http.get(api('/transactions'), orgAuthed(({ o }) => HttpResponse.json(o.transactions.map(({ timeline: _t, documents: _d, payment: _p, delivery: _v, dispute: _x, ...t }) => t)))),
  http.get(api('/transactions/:tid'), orgAuthed(({ o, params }) => {
    const t = o.transactions.find((x) => x.id === params.tid)
    return t ? HttpResponse.json({ ...t, activity: o.activity.filter((e) => e.entity.id === t.id) }) : fail(404, 'not_found', 'Transaksi tidak ditemukan')
  })),
  http.post(api('/transactions/:tid/actions'), orgAuthed(async (c) => {
    const t = c.o.transactions.find((x) => x.id === c.params.tid)
    if (!t) return fail(404, 'not_found', 'Transaksi tidak ditemukan')
    const { action, note, file } = await body<{ action: TransactionAction; note?: string; file?: string }>(c.request)
    const denied = txDeniedReason(c.o.settings.permissions, c.role, c.roleLabel, action)
    if (denied) return fail(403, 'forbidden', denied)
    const next = transition(t.status, t.role, action)
    if (!next || !allowedActions(t.status, t.role).includes(action)) return fail(409, 'invalid_transition', 'Aksi ini tidak tersedia untuk status sekarang')
    if (action === 'upload_proof' && !file) return fail(422, 'validation', 'Pilih file bukti', { file: 'Pilih file bukti pengiriman' })
    if (action === 'dispute' && !note?.trim()) return fail(422, 'validation', 'Jelaskan alasannya', { note: 'Jelaskan alasan dispute' })
    const before = t.status
    t.status = next
    t.updatedAt = now()
    const step = t.timeline.find((s) => s.status === next)
    if (step) Object.assign(step, { at: now(), note: ACTION_NOTE[action] })
    if (action === 'issue_invoice') t.documents.push({ id: newId('doc'), kind: 'invoice', name: `INV-${t.code.slice(4)}.pdf`, at: now() })
    if (action === 'pay') t.payment = { status: 'escrow', paidAt: now() }
    if (action === 'ship') t.delivery.eta = new Date(Date.now() + 2 * 864e5).toISOString()
    if (action === 'upload_proof') {
      t.delivery.proof = file
      t.documents.push({ id: newId('doc'), kind: 'proof', name: file!, at: now() })
    }
    if (action === 'confirm_receipt') t.payment.status = 'released'
    if (action === 'cancel' && t.payment.status === 'escrow') t.payment.status = 'refunded'
    if (action === 'dispute') t.dispute = { status: 'open', reason: note!, openedAt: now() }
    orgAudit(c.o, { actor: c.actor, action: ACTION_NOTE[action], entity: { type: 'transaction', id: t.id, label: `${t.code} ${t.title}` }, reason: action === 'dispute' ? note : undefined, changes: [{ field: 'Status', before, after: next }] })
    return HttpResponse.json({ ...t, activity: c.o.activity.filter((e: AuditEntry) => e.entity.id === t.id) })
  })),

  // Analytics (PRD §9.9)
  http.get(api('/analytics'), orgAuthed(({ o, request }) => {
    const p = new URL(request.url).searchParams
    return HttpResponse.json(analytics(o, Number(p.get('months') ?? 12), p.get('category') || undefined))
  })),
]
