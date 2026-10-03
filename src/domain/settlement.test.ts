import { describe, expect, it } from 'vitest'
import { membersForLot, splitProRata } from './settlement'

describe('aggregated settlement', () => {
  it('splits whole units in proportion and always adds up to the lot', () => {
    const out = splitProRata(1000, [{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }, { id: 'c', quantity: 1 }])
    expect(out.map((x) => x.quantity)).toEqual([500, 250, 250])
    const odd = splitProRata(10, [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }, { id: 'c', quantity: 1 }])
    expect(odd.reduce((s, x) => s + x.quantity, 0)).toBe(10)
    expect(Math.max(...odd.map((x) => x.quantity)) - Math.min(...odd.map((x) => x.quantity))).toBeLessThanOrEqual(1)
  })

  it('handles empty pools without dividing by zero', () => {
    expect(splitProRata(100, [{ id: 'a', quantity: 0 }])).toEqual([{ id: 'a', quantity: 0, share: 0 }])
  })

  it('fills the rest of the lot with untracked participants', () => {
    const m = membersForLot(1000, [{ id: 'rina', quantity: 200 }], ['p1', 'p2'])
    expect(m).toEqual([{ id: 'rina', quantity: 200 }, { id: 'p1', quantity: 400 }, { id: 'p2', quantity: 400 }])
    expect(membersForLot(100, [{ id: 'x', quantity: 150 }], ['p1'])).toEqual([{ id: 'x', quantity: 150 }])
  })
})
