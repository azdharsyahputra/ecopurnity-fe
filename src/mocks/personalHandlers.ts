import { delay, http, HttpResponse } from 'msw'
import type {
  AllocationLine, AuctionDetail, AuctionEvaluation, CreateAuctionInput, DashboardSummary, DemandListing, Identity, ListingDetail,
  ListingInput, MyBid, MyMarket, NotificationPrefs, Offer, PersonalOpportunity, Qualification, TransactionDetail,
} from '@/domain/types'
import { tradeActions } from '@/domain/trade'
import { lowerWins, rankOf, suggestAllocation, validateBid, withdrawBlock } from '@/domain/auction'
import { can } from '@/domain/org'
import { formatIdr } from '@/domain/format'
import { publish } from '@/lib/realtime'
import { db } from './db'
import { bidderLabel, economy, toAuction, toOpportunity } from './economy'
import { applyAction, createTrade, ensureF6, financeOf, setBank, tradeState, withdraw, type ActionInput } from './trade'
import { cancelPayment, createPayment, currentPayment, PAY_VIA_GATEWAY } from './payments'
import type { PaymentInput } from '@/domain/payment'
import { allPersonal, completeness, newId, notify, personal, savePersonal, type PersonalData } from './personal'
import { audit } from './audit'
import { isMaker, operatedIds, ops, saveMm } from './mm'
import { lotOwner, notifyOrgLotsClosed, orgEvaluateHref, orgRoleOf } from './org'
import { admin } from './admin'
import { reputationTxs } from './profileHandlers'
import { commitGuard } from './kyc'
import { reputationScore } from '@/domain/reputation'

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()

// The economy resets on reload but users' data persists: re-attach their auctions and re-apply their bids.
for (const [userId, p] of allPersonal()) {
  for (const a of p.ownedAuctions ?? []) {
    if (!economy.auctions.some((x) => x.id === a.id)) economy.auctions.unshift(a)
    economy.owners.set(a.id, userId)
    economy.bestPrice.set(a.id, a.currentPriceIdr ?? a.openingPriceIdr)
  }
  for (const [auctionId, b] of Object.entries(p.bids)) {
    const a = economy.auctions.find((x) => x.id === auctionId)
    if (!a || a.type === 'sealed' || !['leading', 'outbid'].includes(b.status)) continue
    const best = economy.bestPrice.get(a.id) ?? a.openingPriceIdr
    const mineBetter = lowerWins(a.type) ? b.priceIdr <= best : b.priceIdr >= best
    b.status = mineBetter ? 'leading' : 'outbid'
    if (mineBetter) {
      economy.bestPrice.set(a.id, b.priceIdr)
      if (a.visibility === 'full') {
        a.currentPriceIdr = b.priceIdr
        const id = `${a.id}-${userId}-restored`
        economy.bidOwners.set(id, userId)
        a.bids = [{ id, bidder: bidderLabel(a, userId), priceIdr: b.priceIdr, at: b.updatedAt }, ...a.bids]
      }
    }
  }
}

type Ctx = { userId: string; p: PersonalData; params: Record<string, string | readonly string[] | undefined>; request: Request }

/** Wraps a handler that needs a session (401 otherwise). */
const authed = (fn: (ctx: Ctx) => Response | Promise<Response>) =>
  async ({ params, request }: { params: Ctx['params']; request: Request }) => {
    await delay(250)
    const userId = db.sessionUserId
    if (!userId || !db.users.some((u) => u.id === userId)) return fail(401, 'unauthenticated', 'Belum login')
    return fn({ userId, p: personal(userId), params, request })
  }

// ── Personal opportunities ───────────────────────────────────────

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

function personalOpportunities(p: PersonalData): PersonalOpportunity[] {
  const prefs = p.identity.preferences
  const listingCats = new Set(p.listings.map((l) => l.listing.categoryId))
  return economy.opportunities.map((detail) => {
    const o = toOpportunity(detail)
    const sameRegion = prefs.locations.includes(o.region)
    const distanceKm = sameRegion ? 3 + (hash(o.id) % 45) : 120 + (hash(o.id) % 780)
    const reasons = [
      ...(prefs.categories.includes(o.categoryId) ? [{ label: 'Kategori cocok', detail: 'Sesuai kategori preferensimu' }] : []),
      ...(listingCats.has(o.categoryId)
        ? [{ label: 'Kapasitas cocok', detail: `Kamu punya listing di kategori ini (${p.listings.filter((l) => l.listing.categoryId === o.categoryId).length})` }]
        : []),
      ...(sameRegion ? [{ label: 'Dekat', detail: `${distanceKm} km dari lokasimu` }] : []),
      ...(o.demand.value > o.supply.value ? [{ label: 'Ada gap', detail: `Supply baru ${Math.round((o.supply.value / o.demand.value) * 100)}% dari demand` }] : []),
    ]
    const rel = p.opportunities[o.id]
    return {
      ...o, reasons, distanceKm, relation: rel?.relation ?? 'none', contribution: rel?.contribution,
      personalValueIdr: Math.round((o.potentialValueIdr / Math.max(o.participants, 1)) * (1 + reasons.length / 2)),
    }
  })
}

const score = (o: PersonalOpportunity) => o.reasons.length * 10 - o.distanceKm / 100 + o.confidence

// ── Bids ─────────────────────────────────────────────────────────

