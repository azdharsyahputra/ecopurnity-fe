import { describe, expect, it } from 'vitest'
import { formatCountdown, formatIdr, formatPercent, formatQty, formatRelative, initials } from './format'
import { STATUS, statusMeta } from './status'


const n = (s: string) => s.replace(/\u00a0|\u202f/g, ' ')

describe('format', () => {
  it('money', () => {
    expect(n(formatIdr(8_400_000_000))).toBe('Rp 8.400.000.000')
    expect(n(formatIdr(8_400_000_000, { compact: true }))).toBe('Rp 8,4 M')
    expect(n(formatIdr(180_000_000, { compact: true }))).toBe('Rp 180 jt')
  })

  it('quantity and percent', () => {
    expect(n(formatQty({ value: 840_000, unit: 'unit/bulan' }))).toBe('840.000 unit/bulan')
    expect(formatPercent(0.834, 1)).toBe('83,4%')
  })

  it('relative time', () => {
    const now = Date.parse('2026-10-03T07:00:00Z')
    expect(formatRelative('2026-10-03T06:59:50Z', now)).toBe('baru saja')
    expect(n(formatRelative('2026-10-03T06:58:00Z', now))).toBe('2 menit yang lalu')
    expect(n(formatRelative('2026-10-03T10:00:00Z', now))).toBe('dalam 3 jam')
  })

  it('countdown', () => {
    expect(formatCountdown(-5)).toBe('00:00:00')
    expect(formatCountdown(3_725_000)).toBe('01:02:05')
    expect(formatCountdown(2 * 86_400_000 + 61_000)).toBe('2h 00:01:01')
  })

  it('initials', () => {
    expect(initials('Ajar  Nugroho Putra')).toBe('AN')
  })
})

describe('status', () => {
  it('every status has a label and tone', () => {
    for (const statuses of Object.values(STATUS)) {
      for (const [label, tone] of Object.values(statuses)) {
        expect(label).toBeTruthy()
        expect(tone).toBeTruthy()
      }
    }
  })

  it('marks live auctions', () => {
    expect(statusMeta('auction', 'live')).toEqual({ label: 'Live', tone: 'lime', live: true })
    expect(statusMeta('auction', 'closed').live).toBe(false)
  })
})

describe('passwordStrength', () => {
  it('scores length then variety', async () => {
    const { passwordStrength } = await import('./password')
    expect(passwordStrength('Ab1!')).toBe(0)
    expect(passwordStrength('abcdefgh')).toBe(1)
    expect(passwordStrength('abcdEFGH')).toBe(2)
    expect(passwordStrength('abcdEFGH12!')).toBe(4)
  })
})

describe('auction rules', () => {
  const reverse = { type: 'reverse' as const, openingPriceIdr: 2400, currentPriceIdr: 2050, minStepIdr: 25 }

  it('enforces the minimum step in the winning direction', async () => {
    const { validateBid, bidLimit } = await import('./auction')
    expect(bidLimit(reverse)).toBe(2025)
    expect(validateBid(reverse, 2025)).toBeNull()
    expect(validateBid(reverse, 2040)).toMatch(/≤/)
    expect(validateBid({ ...reverse, type: 'forward', currentPriceIdr: 91_500, minStepIdr: 500 }, 91_600)).toMatch(/≥/)
    expect(validateBid({ ...reverse, type: 'sealed', currentPriceIdr: undefined }, 2399)).toBeNull()
  })

  it('ranks with ties going to the earlier bid', async () => {
    const { rankOf } = await import('./auction')
    expect(rankOf('reverse', 2000, [2050, 2100])).toBe(1)
    expect(rankOf('reverse', 2050, [2050, 2000])).toBe(3)
    expect(rankOf('forward', 12_500, [12_450])).toBe(1)
  })

  it('allocates cheapest first, capped by capacity', async () => {
    const { suggestAllocation } = await import('./auction')
    const offer = (id: string, priceIdr: number, cap: number, reputation = 90) => ({
      id, priceIdr, capacity: { value: cap, unit: 'unit' }, submittedAt: '', supplier: { name: id, kind: 'business' as const, verified: true, reputation },
    })
    const lines = suggestAllocation([offer('a', 1600, 300), offer('b', 1550, 200), offer('c', 1600, 500, 99)], 600)
    expect(lines.map((l) => [l.offerId, l.quantity])).toEqual([['b', 200], ['c', 400]])
    expect(suggestAllocation([offer('a', 1, 10)], 50).reduce((s, l) => s + l.quantity, 0)).toBe(10)
  })
})
