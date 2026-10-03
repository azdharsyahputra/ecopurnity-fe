import { describe, expect, it } from 'vitest'
import { activeVersion, addVersion, defaultRules, diffRules, pendingVersion, rulesToLabeled, validateRules, type MarketRules } from './marketRules'
import { canMove, simulateMarket } from './mm'

const n = (s: string) => s.replace(/\u00a0|\u202f/g, ' ')

const base: MarketRules = {
  eligibility: 'verified', visibility: 'full', minStepPct: 1, minQuantity: 100, maxQuantity: 5_000,
  windowStart: '2026-10-05', windowEnd: '2026-10-09', region: 'Jawa Barat', radiusKm: 75, award: 'highest_price',
}

describe('market rules', () => {
  it('diffs only changed fields, with display text', () => {
    expect(diffRules(base, base, 'kg')).toEqual([])
    const d = diffRules(base, { ...base, maxQuantity: 8_000, award: 'score' }, 'kg').map((c) => ({ ...c, before: n(c.before), after: n(c.after) }))
    expect(d).toEqual([
      { field: 'Kuantitas maksimum', before: '5.000 kg per peserta', after: '8.000 kg per peserta' },
      { field: 'Penetapan pemenang', before: 'Harga tertinggi', after: 'Skor harga 70% + kualitas 30%' },
    ])
  })

  it('validates quantities, window and radius', () => {
    expect(validateRules(base)).toEqual({})
    const e = validateRules({ ...base, minQuantity: 0, maxQuantity: -1, windowEnd: '2026-10-01', radiusKm: 0, region: ' ' })
    expect(Object.keys(e).sort()).toEqual(['maxQuantity', 'minQuantity', 'radiusKm', 'region', 'windowEnd'])
  })

  it('new versions only take effect from the next round', () => {
    let v = [{ version: 1, rules: base, effectiveFromRound: 1, createdAt: '', author: 'a' }]
    // Before any round runs, v1 is active and nothing is pending.
    expect(activeVersion(v, 0).version).toBe(1)
    expect(pendingVersion(v, 0)).toBeUndefined()

    // Edit during round 3: round 3 keeps v1, v2 waits for round 4.
    v = addVersion(v, { ...base, radiusKm: 100 }, 3, 'a', 'perluas', 'x')
    expect(v[1]).toMatchObject({ version: 2, effectiveFromRound: 4, reason: 'perluas' })
    expect(activeVersion(v, 3).version).toBe(1)
    expect(pendingVersion(v, 3)?.version).toBe(2)

    // Round 4 starts: v2 governs it, nothing pending.
    expect(activeVersion(v, 4).version).toBe(2)
    expect(pendingVersion(v, 4)).toBeUndefined()

    // A second edit before round 4 supersedes v2 for the same next round.
    const w = addVersion(v, { ...base, radiusKm: 150 }, 3, 'a')
    expect(activeVersion(w, 4).version).toBe(3)
  })

  it('renders the public rule list in field order', () => {
    expect(rulesToLabeled(base, 'kg').map((r) => r.label)[0]).toBe('Eligibility')
    expect(rulesToLabeled(base, 'kg')).toHaveLength(10)
  })
})

describe('market formation', () => {
  it('pipeline moves: market live only via publish, dismissed can be restored', () => {
    expect(canMove('detected', 'evaluating')).toBe(true)
    expect(canMove('forming', 'market_live')).toBe(false)
    expect(canMove('market_live', 'dismissed')).toBe(false)
    expect(canMove('dismissed', 'detected')).toBe(true)
  })

  it('simulation: stricter entry means fewer participants; reverse pushes price down', () => {
    const input = {
      invited: 100, demand: 1_000, supply: 600, referencePriceIdr: 10_000, mechanism: 'reverse_auction' as const,
      rules: { eligibility: 'open' as const, radiusKm: 80 }, approval: 'auto' as const, supplierVerification: 'none' as const,
    }
    const open = simulateMarket(input)
    const strict = simulateMarket({ ...input, rules: { eligibility: 'verified_docs', radiusKm: 80 }, approval: 'manual', supplierVerification: 'verified_business' })
    expect(strict.participants).toBeLessThan(open.participants)
    expect(open.buyers + open.suppliers).toBe(open.participants)
    expect(open.priceHighIdr).toBeLessThan(10_000 * 1.01)
    expect(simulateMarket({ ...input, mechanism: 'forward_auction' }).priceLowIdr).toBeGreaterThan(10_000 * 0.99)
  })
})

describe('defaultRules window', () => {
  const m = { demand: { value: 600, unit: 'kg' }, supply: { value: 800, unit: 'kg' }, region: 'Jawa Barat', mechanism: 'reverse_auction' as const }
  it('runs from today to Friday on a weekday', () => {
    const r = defaultRules(m, new Date(2026, 9, 1)) // Thursday
    expect([r.windowStart, r.windowEnd]).toEqual(['2026-10-01', '2026-10-02'])
  })
  it('moves to next week on a weekend', () => {
    const r = defaultRules(m, new Date(2026, 9, 3)) // Saturday
    expect([r.windowStart, r.windowEnd]).toEqual(['2026-10-05', '2026-10-09'])
  })
})
