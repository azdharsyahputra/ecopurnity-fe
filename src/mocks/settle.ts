import { delay, http, HttpResponse } from 'msw'
import type { AuctionDetail, CategoryId } from '@/domain/types'
import { membersForLot, splitPool, splitProRata, type Settlement } from '@/domain/settlement'
import { lowerWins } from '@/domain/auction'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { economy } from './economy'
import { allPersonal, notify } from './personal'
import { ops, operatedIds } from './mm'
import { createTrade } from './trade'
import { SUPPLIERS, makeTx, org, orgAudit, orgUserIds, pools, saveOrg, type StoredPool } from './org'

// Aggregated settlement of market rounds (PRD F6): the winning offer is split pro-rata across the
// members who contributed to the lot (demand in procurement markets, supply in selling markets).

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string) => HttpResponse.json({ error: { code, message } }, { status })
const now = () => new Date().toISOString()

const KEY = 'ecp-mock-settled'
const settled: Record<string, { at: string; trades: number; by: string }> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settled))
  } catch {
    // per-tab only
  }
}

export const settlementOf = (auctionId: string) => settled[auctionId]

/** Listings on platform accounts that sit in this market (demand or supply side). */
export function contributions(marketId: string, kind: 'demand' | 'supply') {
  return allPersonal().flatMap(([userId, p]) =>
    p.listings
      .filter((l) => l.listing.marketId === marketId && l.listing.kind === kind && l.listing.status === 'in_market')
      .map((l) => ({ userId, name: db.users.find((u) => u.id === userId)?.name ?? userId, quantity: l.listing.quantity.value, listingId: l.listing.id })),
  )
}

/** Bot bidders ("Supplier 3") stand for a directory supplier in the pool's category, like org auction offers do. */
function directorySupplier(bidder: string, categoryId: CategoryId) {
  const dir = SUPPLIERS.filter((s) => s.categories.includes(categoryId))
  const n = Number(bidder.match(/\d+/)?.[0] ?? 1)
  return dir.length ? dir[(n - 1) % dir.length] : undefined
}

const poolOf = (auctionId: string) => pools().find((p) => p.auctionId === auctionId)

const sideOf = (a: AuctionDetail) => (lowerWins(a.type) ? 'procurement' : 'selling') as 'procurement' | 'selling'

function preview(a: AuctionDetail): Omit<Settlement, 'settled'> & { winnerUserId?: string } {
  const side = sideOf(a)
  const best = economy.bestPrice.get(a.id) ?? a.currentPriceIdr ?? a.openingPriceIdr
  const winBid = a.bids.find((b) => b.priceIdr === best) ?? a.bids[0]
  const winnerUserId = winBid ? economy.bidOwners.get(winBid.id) : undefined
  const pool = poolOf(a.id)
  const bidder = winnerUserId ? db.users.find((u) => u.id === winnerUserId)!.name : winBid?.bidder ?? (side === 'procurement' ? 'Supplier terpilih' : 'Pembeli terpilih')
  const winner = pool && !winnerUserId ? directorySupplier(bidder, pool.categoryId)?.name ?? bidder : bidder
  const base = { auctionId: a.id, title: a.title, side, unit: a.lot.quantity.unit, lotQty: a.lot.quantity.value, priceIdr: best, winner, winnerUserId }
  // Collective pool round: the lot goes back to the pool's member businesses (names masked unless they opted in).
  if (pool) {
    const lines = splitPool(pool.members, a.lot.quantity.value, best).map((l, i) => ({
      memberId: `pool:${i}`, member: l.optIn ? l.name : `Bisnis lain #${i + 1}`, orgId: l.orgId, quantity: l.quantity, share: l.share, amountIdr: l.amountIdr,
    }))
    return { ...base, lines: lines.filter((l) => l.quantity > 0) }
  }
  const contrib = contributions(a.marketId, side === 'procurement' ? 'demand' : 'supply')
  const o = ops(a.marketId)
  const fillers = o.participants.filter((p) => p.status === 'active' && !p.userId && p.role === (side === 'procurement' ? 'buyer' : 'supplier')).slice(0, 4)
  const members = membersForLot(a.lot.quantity.value, contrib.map((c) => ({ id: `u:${c.userId}:${c.listingId}`, quantity: c.quantity })), fillers.map((f) => `p:${f.name}`))
  const split = splitProRata(a.lot.quantity.value, members)
  const lines = split.filter((s) => s.quantity > 0).map((s) => {
    const [kind, ref] = s.id.split(':')
    const c = kind === 'u' ? contrib.find((x) => `u:${x.userId}:${x.listingId}` === s.id) : undefined
    return { memberId: s.id, member: c?.name ?? ref, userId: c?.userId, quantity: s.quantity, share: s.share, amountIdr: s.quantity * best }
  })
  return { ...base, lines }
}

/**
 * Settles a pool round: each member business gets its own escrow sub-PO with the winner for its pro-rata share,
 * delivered to its own drop point. Fictional members only appear in the split; nothing is stored for them.
 * ponytail: a winner who is a personal platform account gets no supplier-side record; the org side is bot-driven like other org trades.
 */
