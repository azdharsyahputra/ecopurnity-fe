import type { AllocationLine, AuctionType, Offer } from './types'
import type { AuctionStatus, BidStatus } from './status'
import type { WithdrawRule } from './org'

// Bid rules + Smart Allocation (PRD §8.8, §9.6). Shared by the bid box and the mock API.

type Priced = { type: AuctionType; openingPriceIdr: number; currentPriceIdr?: number; minStepIdr: number }

/** Lower wins in reverse/sealed procurement; higher wins in forward. */
export const lowerWins = (type: AuctionType) => type !== 'forward'

/** The price a new bid must beat (inclusive), or the opening price when nothing is visible yet. */
export function bidLimit(a: Priced) {
  if (a.type === 'sealed' || a.currentPriceIdr === undefined) return a.openingPriceIdr
  return lowerWins(a.type) ? a.currentPriceIdr - a.minStepIdr : a.currentPriceIdr + a.minStepIdr
}

/** Error message for an invalid bid, or null when it can be placed. */
export function validateBid(a: Priced, priceIdr: number): string | null {
  if (!Number.isFinite(priceIdr) || priceIdr <= 0) return 'Masukkan harga yang valid'
  const limit = bidLimit(a)
  if (lowerWins(a.type) && priceIdr > limit) return `Bid harus ≤ Rp ${limit.toLocaleString('id-ID')}`
  if (!lowerWins(a.type) && priceIdr < limit) return `Bid harus ≥ Rp ${limit.toLocaleString('id-ID')}`
  return null
}

/**
 * Why a bid cannot be withdrawn now, or null when it can (MyBid.canWithdraw; the API runs the same table). Lots of a
 * business auction follow its withdraw rule; every other auction allows it until 30 minutes before the close. A leading
 * bid never: it is the auction's best price.
 */
export function withdrawBlock(a: { status: AuctionStatus; endsAt: string }, bid: BidStatus, rule: WithdrawRule = 'before_last_30', now = Date.now()): string | null {
  if (a.status !== 'live' && a.status !== 'extended') return 'Auction tidak sedang berjalan'
  if (bid === 'withdrawn') return 'Bid sudah ditarik'
  if (rule === 'never') return 'Bid di auction ini mengikat, tidak bisa ditarik'
  if (rule === 'anytime' && bid === 'leading') return 'Bid terdepan tidak bisa ditarik'
  if (rule === 'before_last_30' && (bid === 'leading' || new Date(a.endsAt).getTime() - now <= 30 * 60_000)) return 'Bid terdepan atau 30 menit terakhir tidak bisa ditarik'
  return null
}

/** 1-based rank of `price` among everyone's best prices (ties favour the earlier bid, i.e. others). */
export function rankOf(type: AuctionType, price: number, others: number[]) {
  return 1 + others.filter((o) => (lowerWins(type) ? o <= price : o >= price)).length
}

/**
 * Cheapest split that covers `quantity`: take offers by price (reputation breaks ties),
 * each up to its capacity. Returns fewer units than asked if capacity runs out.
 */
export function suggestAllocation(offers: Offer[], quantity: number): AllocationLine[] {
  const sorted = [...offers].sort((x, y) => x.priceIdr - y.priceIdr || y.supplier.reputation - x.supplier.reputation)
  const lines: AllocationLine[] = []
  let left = quantity
  for (const o of sorted) {
    if (left <= 0) break
    const take = Math.min(left, o.capacity.value)
    lines.push({ offerId: o.id, supplier: o.supplier.name, quantity: take, priceIdr: o.priceIdr })
    left -= take
  }
  return lines
}
