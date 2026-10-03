import { delay, http, HttpResponse } from 'msw'
import type { AuctionDetail } from '@/domain/types'
import { membersForLot, splitProRata } from '@/domain/settlement'
import { lowerWins } from '@/domain/auction'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { economy } from './economy'
import { allPersonal, notify } from './personal'
import { ops, operatedIds } from './mm'
import { createTrade } from './trade'

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

const sideOf = (a: AuctionDetail) => (lowerWins(a.type) ? 'procurement' : 'selling') as 'procurement' | 'selling'

function preview(a: AuctionDetail) {
  const side = sideOf(a)
  const best = economy.bestPrice.get(a.id) ?? a.currentPriceIdr ?? a.openingPriceIdr
  const winBid = a.bids.find((b) => b.priceIdr === best) ?? a.bids[0]
  const winnerUserId = winBid ? economy.bidOwners.get(winBid.id) : undefined
  const winner = winnerUserId ? db.users.find((u) => u.id === winnerUserId)!.name : winBid?.bidder ?? (side === 'procurement' ? 'Supplier terpilih' : 'Pembeli terpilih')
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
  return { auctionId: a.id, title: a.title, side, unit: a.lot.quantity.unit, lotQty: a.lot.quantity.value, priceIdr: best, winner, winnerUserId, lines }
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
    a.status = 'awarded'
    const by = db.users.find((u) => u.id === userId)!.name
    settled[a.id] = { at: now(), trades: pv.lines.length, by }
    save()
    audit({
      actor: `${by} (Market Maker)`, action: `Settlement kolektif ${a.code}`, entity: { type: 'auction', id: a.id, label: a.title },
      changes: pv.lines.map((l) => ({ field: l.member, after: `${l.quantity.toLocaleString('id-ID')} ${pv.unit}` })),
    })
    return HttpResponse.json({ ...pv, settled: settled[a.id] })
  }),
]
