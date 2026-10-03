// Price suggestion for a new listing (PRD F6): quartiles of recent market medians and comparable
// listings in the same category and unit. The BE should compute it from cleared trades instead.

export interface PriceSuggestion {
  medianIdr: number
  lowIdr: number
  highIdr: number
  sample: number
}

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo)
}

/** Null below 3 data points: too few to suggest anything honest. */
export function priceSuggestion(samples: number[]): PriceSuggestion | null {
  const s = samples.filter((x) => x > 0).sort((a, b) => a - b)
  if (s.length < 3) return null
  const round = (x: number) => Math.round(x / 50) * 50
  return { medianIdr: round(quantile(s, 0.5)), lowIdr: round(quantile(s, 0.25)), highIdr: round(quantile(s, 0.75)), sample: s.length }
}

/** Where a price sits against the suggestion, for the hint under the price field. */
export function priceVerdict(priceIdr: number, s: PriceSuggestion): 'low' | 'fair' | 'high' {
  return priceIdr < s.lowIdr ? 'low' : priceIdr > s.highIdr ? 'high' : 'fair'
}
