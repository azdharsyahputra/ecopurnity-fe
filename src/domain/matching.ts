// Smart Matching score (PRD §8.6): "what you have" against "what an opportunity needs".
// Shared by the mock API; the BE engine should expose the same parts so the UI can explain a score.

export interface MatchInput {
  categoryMatch: boolean
  distanceKm: number
  /** The user's delivery radius. */
  radiusKm: number
  /** What the user has ÷ the opportunity's gap, in the same unit; null when units can't be compared. */
  coverage: number | null
  /** Engine confidence in the opportunity, 0–1. */
  confidence: number
}

export const MATCH_WEIGHTS = { category: 35, distance: 25, coverage: 25, confidence: 15 } as const

export type MatchParts = Record<keyof typeof MATCH_WEIGHTS, number>

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * 0–100. Distance is full inside the radius and fades to 0 at 3× the radius;
 * coverage is capped at 1 (having more than the gap isn't better) and counts half when units differ.
 */
export function scoreMatch(m: MatchInput): { score: number; parts: MatchParts } {
  const radius = Math.max(1, m.radiusKm)
  const distance = m.distanceKm <= radius ? 1 : clamp01(1 - (m.distanceKm - radius) / (2 * radius))
  const parts: MatchParts = {
    category: MATCH_WEIGHTS.category * (m.categoryMatch ? 1 : 0),
    distance: Math.round(MATCH_WEIGHTS.distance * distance),
    coverage: Math.round(MATCH_WEIGHTS.coverage * (m.coverage === null ? 0.5 : clamp01(m.coverage))),
    confidence: Math.round(MATCH_WEIGHTS.confidence * clamp01(m.confidence)),
  }
  return { score: parts.category + parts.distance + parts.coverage + parts.confidence, parts }
}

/** Value of the part of the gap this user can fill: min(have, gap) × unit price. */
export const estimateMatchValue = (haveQty: number, gapQty: number, unitPriceIdr: number) =>
  Math.round(Math.max(0, Math.min(haveQty, gapQty)) * unitPriceIdr)