function myBid(p: PersonalData, a: AuctionDetail): MyBid | undefined {
  const b = p.bids[a.id]
  if (!b) return undefined
  // Everyone else's best price: per masked bidder when bids are public, otherwise just the hidden best.
  const others = new Map<string, number>()
  for (const x of a.bids) if (!x.mine && (!others.has(x.bidder) || (lowerWins(a.type) ? x.priceIdr < others.get(x.bidder)! : x.priceIdr > others.get(x.bidder)!))) others.set(x.bidder, x.priceIdr)
  const best = economy.bestPrice.get(a.id)
  if (best !== undefined && best !== b.priceIdr) others.set('_best', best)
  const live = a.status === 'live' || a.status === 'extended'
  return {
    auction: toAuction(a), priceIdr: b.priceIdr, status: b.status, submittedAt: b.submittedAt, updatedAt: b.updatedAt,
    rank: a.type === 'sealed' && live ? undefined : b.status === 'leading' || b.status === 'won' ? 1 : rankOf(a.type, b.priceIdr, [...new Set(others.values())]),
    canWithdraw: withdrawBlock(a, b.status, lotOwner(a.id)?.oa.rules.withdraw) === null,
    ...(lowerWins(a.type) ? { capacity: { value: b.quantity ?? a.lot.quantity.value, unit: a.lot.quantity.unit } } : {}),
  }
}

/** Org lots: members whose role can view auctions act as the owner (evaluate the business auction); personal: the buyer. */
function ownerView(a: AuctionDetail, userId: string) {
  const lot = lotOwner(a.id)
  if (!lot) return economy.owners.get(a.id) === userId
  const role = orgRoleOf(lot.orgId, userId)
  return !!role && can(lot.o.settings.permissions, role, 'auctions', 'view')
}

function qualification(p: PersonalData, auctionId: string, userId: string): Qualification {
  const user = db.users.find((u) => u.id === userId)
  const status = p.qualifications[auctionId] ?? 'not_started'
  const done = status === 'qualified'
  return {
    auctionId, status,
    checks: [
      { id: 'email', label: 'Email terverifikasi', done: !!user?.emailVerified, detail: user?.emailVerified ? undefined : 'Verifikasi dari halaman profil' },
      { id: 'reputation', label: 'Reputasi ≥ 80', done: true, detail: userId.startsWith('usr-new-') ? 'Akun baru: diizinkan untuk lot pertama' : 'Skor 94' },
      { id: 'document', label: 'Dokumen spesifikasi', done },
      { id: 'rules', label: 'Menyetujui aturan auction', done },
    ],
  }
}

// ── Transactions ─────────────────────────────────────────────────

/**
 * Creates a trade through the settlement engine. With `peerUserId` the other side is a platform account
 * and gets its own linked record; otherwise the counterparty is fictional and played by the bot.
 */
export function createTransaction(
  userId: string,
  t: Pick<TransactionDetail, 'title' | 'role' | 'counterparty' | 'quantity' | 'unitPriceIdr' | 'auctionId'> & Partial<TransactionDetail>,
  peerUserId?: string,
) {
  const me = { userId }
  const other = peerUserId ? { userId: peerUserId } : { party: t.counterparty }
  const res = createTrade({
    title: t.title, buyer: t.role === 'buyer' ? me : other, supplier: t.role === 'supplier' ? me : other,
    quantity: t.quantity, unitPriceIdr: t.unitPriceIdr, auctionId: t.auctionId, makerFeeRate: t.auctionId ? 0.005 : 0,
  })
  return (t.role === 'buyer' ? res.buyer : res.supplier)!
}


/** Restricted or suspended accounts can browse but not trade (PRD §11 user governance). */
const restricted = (userId: string) => ['restricted', 'suspended'].includes(admin.users[userId]?.status ?? 'active')

/** The user's membership state in a market's participant list, if the market maker tracks it. */
function approvalOf(marketId: string) {
  return ops(marketId).participants.find((x) => x.userId === db.sessionUserId)?.status
}

const actorName = (userId: string) => db.users.find((u) => u.id === userId)?.name ?? 'Pengguna'

// ── Handlers ─────────────────────────────────────────────────────

