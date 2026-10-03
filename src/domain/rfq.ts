import type { Quote, QuoteStatus } from './types'

// RFQ negotiation rules (PRD F6): buyer accepts, counters or declines a quote; the supplier revises,
// accepts the counter, or withdraws. Accepting creates the trade at the agreed price.

export type QuoteAction = 'accept' | 'counter' | 'decline' | 'revise' | 'accept_counter' | 'withdraw'

const FLOW: Record<QuoteAction, { by: 'buyer' | 'supplier'; from: QuoteStatus[]; to: QuoteStatus }> = {
  accept: { by: 'buyer', from: ['submitted'], to: 'accepted' },
  counter: { by: 'buyer', from: ['submitted'], to: 'countered' },
  decline: { by: 'buyer', from: ['submitted', 'countered'], to: 'declined' },
  revise: { by: 'supplier', from: ['submitted', 'countered'], to: 'submitted' },
  accept_counter: { by: 'supplier', from: ['countered'], to: 'accepted' },
  withdraw: { by: 'supplier', from: ['submitted', 'countered'], to: 'withdrawn' },
}

export const QUOTE_ACTION_LABEL: Record<QuoteAction, string> = {
  accept: 'Terima penawaran', counter: 'Tawar balik', decline: 'Tolak', revise: 'Revisi harga', accept_counter: 'Terima tawaran balik', withdraw: 'Tarik penawaran',
}

export const quoteActions = (status: QuoteStatus, side: 'buyer' | 'supplier', rfqOpen: boolean): QuoteAction[] =>
  rfqOpen ? (Object.keys(FLOW) as QuoteAction[]).filter((a) => FLOW[a].by === side && FLOW[a].from.includes(status)) : []

export const quoteTransition = (status: QuoteStatus, side: 'buyer' | 'supplier', action: QuoteAction, rfqOpen = true) =>
  quoteActions(status, side, rfqOpen).includes(action) ? FLOW[action].to : null

/** Price the deal closes at: the counter when the supplier accepted it, else the quoted price. */
export const dealPrice = (q: Pick<Quote, 'priceIdr' | 'counterPriceIdr' | 'status'>, action: QuoteAction) =>
  action === 'accept_counter' && q.counterPriceIdr ? q.counterPriceIdr : q.priceIdr

/** How a simulated supplier answers a counter: accept within 5% of its price, otherwise meet halfway. */
export function botCounterReply(quotedIdr: number, counterIdr: number): { action: 'accept_counter' } | { action: 'revise'; priceIdr: number } {
  return counterIdr >= quotedIdr * 0.95 ? { action: 'accept_counter' } : { action: 'revise', priceIdr: Math.round((quotedIdr + counterIdr) / 2) }
}
