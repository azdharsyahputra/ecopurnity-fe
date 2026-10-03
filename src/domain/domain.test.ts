import { describe, expect, it } from 'vitest'
import { formatCountdown, formatIdr, formatPercent, formatQty, formatRelative, initials } from './format'
import { STATUS, statusMeta } from './status'

// Intl may emit non-breaking spaces; compare on normal spaces.
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