export const personalHandlers = [
  // Dashboard (PRD §8.1)
  http.get(api('/me/dashboard'), authed(({ p }) => {
    const opps = personalOpportunities(p)
    const bids = economy.auctions.map((a) => myBid(p, a)).filter((b): b is MyBid => !!b)
    const live = bids.filter((b) => b.auction.status === 'live' || b.auction.status === 'extended')
    const tx = p.transactions
    const done30 = tx.filter((t) => t.status === 'completed' && Date.now() - new Date(t.updatedAt).getTime() < 30 * 864e5)
    const actions: DashboardSummary['actions'] = [
      ...live.filter((b) => b.status === 'outbid').map((b) => ({
        id: `ob-${b.auction.id}`, tone: 'red' as const, title: `Tersalip di ${b.auction.title}`, detail: `Bid kamu ${formatIdr(b.priceIdr)} · peringkat ${b.rank ?? '–'}`, href: `/auctions/${b.auction.id}`,
      })),
      ...live.filter((b) => new Date(b.auction.endsAt).getTime() - Date.now() < 3_600_000).map((b) => ({
        id: `end-${b.auction.id}`, tone: 'orange' as const, title: `${b.auction.title} berakhir < 1 jam`, detail: 'Pastikan bid terakhirmu sudah masuk', href: `/auctions/${b.auction.id}`,
      })),
      ...tx.map((t) => ({ t, todo: tradeActions(tradeState(t), t.role).filter((a) => !['cancel', 'dispute', 'review'].includes(a)) })).filter((x) => x.todo.length).map(({ t, todo }) => ({
        id: `tx-${t.id}`, tone: 'blue' as const, title: t.title, detail: `Menunggu kamu: ${todo.length} aksi`, href: `/app/transactions/${t.id}`,
      })),
      ...opps.filter((o) => o.relation === 'none' && o.status === 'detected' && o.reasons.length >= 2).slice(0, 1).map((o) => ({
        id: `opp-${o.id}`, tone: 'lime' as const, title: `Match baru: ${o.title}`, detail: o.reasons.map((r) => r.label).join(' · '), href: `/opportunities/${o.id}`,
      })),
    ]
    const summary: DashboardSummary = {
      stats: {
        activeOpportunities: opps.filter((o) => o.relation !== 'none').length,
        activeBids: live.length,
        openDemands: p.listings.filter((l) => l.listing.kind === 'demand' && ['open', 'matched', 'in_market'].includes(l.listing.status)).length,
        currentOffers: p.listings.filter((l) => l.listing.kind === 'supply' && ['available', 'in_market'].includes(l.listing.status)).length,
        runningTransactions: tx.filter((t) => !['completed', 'cancelled'].includes(t.status)).length,
        earnings30dIdr: done30.filter((t) => t.role === 'supplier').reduce((s, t) => s + t.totalIdr, 0),
        savings30dIdr: Math.round(tx.filter((t) => t.role === 'buyer').reduce((s, t) => s + t.totalIdr, 0) * 0.11),
        reputation: reputationScore(reputationTxs(db.sessionUserId!)).score,
      },
      actions,
      topMatches: opps.filter((o) => o.relation === 'none').sort((a, b) => score(b) - score(a)).slice(0, 3),
      liveBids: live,
      activity: db.activity.slice(0, 6),
      connections: {
        count: db.sessionUserId?.startsWith('usr-new-') ? 0 : 38,
        sample: [{ name: 'Kedai Kopi Senja', kind: 'business', verified: true }, { name: 'Koperasi Mitra Tani', kind: 'business', verified: true }, { name: 'Dewi Lestari', kind: 'person', verified: false }],
      },
    }
    return HttpResponse.json(summary)
  })),

  // Identity (PRD §8.2)
  http.get(api('/me/identity'), authed(({ p }) => HttpResponse.json(p.identity))),
  http.put(api('/me/identity'), authed(async ({ p, userId, request }) => {
    const next = (await request.json()) as Identity
    if (!next.profile.name.trim()) return fail(422, 'validation', 'Nama wajib diisi', { name: 'Nama wajib diisi' })
    p.identity = { ...next, completeness: completeness(next) }
    const user = db.users.find((u) => u.id === userId)
    if (user) Object.assign(user, { name: next.profile.name, location: next.profile.location })
    savePersonal()
    return HttpResponse.json(p.identity)
  })),

  // Listings (PRD §8.3–8.4)
  http.get(api('/me/listings'), authed(({ p, request }) => {
    const q = new URL(request.url).searchParams
    return HttpResponse.json(
      p.listings.map((l) => l.listing).filter((l) => (!q.get('kind') || l.kind === q.get('kind')) && (!q.get('status') || l.status === q.get('status'))),
    )
  })),
  http.get(api('/me/listings/:id'), authed(({ p, params }) => {
    const s = p.listings.find((l) => l.listing.id === params.id)
    if (!s) return fail(404, 'not_found', 'Listing tidak ditemukan')
    const l = s.listing
    const detail: ListingDetail = {
      ...l, history: s.history,
      matches: economy.opportunities.filter((o) => o.categoryId === l.categoryId).slice(0, 3).map(toOpportunity),
      markets: economy.markets.filter((m) => m.categoryId === l.categoryId && (m.status === 'active' || m.status === 'formation')),
    }
    return HttpResponse.json(detail)
  })),
  http.post(api('/me/listings'), authed(async ({ p, request }) => {
    const input = (await request.json()) as ListingInput
    if (!input.item?.trim()) return fail(422, 'validation', 'Item wajib diisi', { item: 'Item wajib diisi' })
    if (!(input.quantity?.value > 0)) return fail(422, 'validation', 'Kuantitas harus > 0', { quantity: 'Kuantitas harus lebih dari 0' })
    const id = newId('lst')
    const base = { ...input, id, code: `${input.kind === 'supply' ? 'SUP' : 'DEM'}-${id.slice(-3).toUpperCase()}`, createdAt: now(), updatedAt: now() }
    const listing = input.kind === 'supply' ? { ...base, kind: 'supply' as const, status: 'available' as const } : { ...base, kind: 'demand' as const, status: 'open' as const }
    p.listings.unshift({ listing: listing as never, history: [{ at: now(), status: listing.status, note: 'Dibuat' }] })
    savePersonal()
    return HttpResponse.json(listing, { status: 201 })
  })),
  http.patch(api('/me/listings/:id'), authed(async ({ p, params, request }) => {
    const s = p.listings.find((l) => l.listing.id === params.id)
    if (!s) return fail(404, 'not_found', 'Listing tidak ditemukan')
    Object.assign(s.listing, (await request.json()) as object, { updatedAt: now() })
    s.history.unshift({ at: now(), status: s.listing.status, note: 'Diperbarui' })
    savePersonal()
    return HttpResponse.json(s.listing)
  })),
  http.post(api('/me/listings/:id/archive'), authed(({ p, params }) => {
    const s = p.listings.find((l) => l.listing.id === params.id)
    if (!s) return fail(404, 'not_found', 'Listing tidak ditemukan')
    s.listing.status = s.listing.kind === 'supply' ? 'expired' : 'cancelled'
    s.history.unshift({ at: now(), status: s.listing.status, note: 'Diarsipkan' })
    savePersonal()
    return HttpResponse.json(s.listing)
  })),
  http.post(api('/me/listings/:id/market'), authed(async ({ p, params, request }) => {
    const s = p.listings.find((l) => l.listing.id === params.id)
    const { marketId } = (await request.json()) as { marketId: string }
    const m = economy.markets.find((x) => x.id === marketId)
    if (!s || !m) return fail(404, 'not_found', 'Listing atau market tidak ditemukan')
    s.listing.status = 'in_market'
    s.listing.marketId = marketId
    s.history.unshift({ at: now(), status: 'in_market', note: `Dimasukkan ke ${m.name}` })
    p.markets[marketId] = { ...p.markets[marketId], joined: true }
    savePersonal()
    return HttpResponse.json(s.listing)
  })),

  // Opportunities (PRD §8.5)
  http.get(api('/me/opportunities'), authed(({ p, request }) => {
    const tab = new URL(request.url).searchParams.get('tab') ?? 'for_you'
    const all = personalOpportunities(p)
    const filters: Record<string, (o: PersonalOpportunity) => boolean> = {
      for_you: (o) => o.reasons.length > 0,
      nearby: (o) => o.distanceKm <= 75,
      market_gap: (o) => o.kind === 'market_gap',
      collective: (o) => o.kind === 'collective_demand',
      supply_gap: (o) => o.kind === 'supply_gap',
      joined: (o) => o.relation === 'joined',
      following: (o) => o.relation === 'following',
    }
    return HttpResponse.json(all.filter(filters[tab] ?? (() => true)).sort((a, b) => score(b) - score(a)))
  })),
  http.post(api('/me/opportunities/:id/join'), authed(async ({ p, params, request }) => {
    const o = economy.opportunities.find((x) => x.id === params.id)
    if (!o) return fail(404, 'not_found', 'Opportunity tidak ditemukan')
    const body = (await request.json()) as { kind: 'supply' | 'demand'; listingId: string; quantity: { value: number; unit: string } }
    if (!(body.quantity?.value > 0)) return fail(422, 'validation', 'Kuantitas harus > 0', { quantity: 'Isi kuantitas kontribusi' })
    if (!p.opportunities[o.id] || p.opportunities[o.id].relation !== 'joined') o.participants++
    p.opportunities[o.id] = { relation: 'joined', contribution: body }
    if (body.kind === 'demand') o.demand.value += body.quantity.value
    else o.supply.value += body.quantity.value
    savePersonal()
    return HttpResponse.json(personalOpportunities(p).find((x) => x.id === o.id))
  })),
  http.post(api('/me/opportunities/:id/follow'), authed(({ p, params }) => {
    if (p.opportunities[String(params.id)]?.relation !== 'joined') p.opportunities[String(params.id)] = { relation: 'following' }
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),
  http.delete(api('/me/opportunities/:id'), authed(({ p, params }) => {
    const o = economy.opportunities.find((x) => x.id === params.id)
    if (o && p.opportunities[o.id]?.relation === 'joined') o.participants--
    delete p.opportunities[String(params.id)]
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),

  // Markets (PRD §8.7)
  http.get(api('/me/markets'), authed(({ p }) => {
    const list: MyMarket[] = economy.markets.map(({ description: _d, rules: _r, priceHistory: _h, activity: _a, auctions: _u, ...m }) => ({
      ...m, joined: !!p.markets[m.id]?.joined, watchPriceIdr: p.markets[m.id]?.watchPriceIdr,
      approval: p.markets[m.id]?.joined ? approvalOf(m.id) : undefined,
      myListings: p.listings.filter((l) => l.listing.marketId === m.id).length,
    }))
    return HttpResponse.json(list)
  })),
  http.post(api('/me/markets/:id/join'), authed(({ p, params, userId }) => {
    const id = String(params.id)
    if (!economy.markets.some((m) => m.id === id)) return fail(404, 'not_found', 'Market tidak ditemukan')
    p.markets[id] = { ...p.markets[id], joined: true }
    // Joining lands in the market maker's participant queue (auto-approved when the market allows it).
    const o = ops(id)
    if (!o.participants.some((x) => x.userId === userId)) {
      const user = db.users.find((u) => u.id === userId)!
      o.participants.unshift({
        id: newId('mp'), userId, name: user.name, kind: 'person', verified: user.emailVerified, role: 'buyer',
        status: o.settings.approval === 'manual' ? 'pending' : 'active', reputation: userId.startsWith('usr-new-') ? 80 : 94, joinedAt: now(),
      })
      saveMm()
    }
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),
  http.post(api('/me/markets/:id/leave'), authed(({ p, params }) => {
    p.markets[String(params.id)] = { joined: false }
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),
  http.put(api('/me/markets/:id/watch'), authed(async ({ p, params, request }) => {
    const { priceIdr } = (await request.json()) as { priceIdr?: number }
    p.markets[String(params.id)] = { joined: p.markets[String(params.id)]?.joined ?? false, watchPriceIdr: priceIdr || undefined }
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),

  // Auctions as participant (PRD §8.8)
  http.get(api('/me/auctions'), authed(({ p, userId }) => {
    const bids = economy.auctions.map((a) => myBid(p, a)).filter((b): b is MyBid => !!b)
    const bidIds = new Set(bids.map((b) => b.auction.id))
    return HttpResponse.json({
      eligible: economy.auctions
        .filter((a) => !bidIds.has(a.id) && economy.owners.get(a.id) !== userId && ['live', 'extended', 'qualification', 'scheduled'].includes(a.status) && a.type !== 'forward')
        .map((a) => ({ ...toAuction(a), qualification: p.qualifications[a.id] ?? 'not_started' })),
      bids,
      owned: economy.auctions.filter((a) => economy.owners.get(a.id) === userId && !orgEvaluateHref(a.id)).map(toAuction),
    })
  })),
  http.get(api('/auctions/:id/me'), authed(({ p, params, userId }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    const owner = ownerView(a, userId)
    return HttpResponse.json({
      qualification: qualification(p, a.id, userId), bid: myBid(p, a) ?? null, owner,
      evaluateHref: owner ? orgEvaluateHref(a.id) ?? `/app/auctions/${a.id}/evaluate` : undefined,
    })
  })),
  http.post(api('/auctions/:id/qualification'), authed(async ({ p, params, userId, request }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    const { documentName, acceptRules } = (await request.json()) as { documentName?: string; acceptRules?: boolean }
    const fields: Record<string, string> = {}
    if (!documentName) fields.document = 'Unggah dokumen spesifikasi'
    if (!acceptRules) fields.rules = 'Setujui aturan auction'
    if (!db.users.find((u) => u.id === userId)?.emailVerified) fields.email = 'Verifikasi email dulu'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Syarat kualifikasi belum lengkap', fields)
    p.qualifications[a.id] = 'qualified'
    savePersonal()
    return HttpResponse.json(qualification(p, a.id, userId))
  })),
  http.post(api('/auctions/:id/bids'), authed(async ({ p, params, userId, request }) => {
    if (restricted(userId)) return fail(403, 'account_restricted', 'Akunmu dibatasi tim governance: belum bisa bid atau membuat auction.')
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    if (a.status !== 'live' && a.status !== 'extended') return fail(409, 'auction_closed', 'Auction tidak sedang berjalan')
    if (p.qualifications[a.id] !== 'qualified') return fail(403, 'not_qualified', 'Selesaikan kualifikasi dulu')
    const lot = lotOwner(a.id)
    if (lot ? orgRoleOf(lot.orgId, userId) : economy.owners.get(a.id) === userId) return fail(403, 'owner', 'Pembuat auction tidak bisa ikut bid')
    const { priceIdr, quantity } = (await request.json()) as { priceIdr: number; quantity?: number }
    const capacity = lowerWins(a.type) ? quantity : undefined
    if (capacity !== undefined && !(capacity > 0 && capacity <= a.lot.quantity.value)) {
      const msg = `Kapasitas harus lebih dari 0 dan maksimal ${a.lot.quantity.value.toLocaleString('id-ID')} ${a.lot.quantity.unit}`
      return fail(422, 'validation', msg, { quantity: msg })
    }
    const blocked = commitGuard(userId, priceIdr * a.lot.quantity.value)
    if (blocked) return blocked
    const error = validateBid({ ...a, currentPriceIdr: a.type === 'sealed' ? undefined : economy.bestPrice.get(a.id) }, priceIdr)
    if (error) return fail(422, 'invalid_bid', error, { price: error })
    const prev = p.bids[a.id]
    p.bids[a.id] = { priceIdr, quantity: capacity, status: a.type === 'sealed' ? 'submitted' : 'leading', submittedAt: prev?.submittedAt ?? now(), updatedAt: now() }
    if (a.type !== 'sealed') {
      economy.bestPrice.set(a.id, priceIdr)
      if (a.visibility === 'full') a.currentPriceIdr = priceIdr
    }
    if (!prev) a.participants++
    a.bidCount++
    const bid = { id: `${a.id}-${userId}-${a.bidCount}`, bidder: bidderLabel(a, userId), priceIdr, at: now() }
    economy.bidOwners.set(bid.id, userId)
    if (a.visibility === 'full') a.bids = [bid, ...a.bids].slice(0, 30)
    savePersonal()
    publish({
      channel: `auction:${a.id}`, type: 'auction.bid', ts: now(),
      payload: { kind: 'bid', bid: a.visibility === 'full' ? bid : { ...bid, priceIdr: 0 }, currentPriceIdr: a.currentPriceIdr, bidCount: a.bidCount, participants: a.participants },
    })
    return HttpResponse.json(myBid(p, a))
  })),
  http.delete(api('/auctions/:id/bids/mine'), authed(({ p, params }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    const mine = a && myBid(p, a)
    if (!a || !mine) return fail(404, 'not_found', 'Belum ada bid')
    const blocked = withdrawBlock(a, mine.status, lotOwner(a.id)?.oa.rules.withdraw)
    if (blocked) return fail(409, 'cannot_withdraw', blocked)
    p.bids[a.id] = { ...p.bids[a.id], status: 'withdrawn', updatedAt: now() }
    savePersonal()
    return HttpResponse.json(myBid(p, a))
  })),
  http.post(api('/auctions/:id/accept'), authed(({ p, params, userId }) => {
    if (restricted(userId)) return fail(403, 'account_restricted', 'Akunmu dibatasi tim governance: belum bisa bid atau membuat auction.')
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a || a.type !== 'dutch' || (a.status !== 'live' && a.status !== 'extended')) return fail(409, 'auction_closed', 'Harga tidak bisa diterima sekarang')
    if (p.qualifications[a.id] !== 'qualified') return fail(403, 'not_qualified', 'Selesaikan kualifikasi dulu')
    const price = a.currentPriceIdr ?? a.openingPriceIdr
    const blocked = commitGuard(userId, price * a.lot.quantity.value)
    if (blocked) return blocked
    a.status = 'awarded'
    p.bids[a.id] = { priceIdr: price, status: 'won', submittedAt: now(), updatedAt: now() }
    const tx = createTransaction(userId, {
      title: `${a.lot.item} ${a.lot.quantity.value.toLocaleString('id-ID')} ${a.lot.quantity.unit}`, role: 'buyer',
      counterparty: { name: economy.markets.find((m) => m.id === a.marketId)?.maker.name ?? a.marketName, kind: 'business', verified: true },
      quantity: a.lot.quantity, unitPriceIdr: price, totalIdr: price * a.lot.quantity.value, dueAt: new Date(Date.now() + 14 * 864e5).toISOString(), auctionId: a.id,
    })
    notify(userId, { type: 'winning_bid', title: `Kamu memenangkan ${a.title}`, body: `Harga ${formatIdr(price)}/${a.lot.quantity.unit}. Transaksi dibuat.`, href: `/app/transactions/${tx.id}` })
    return HttpResponse.json({ transactionId: tx.id })
  })),

  // Buyer flow: create → evaluate → award (PRD §8.8 buyer)
  http.post(api('/me/auctions'), authed(async ({ p, userId, request }) => {
    if (restricted(userId)) return fail(403, 'account_restricted', 'Akunmu dibatasi tim governance: belum bisa bid atau membuat auction.')
    const input = (await request.json()) as CreateAuctionInput
    const s = p.listings.find((l) => l.listing.id === input.demandId)
    if (!s || s.listing.kind !== 'demand') return fail(404, 'not_found', 'Demand tidak ditemukan')
    if (!(input.openingPriceIdr > 0)) return fail(422, 'validation', 'Harga pembuka wajib diisi', { openingPriceIdr: 'Isi harga pembuka per unit' })
    const d = s.listing as DemandListing
    const blocked = commitGuard(userId, input.openingPriceIdr * d.quantity.value)
    if (blocked) return blocked
    const id = newId('auc')
    const a: AuctionDetail = {
      id, code: `AUC-${id.slice(-4).toUpperCase()}`, title: `${d.item} ${d.quantity.value.toLocaleString('id-ID')} ${d.quantity.unit}`,
      marketId: d.marketId ?? 'mkt-karton-jkt', marketName: d.marketId ? economy.markets.find((m) => m.id === d.marketId)?.name ?? 'Market' : 'Pengadaan langsung',
      categoryId: d.categoryId, type: input.type, status: 'live', visibility: input.type === 'sealed' ? 'sealed' : input.visibility,
      lot: { item: d.item, quantity: d.quantity, spec: d.spec || 'Sesuai deskripsi demand' },
      startsAt: now(), endsAt: new Date(Date.now() + input.durationMinutes * 60_000).toISOString(),
      participants: 0, bidCount: 0, openingPriceIdr: input.openingPriceIdr, currentPriceIdr: input.type === 'sealed' ? undefined : input.openingPriceIdr,
      minStepIdr: input.minStepIdr, extension: { windowMinutes: 2, extendMinutes: 5 }, bids: [],
      rules: [
        { label: 'Tipe', value: input.type === 'sealed' ? 'Sealed bid' : 'Reverse auction' },
        { label: 'Harga pembuka', value: `${formatIdr(input.openingPriceIdr)} per ${d.quantity.unit}` },
        { label: 'Penurunan minimum', value: formatIdr(input.minStepIdr) },
        { label: 'Undangan', value: input.invite.length ? input.invite.join(', ') : 'Terbuka untuk supplier terkualifikasi' },
        { label: 'Penetapan pemenang', value: 'Harga terendah; dapat dibagi ke beberapa supplier' },
      ],
    }
    economy.auctions.unshift(a)
    economy.owners.set(id, userId)
    economy.bestPrice.set(id, input.openingPriceIdr)
    p.ownedAuctions.unshift(a)
    audit({ actor: actorName(userId), action: 'Buka auction', entity: { type: 'auction', id, label: a.title }, changes: [{ field: 'Harga pembuka', after: formatIdr(input.openingPriceIdr) }] })
    d.auctionId = id
    d.status = 'in_market'
    s.history.unshift({ at: now(), status: 'in_market', note: `Auction ${a.code} dibuat` })
    savePersonal()
    return HttpResponse.json(a, { status: 201 })
  })),
  http.get(api('/auctions/:id/evaluation'), authed(({ p, params, userId }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a || economy.owners.get(a.id) !== userId || lotOwner(a.id)) return fail(404, 'not_found', 'Auction tidak ditemukan')
    // One offer per bidder: their best price; capacity as stated by platform bidders, else (bots) and reputation are mock supplier facts.
    const best = new Map<string, Offer>()
    for (const b of a.bids) {
      const prev = best.get(b.bidder)
      if (!prev || b.priceIdr < prev.priceIdr) {
        const h = hash(b.bidder)
        const bidder = economy.bidOwners.get(b.id)
        best.set(b.bidder, {
          id: `${a.id}-${b.bidder}`, priceIdr: b.priceIdr, submittedAt: b.at,
          capacity: { value: bidder ? personal(bidder).bids[a.id]?.quantity ?? a.lot.quantity.value : Math.round(a.lot.quantity.value * (0.3 + (h % 50) / 100)), unit: a.lot.quantity.unit },
          supplier: { name: b.bidder.replace('Supplier', 'Supplier #'), kind: 'business', verified: h % 3 !== 0, reputation: 78 + (h % 21) },
        })
      }
    }
    const offers = [...best.values()].sort((x, y) => x.priceIdr - y.priceIdr)
    const lines = suggestAllocation(offers, a.lot.quantity.value)
    const totalIdr = lines.reduce((s, l) => s + l.quantity * l.priceIdr, 0)
    const covered = lines.reduce((s, l) => s + l.quantity, 0)
    const demand = p.listings.find((l) => l.listing.kind === 'demand' && (l.listing as DemandListing).auctionId === a.id)?.listing as DemandListing | undefined
    const evaluation: AuctionEvaluation = {
      auction: a, demand, offers,
      suggestion: {
        lines, totalIdr, savingsIdr: Math.max(0, a.openingPriceIdr * covered - totalIdr),
        reason: lines.length === 0
          ? 'Belum ada penawaran.'
          : covered < a.lot.quantity.value
            ? `Kapasitas semua supplier baru menutup ${covered.toLocaleString('id-ID')} dari ${a.lot.quantity.value.toLocaleString('id-ID')} ${a.lot.quantity.unit}.`
            : `${lines.length} supplier termurah menutup seluruh lot; reputasi menjadi penentu saat harga sama.`,
      },
    }
    return HttpResponse.json(evaluation)
  })),
  http.post(api('/auctions/:id/award'), authed(async ({ p, params, userId, request }) => {
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a || economy.owners.get(a.id) !== userId || lotOwner(a.id)) return fail(404, 'not_found', 'Auction tidak ditemukan')
    if (a.status !== 'closed') return fail(409, 'not_closed', 'Award hanya setelah auction ditutup')
    const { lines } = (await request.json()) as { lines: AllocationLine[] }
    if (!lines?.length) return fail(422, 'validation', 'Pilih minimal satu supplier')
    a.status = 'awarded'
    audit({
      actor: actorName(userId), action: 'Tetapkan pemenang', entity: { type: 'auction', id: a.id, label: a.title },
      changes: lines.map((l) => ({ field: l.supplier, after: `${l.quantity.toLocaleString('id-ID')} × ${formatIdr(l.priceIdr)}` })),
    })
    // A line whose offer came from a platform account becomes a linked two-sided trade (PRD F6).
    const ownerOf = (offerId: string) => {
      const bidder = offerId.slice(a.id.length + 1)
      const bid = a.bids.find((b) => b.bidder === bidder && economy.bidOwners.has(b.id))
      return bid ? economy.bidOwners.get(bid.id) : undefined
    }
    const winners = new Set<string>()
    const ids = lines.map((l) => {
      const supplierUser = ownerOf(l.offerId)
      if (supplierUser) winners.add(supplierUser)
      return createTransaction(userId, {
        title: `${a.lot.item} ${l.quantity.toLocaleString('id-ID')} ${a.lot.quantity.unit}`, role: 'buyer',
        counterparty: { name: l.supplier, kind: 'business', verified: true },
        quantity: { value: l.quantity, unit: a.lot.quantity.unit }, unitPriceIdr: l.priceIdr, auctionId: a.id,
      }, supplierUser).id
    })
    for (const [uid, up] of allPersonal()) {
      const b = up.bids[a.id]
      if (!b || uid === userId) continue
      b.status = winners.has(uid) ? 'won' : 'lost'
      b.updatedAt = now()
      notify(uid, winners.has(uid)
        ? { type: 'winning_bid', title: `Kamu memenangkan ${a.title}`, body: 'Pembeli menetapkanmu sebagai pemenang. Setujui agreement-nya.', href: '/app/transactions' }
        : { type: 'auction_ending', title: `${a.title} sudah diputuskan`, body: 'Bid kamu tidak dipilih kali ini.', href: `/auctions/${a.id}` })
    }
    const demand = p.listings.find((l) => l.listing.kind === 'demand' && (l.listing as DemandListing).auctionId === a.id)
    if (demand) {
      demand.listing.status = 'matched'
      demand.history.unshift({ at: now(), status: 'matched', note: `Award ke ${lines.length} supplier` })
    }
    savePersonal()
    return HttpResponse.json({ transactionIds: ids })
  })),

  // Transactions (PRD §8.9)
  http.get(api('/me/transactions'), authed(({ p, request }) => {
    const q = new URL(request.url).searchParams
    return HttpResponse.json(
      p.transactions
        .map(ensureF6)
        .filter((t) => (!q.get('role') || t.role === q.get('role')) && (!q.get('status') || q.get('status')!.split(',').includes(t.status)))
        .map(({ timeline: _t, documents: _d, payment: _p, delivery: _v, dispute: _x, shipments: _s, reviews: _r, ...t }) => t),
    )
  })),
  http.get(api('/me/transactions/:id'), authed(({ p, params }) => {
    const t = p.transactions.find((x) => x.id === params.id)
    return t ? HttpResponse.json(ensureF6(t)) : fail(404, 'not_found', 'Transaksi tidak ditemukan')
  })),
  http.post(api('/me/transactions/:id/actions'), authed(async ({ p, params, userId, request }) => {
    const t = p.transactions.find((x) => x.id === params.id)
    if (!t) return fail(404, 'not_found', 'Transaksi tidak ditemukan')
    const input = (await request.json()) as ActionInput
    if (input.action === 'pay') return fail(409, 'payment_required', PAY_VIA_GATEWAY)
    const res = applyAction(t, actorName(userId), input)
    return res.ok ? HttpResponse.json(res.tx) : fail(res.status, res.code, res.message, res.fields)
  })),

  // Payments through the gateway (Midtrans Core API in the API; src/mocks/payments.ts here)
  http.post(api('/me/transactions/:id/payments'), authed(async ({ p, params, userId, request }) => {
    const t = p.transactions.find((x) => x.id === params.id)
    if (!t) return fail(404, 'not_found', 'Transaksi tidak ditemukan')
    const res = createPayment(ensureF6(t), (await request.json()) as PaymentInput, actorName(userId))
    return res.ok ? HttpResponse.json(res.payment, { status: 201 }) : fail(res.status, res.code, res.message, res.fields)
  })),
  http.get(api('/me/transactions/:id/payments/current'), authed(({ p, params }) => {
    const t = p.transactions.find((x) => x.id === params.id)
    return t ? HttpResponse.json(currentPayment(t)) : fail(404, 'not_found', 'Transaksi tidak ditemukan')
  })),
  http.post(api('/me/transactions/:id/payments/current/cancel'), authed(({ p, params }) => {
    const t = p.transactions.find((x) => x.id === params.id)
    if (!t) return fail(404, 'not_found', 'Transaksi tidak ditemukan')
    const res = cancelPayment(t)
    return res.ok ? HttpResponse.json(res.payment) : fail(res.status, res.code, res.message, res.fields)
  })),

  // Finance: escrow, payouts, withdrawals (PRD F6)
  http.get(api('/me/finance'), authed(({ userId }) => HttpResponse.json(financeOf(userId)))),
  http.put(api('/me/finance/bank'), authed(async ({ userId, request }) => {
    const bank = (await request.json()) as { bank: string; accountNo: string; holder: string }
    const fields: Record<string, string> = {}
    if (!bank.bank?.trim()) fields.bank = 'Pilih bank'
    if (!/^\d{8,16}$/.test(bank.accountNo ?? '')) fields.accountNo = '8–16 digit angka'
    if (!bank.holder?.trim()) fields.holder = 'Isi nama pemilik rekening'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Data rekening belum lengkap', fields)
    setBank(userId, bank)
    audit({ actor: actorName(userId), action: 'Ubah rekening pencairan', entity: { type: 'user', id: userId, label: actorName(userId) }, changes: [{ field: 'Rekening', after: `${bank.bank} ••${bank.accountNo.slice(-4)}` }] })
    return HttpResponse.json(financeOf(userId))
  })),
  http.post(api('/me/finance/withdrawals'), authed(async ({ userId, request }) => {
    const { amountIdr } = (await request.json()) as { amountIdr: number }
    const error = withdraw(userId, Number(amountIdr))
    if (error) return fail(422, 'validation', error, { amountIdr: error })
    audit({ actor: actorName(userId), action: `Tarik dana ${formatIdr(Number(amountIdr))}`, entity: { type: 'user', id: userId, label: actorName(userId) } })
    return HttpResponse.json(financeOf(userId), { status: 201 })
  })),

  // Notifications (PRD §8.11)
  http.get(api('/me/notifications'), authed(({ p }) => HttpResponse.json(p.notifications))),
  http.post(api('/me/notifications/read'), authed(async ({ p, request }) => {
    const { ids } = (await request.json()) as { ids?: string[] }
    for (const n of p.notifications) if (!ids || ids.includes(n.id)) n.read = true
    savePersonal()
    return new HttpResponse(null, { status: 204 })
  })),
  http.get(api('/me/notification-prefs'), authed(({ p }) => HttpResponse.json(p.prefs))),
  http.put(api('/me/notification-prefs'), authed(async ({ p, request }) => {
    p.prefs = (await request.json()) as NotificationPrefs
    savePersonal()
    return HttpResponse.json(p.prefs)
  })),
]

/** Bot bids beat a user's leading bid: mark it outbid and tell them (called by the realtime mock). */
export function onCompetitorBid(auctionId: string, priceIdr: number) {
  const a = economy.auctions.find((x) => x.id === auctionId)
  if (!a) return
  for (const [userId, p] of allPersonal()) {
    const b = p.bids[auctionId]
    if (!b || b.status !== 'leading') continue
    const beaten = lowerWins(a.type) ? priceIdr < b.priceIdr : priceIdr > b.priceIdr
    if (!beaten) continue
    b.status = 'outbid'
    b.updatedAt = now()
    savePersonal()
    notify(userId, { type: 'outbid', title: `Kamu tersalip di ${a.title}`, body: a.visibility === 'full' ? `Harga terbaik sekarang ${formatIdr(priceIdr)}/${a.lot.quantity.unit}.` : 'Peringkatmu turun. Cek auction room.', href: `/auctions/${a.id}` })
  }
}

/** Settle users' bids and owned auctions when an auction closes. */
export function onAuctionClosed(auctionId: string) {
  const a = economy.auctions.find((x) => x.id === auctionId)
  if (!a) return
  // Org lots: the team is told once, when the business auction's last lot closes; bids settle at the org's award.
  if (notifyOrgLotsClosed(a.id)) return
  const ownerId = economy.owners.get(a.id)
  if (ownerId) {
    notify(ownerId, { type: 'auction_ending', title: `${a.title} sudah ditutup`, body: `${a.bidCount} bid masuk. Bandingkan penawaran dan tetapkan pemenang.`, href: `/app/auctions/${a.id}/evaluate` })
    return // participants' bids on a buyer's auction are settled when the buyer awards
  }
  // Rounds of a market run by a market maker account are settled per member (PRD F6, mocks/settle.ts).
  const collective = db.users.some((u) => isMaker(u.id) && operatedIds(u.id).includes(a.marketId))
  for (const [userId, p] of allPersonal()) {
    const b = p.bids[auctionId]
    if (!b || b.status === 'withdrawn') continue
    const best = economy.bestPrice.get(a.id)
    const won = a.type === 'sealed' ? Math.random() < 0.5 : b.status === 'leading' && best === b.priceIdr
    b.status = won ? 'won' : 'lost'
    b.updatedAt = now()
    if (won && collective) {
      notify(userId, { type: 'winning_bid', title: `Kamu memenangkan ${a.title}`, body: `Harga ${formatIdr(b.priceIdr)}/${a.lot.quantity.unit}. Transaksi per anggota dibuat saat market maker melakukan settlement kolektif.`, href: `/auctions/${a.id}` })
    } else if (won) {
      const tx = createTransaction(userId, {
        title: `${a.lot.item} ${a.lot.quantity.value.toLocaleString('id-ID')} ${a.lot.quantity.unit}`, role: lowerWins(a.type) ? 'supplier' : 'buyer',
        counterparty: { name: economy.markets.find((m) => m.id === a.marketId)?.maker.name ?? a.marketName, kind: 'business', verified: true },
        quantity: a.lot.quantity, unitPriceIdr: b.priceIdr, totalIdr: b.priceIdr * a.lot.quantity.value,
        dueAt: new Date(Date.now() + 14 * 864e5).toISOString(), auctionId: a.id,
      })
      notify(userId, { type: 'winning_bid', title: `Kamu memenangkan ${a.title}`, body: `Harga ${formatIdr(b.priceIdr)}/${a.lot.quantity.unit}. Transaksi dibuat.`, href: `/app/transactions/${tx.id}` })
    } else {
      notify(userId, { type: 'auction_ending', title: `${a.title} ditutup`, body: 'Bid kamu tidak menang kali ini.', href: `/auctions/${a.id}` })
    }
    savePersonal()
  }
}
