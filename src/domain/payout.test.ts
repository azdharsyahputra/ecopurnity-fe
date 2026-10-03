import { describe, expect, it } from 'vitest'
import { normName, payoutDueAt } from './payout'

describe('payout', () => {
  it('is due one working day later (WIB)', () => {
    expect(payoutDueAt('2026-10-01T03:00:00.000Z')).toBe('2026-10-02T03:00:00.000Z') // Thu → Fri
    expect(payoutDueAt('2026-10-02T03:00:00.000Z')).toBe('2026-10-05T03:00:00.000Z') // Fri → Mon
    expect(payoutDueAt('2026-10-03T20:00:00.000Z')).toBe('2026-10-04T20:00:00.000Z') // Sun 03:00 WIB → Mon 03:00
  })
  it('compares names without case, punctuation or spacing', () => {
    expect(normName(' Budi  santoso. ')).toBe(normName('BUDI SANTOSO'))
    expect(normName('Budi Santosa')).not.toBe(normName('BUDI SANTOSO'))
  })
})
