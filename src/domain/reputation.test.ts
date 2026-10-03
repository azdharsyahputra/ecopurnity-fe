import { describe, expect, it } from 'vitest'
import { BASELINE_SCORE, reputationReport, reputationScore, type ReputationTx } from './reputation'
import type { TransactionStatus } from './status'

const at = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * 864e5).toISOString()

function tx(id: string, status: TransactionStatus, day: number, opts: { cp?: string; due?: number; dispute?: boolean } = {}): ReputationTx {
  return {
    id, title: id, status, counterparty: { name: opts.cp ?? id, kind: 'business', verified: true }, totalIdr: 1_000_000,
    createdAt: at(day), updatedAt: at(day + 5), dueAt: at(opts.due ?? day + 10),
    timeline: [
      { status: 'agreement', at: at(day) },
      { status: 'invoiced', at: new Date(new Date(at(day)).getTime() + 2 * 3_600_000).toISOString() },
      { status: 'completed', at: status === 'completed' ? at(day + 5) : undefined },
    ],
    dispute: opts.dispute ? { status: 'resolved', reason: 'x', openedAt: at(day + 3) } : undefined,
  }
}

describe('reputation score', () => {
  it('new accounts start at the baseline', () => {
    expect(reputationScore([]).score).toBe(BASELINE_SCORE)
    expect(reputationScore([tx('a', 'paid', 0)]).score).toBe(BASELINE_SCORE)
  })

  it('computes the breakdown', () => {
    const { breakdown: b, counts } = reputationScore([
      tx('a', 'completed', 0, { cp: 'X' }),
      tx('b', 'completed', 10, { cp: 'X', due: 12 }),
      tx('c', 'cancelled', 20),
      tx('d', 'completed', 30, { dispute: true }),
    ])
    expect(counts).toEqual({ transactions: 4, successful: 3, disputes: 1, cancelled: 1 })
    expect(b.fulfillmentRate).toBe(0.75)
    expect(b.onTimeRate).toBeCloseTo(2 / 3)
    expect(b.cancellationRate).toBe(0.25)
    expect(b.disputeRate).toBe(0.25)
    expect(b.repeatRate).toBeCloseTo(2 / 3)
    expect(b.volumeIdr).toBe(3_000_000)
    expect(b.responseHours).toBe(2)
  })

  it('a clean record beats one with cancellations and disputes', () => {
    const clean = reputationScore([tx('a', 'completed', 0), tx('b', 'completed', 5)]).score
    const messy = reputationScore([tx('a', 'completed', 0), tx('b', 'cancelled', 5), tx('c', 'completed', 9, { dispute: true })]).score
    expect(clean).toBeGreaterThan(messy)
    expect(clean).toBeLessThanOrEqual(100)
  })
})

describe('reputation report', () => {
  it('trend has 12 months ending now; events carry deltas newest first', () => {
    const r = reputationReport([tx('a', 'completed', 0), tx('b', 'cancelled', 40)], new Date(Date.UTC(2026, 5, 15)))
    expect(r.trend).toHaveLength(12)
    expect(r.trend[11].month).toBe('2026-06')
    expect(r.trend[0].month).toBe('2025-07')
    expect(r.trend[0].score).toBe(BASELINE_SCORE)
    expect(r.events.map((e) => e.id)).toEqual(['b', 'a'])
    expect(r.events[0].delta).toBeLessThan(0)
    expect(r.events[1].score - r.events[1].delta).toBe(BASELINE_SCORE)
  })
})

describe('reviews', () => {
  const review = (rating: number) => ({ rating, quality: rating, timeliness: rating, communication: rating, text: '', by: 'X', at: at(0) })
  it('counts only reviews written by the other side and weighs them in', () => {
    const base = tx('a', 'completed', 0)
    const good = { ...base, role: 'buyer' as const, reviews: { supplier: review(5), buyer: review(1) } }
    const bad = { ...base, role: 'buyer' as const, reviews: { supplier: review(1) } }
    expect(reputationScore([good]).breakdown).toMatchObject({ ratingAvg: 5, ratingCount: 1 })
    expect(reputationScore([good]).score).toBeGreaterThan(reputationScore([bad]).score)
    expect(reputationScore([base]).breakdown.ratingAvg).toBeNull()
  })
})