function settlePool(p: StoredPool, a: AuctionDetail, pv: ReturnType<typeof preview>, by: string) {
  const sup = pv.winnerUserId ? undefined : SUPPLIERS.find((s) => s.name === pv.winner)
  const counterparty = { name: pv.winner, kind: pv.winnerUserId ? 'person' as const : 'business' as const, verified: sup?.verified ?? true }
  const lines = splitPool(p.members, a.lot.quantity.value, pv.priceIdr).map((l) => {
    if (!l.orgId || !l.quantity) return l
    const o = org(l.orgId)
    const req = o.procurements.find((r) => r.poolId === p.id && r.status === 'in_collective')
    // Drop point: the procurement's delivery location, else the org's main warehouse, else its address.
    const w = o.inventory.warehouses[0]
    const t = makeTx({
      title: `${p.title} · ${l.quantity.toLocaleString('id-ID')} ${p.unit} (${a.code})`, role: 'buyer', counterparty, supplierId: sup?.id,
      quantity: { value: l.quantity, unit: p.unit }, unitPriceIdr: pv.priceIdr, auctionId: a.id,
      address: req?.deliveryLocation ?? (w ? `${w.name}, ${w.location}` : o.settings.profile.location),
    })
    Object.assign(t, { makerFeeRate: 0.005, group: { id: p.id, label: `Pool kolektif ${a.code}`, share: l.share } })
    o.transactions.unshift(t)
    if (req) Object.assign(req, { status: 'po_issued', updatedAt: now() })
    orgAudit(o, {
      actor: `${by} (Market Maker)`, action: `Sub-PO dari pool kolektif ${a.code}`, entity: { type: 'transaction', id: t.id, label: `${t.code} ${t.title}` },
      changes: [{ field: 'Bagian pool', after: `${l.quantity.toLocaleString('id-ID')} ${p.unit} (${Math.round(l.share * 100)}%) × ${formatIdr(pv.priceIdr)}` }],
    })
    for (const uid of orgUserIds(l.orgId)) {
      notify(uid, { type: 'transaction_update', title: `Sub-PO pool: ${p.title}`, body: `${l.quantity.toLocaleString('id-ID')} ${p.unit} × ${formatIdr(pv.priceIdr)} dari ${pv.winner}. Setujui agreement-nya.`, href: `/org/${l.orgId}/transactions/${t.id}` })
    }
    return { ...l, transactionId: t.id }
  })
  p.status = 'settled'
  p.settlement = { at: now(), by, winner: pv.winner, priceIdr: pv.priceIdr, lines }
  saveOrg()
  return lines.filter((l) => 'transactionId' in l).length
}

const makerOf = (userId: string, marketId: string) => db.users.some((u) => u.id === userId && u.capabilities.includes('market_maker')) && operatedIds(userId).includes(marketId)

export const settleHandlers = [
  http.get(api('/mm/markets/:id/rounds/:aid/settlement'), async ({ params }) => {
    await delay(200)
    const userId = db.sessionUserId
    const a = economy.auctions.find((x) => x.id === params.aid && x.marketId === params.id)
    if (!userId || !a || !makerOf(userId, a.marketId)) return fail(404, 'not_found', 'Round tidak ditemukan')
    return HttpResponse.json({ ...preview(a), settled: settled[a.id] ?? null })
  }),

  http.post(api('/mm/markets/:id/rounds/:aid/settlement'), async ({ params }) => {
    await delay(400)
    const userId = db.sessionUserId
    const a = economy.auctions.find((x) => x.id === params.aid && x.marketId === params.id)
    if (!userId || !a || !makerOf(userId, a.marketId)) return fail(404, 'not_found', 'Round tidak ditemukan')
    if (a.status !== 'closed' && a.status !== 'awarded') return fail(409, 'not_closed', 'Settlement hanya untuk round yang sudah ditutup')
    if (settled[a.id]) return fail(409, 'already_settled', 'Round ini sudah di-settle')
    const pv = preview(a)
    const by = db.users.find((u) => u.id === userId)!.name
    const pool = poolOf(a.id)
    let trades = pv.lines.length
    if (pool) trades = settlePool(pool, a, pv, by)
    else {
      const winner = pv.winnerUserId ? { userId: pv.winnerUserId } : { party: { name: pv.winner, kind: 'business' as const, verified: true } }
      const group = (share: number) => ({ id: a.id, label: `Kolektif ${a.code}`, share })
      for (const l of pv.lines) {
        const member = l.userId ? { userId: l.userId } : { party: { name: l.member, kind: 'business' as const, verified: true } }
        const res = createTrade({
          title: `${a.lot.item} · ${l.quantity.toLocaleString('id-ID')} ${pv.unit} (${a.code})`,
          buyer: pv.side === 'procurement' ? member : winner, supplier: pv.side === 'procurement' ? winner : member,
          quantity: { value: l.quantity, unit: pv.unit }, unitPriceIdr: pv.priceIdr, terms: 'escrow', makerFeeRate: 0.005, auctionId: a.id, group: group(l.share),
        })
        const own = pv.side === 'procurement' ? res.buyer : res.supplier
        if (l.userId && own) notify(l.userId, { type: 'transaction_update', title: `Bagianmu dari ${a.title}`, body: `${l.quantity.toLocaleString('id-ID')} ${pv.unit} × ${formatIdr(pv.priceIdr)} (${Math.round(l.share * 100)}% lot)`, href: `/app/transactions/${own.id}` })
      }
    }
    a.status = 'awarded'
    settled[a.id] = { at: now(), trades, by }
    save()
    audit({
      actor: `${by} (Market Maker)`, action: `Settlement kolektif ${a.code}`, entity: { type: 'auction', id: a.id, label: a.title },
      changes: pv.lines.map((l) => ({ field: l.member, after: `${l.quantity.toLocaleString('id-ID')} ${pv.unit}` })),
    })
    return HttpResponse.json({ ...pv, settled: settled[a.id] })
  }),
]
