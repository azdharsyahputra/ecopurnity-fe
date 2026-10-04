import type { AllocationLine, AuctionType, Offer } from './types'
import type { AuctionStatus, BidStatus } from './status'
import type { WithdrawRule } from './org'



type Priced = { type: AuctionType; openingPriceIdr: number; currentPriceIdr?: number; minStepIdr: number }


export const lowerWins = (type: AuctionType) => type !== 'forward'


export function bidLimit(a: Priced) {
  if (a.type === 'sealed' || a.currentPriceIdr === undefined) return a.openingPriceIdr
  return lowerWins(a.type) ? a.currentPriceIdr - a.minStepIdr : a.currentPriceIdr + a.minStepIdr
}


export function validateBid(a: Priced, priceIdr: number): string | null {
  if (!Number.isFinite(priceIdr) || priceIdr <= 0) return 'Masukkan harga yang valid'
  const limit = bidLimit(a)
  if (lowerWins(a.type) && priceIdr > limit) return `Bid harus ≤ Rp ${limit.toLocaleString('id-ID')}`
  if (!lowerWins(a.type) && priceIdr < limit) return `Bid harus ≥ Rp ${limit.toLocaleString('id-ID')}`
  return null
}






export function withdrawBlock(a: { status: AuctionStatus; endsAt: string }, bid: BidStatus, rule: WithdrawRule = 'before_last_30', now = Date.now()): string | null {
  if (a.status !== 'live' && a.status !== 'extended') return 'Auction tidak sedang berjalan'
  if (bid === 'withdrawn') return 'Bid sudah ditarik'
  if (rule === 'never') return 'Bid di auction ini mengikat, tidak bisa ditarik'
  if (rule === 'anytime' && bid === 'leading') return 'Bid terdepan tidak bisa ditarik'
  if (rule === 'before_last_30' && (bid === 'leading' || new Date(a.endsAt).getTime() - now <= 30 * 60_000)) return 'Bid terdepan atau 30 menit terakhir tidak bisa ditarik'
  return null
}


export function rankOf(type: AuctionType, price: number, others: number[]) {
  return 1 + others.filter((o) => (lowerWins(type) ? o <= price : o >= price)).length
}





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
