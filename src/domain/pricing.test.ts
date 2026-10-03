import { expect, test } from 'vitest'
import { priceSuggestion, priceVerdict } from './pricing'

test('quartiles of the samples, rounded to Rp 50', () => {
  expect(priceSuggestion([1000, 2000])).toBeNull()
  const s = priceSuggestion([1000, 2000, 3000, 4000, 5000, 0])!
  expect(s).toEqual({ medianIdr: 3000, lowIdr: 2000, highIdr: 4000, sample: 5 })
  expect([priceVerdict(1500, s), priceVerdict(3000, s), priceVerdict(4500, s)]).toEqual(['low', 'fair', 'high'])
})
