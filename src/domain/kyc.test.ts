import { expect, test } from 'vitest'
import { kycLevel, limitError } from './kyc'

test('level follows the KTP verification', () => {
  expect(kycLevel({ email: true, identity: 'none' })).toBe(0)
  expect(kycLevel({ email: true, identity: 'pending' })).toBe(0)
  expect(kycLevel({ email: true, identity: 'verified' })).toBe(1)
})

test('limit blocks only above the level cap', () => {
  expect(limitError(0, 10_000_000)).toBeNull()
  expect(limitError(0, 10_000_001)).toBe('Nilai Rp 10.000.001 melebihi batas Rp 10.000.000 untuk level Email. Verifikasi KTP untuk naik ke Rp 2 M per transaksi.')
  expect(limitError(1, 2_000_000_000)).toBeNull()
  expect(limitError(1, 3_000_000_000)).toMatch(/organisasi/)
})
