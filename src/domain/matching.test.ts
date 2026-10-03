import { describe, expect, it } from 'vitest'
import { MATCH_WEIGHTS, estimateMatchValue, itemCategory, scoreMatch } from './matching'

const base = { categoryMatch: true, distanceKm: 10, radiusKm: 50, coverage: 1, confidence: 1 }

describe('matching', () => {
  it('a perfect match scores 100 and parts add up', () => {
    const { score, parts } = scoreMatch(base)
    expect(score).toBe(100)
    expect(Object.values(parts).reduce((s, p) => s + p, 0)).toBe(score)
  })

  it('category mismatch loses the category weight', () => {
    expect(scoreMatch({ ...base, categoryMatch: false }).score).toBe(100 - MATCH_WEIGHTS.category)
  })

  it('distance fades from the radius to 3× the radius', () => {
    expect(scoreMatch({ ...base, distanceKm: 50 }).parts.distance).toBe(25)
    expect(scoreMatch({ ...base, distanceKm: 100 }).parts.distance).toBe(13)
    expect(scoreMatch({ ...base, distanceKm: 150 }).parts.distance).toBe(0)
    expect(scoreMatch({ ...base, distanceKm: 900 }).parts.distance).toBe(0)
  })

  it('coverage is capped at 1 and counts half when units differ', () => {
    expect(scoreMatch({ ...base, coverage: 5 }).parts.coverage).toBe(25)
    expect(scoreMatch({ ...base, coverage: 0.2 }).parts.coverage).toBe(5)
    expect(scoreMatch({ ...base, coverage: null }).parts.coverage).toBe(13)
  })

  it('uses the item category before guessing from keywords', () => {
    expect(itemCategory({ name: 'Truk engkel', detail: '2 ton', categoryId: 'agri' })).toBe('agri')
    expect(itemCategory({ name: 'Truk engkel', detail: '2 ton' })).toBe('logistics')
    expect(itemCategory({ name: 'Desain grafis', detail: 'Mahir' })).toBeUndefined()
  })

  it('estimated value covers only the gap', () => {
    expect(estimateMatchValue(500, 200, 1_000)).toBe(200_000)
    expect(estimateMatchValue(100, 200, 1_000)).toBe(100_000)
    expect(estimateMatchValue(100, -50, 1_000)).toBe(0)
  })
})
