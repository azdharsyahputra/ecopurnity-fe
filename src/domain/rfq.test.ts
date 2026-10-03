import { describe, expect, it } from 'vitest'
import { botCounterReply, dealPrice, quoteActions, quoteTransition } from './rfq'

describe('rfq negotiation', () => {
  it('splits actions by side and closes everything once the RFQ is awarded', () => {
    expect(quoteActions('submitted', 'buyer', true)).toEqual(['accept', 'counter', 'decline'])
    expect(quoteActions('countered', 'supplier', true)).toEqual(['revise', 'accept_counter', 'withdraw'])
    expect(quoteActions('submitted', 'buyer', false)).toEqual([])
    expect(quoteTransition('accepted', 'buyer', 'accept')).toBeNull()
    expect(quoteTransition('countered', 'supplier', 'accept_counter')).toBe('accepted')
  })

  it('closes at the counter price only when the supplier accepts it', () => {
    expect(dealPrice({ priceIdr: 100, counterPriceIdr: 90, status: 'countered' }, 'accept_counter')).toBe(90)
    expect(dealPrice({ priceIdr: 100, counterPriceIdr: 90, status: 'submitted' }, 'accept')).toBe(100)
  })

  it('bots accept close counters and meet halfway otherwise', () => {
    expect(botCounterReply(1000, 960)).toEqual({ action: 'accept_counter' })
    expect(botCounterReply(1000, 800)).toEqual({ action: 'revise', priceIdr: 900 })
  })
})
