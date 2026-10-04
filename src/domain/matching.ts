import type { CapacityItem, CategoryId } from './types'




export interface MatchInput {
  categoryMatch: boolean
  distanceKm: number

  radiusKm: number

  coverage: number | null

  confidence: number
}

export const MATCH_WEIGHTS = { category: 35, distance: 25, coverage: 25, confidence: 15 } as const

export type MatchParts = Record<keyof typeof MATCH_WEIGHTS, number>

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))





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


const CATEGORY_HINTS: [RegExp, CategoryId][] = [
  [/truk|angkut|kirim|trip|logistik|pengiriman|gudang/i, 'logistics'],
  [/kemasan|pouch|karton|box|karung/i, 'packaging'],
  [/kopi|bean|pupuk|tani|panen/i, 'agri'],
  [/developer|backend|frontend|software|aplikasi/i, 'it'],
  [/surya|listrik|energi|jelantah/i, 'energy'],
  [/makan|bubuk|gula|katering|beras/i, 'food'],
]


export const itemCategory = (i: Pick<CapacityItem, 'name' | 'detail' | 'categoryId'>): CategoryId | undefined =>
  i.categoryId ?? CATEGORY_HINTS.find(([re]) => re.test(`${i.name} ${i.detail}`))?.[1]


export const estimateMatchValue = (haveQty: number, gapQty: number, unitPriceIdr: number) =>
  Math.round(Math.max(0, Math.min(haveQty, gapQty)) * unitPriceIdr)
