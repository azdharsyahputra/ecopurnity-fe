import { expect, test } from 'vitest'
import { kycLevel, limitError } from './kyc'

test('level follows the strongest verification', () => {
  expect(kycLevel({ email: true, phone: false, identity: 'none' })).toBe(0)
  expect(kycLevel({ email: true, phone: true, identity: 'pending' })).toBe(1)
  expect(kycLevel({ email: true, phone: false, identity: 'verified' })).toBe(2)
})

test('limit blocks only above the level cap', () => {
  expect(limitError(0, 10_000_000)).toBeNull()
  expect(limitError(0, 10_000_001)).toMatch(/nomor HP/)
  expect(limitError(2, 3_000_000_000)).toMatch(/organisasi/)
})
