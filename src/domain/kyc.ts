import { formatIdr } from './format'
import type { Identity } from './types'

// Commitment limits per verification level (PRD F6). A commitment is a bid, a Dutch accept, a buyer
// auction or an accepted quote, valued at price × quantity. Organisations are verified separately.

export type KycLevel = 0 | 1 | 2

export const KYC_LEVELS: Record<KycLevel, { label: string; limitIdr: number; next?: string }> = {
  0: { label: 'Email', limitIdr: 10_000_000, next: 'Verifikasi nomor HP untuk naik ke Rp 100 jt per transaksi.' },
  1: { label: 'Email + HP', limitIdr: 100_000_000, next: 'Verifikasi KTP untuk naik ke Rp 2 M per transaksi.' },
  2: { label: 'KTP terverifikasi', limitIdr: 2_000_000_000 },
}

export function kycLevel(v: Identity['profile']['verification']): KycLevel {
  if (v.identity === 'verified') return 2
  return v.phone ? 1 : 0
}

/** Null when the commitment fits the level, otherwise the message to show. */
export function limitError(level: KycLevel, valueIdr: number): string | null {
  const l = KYC_LEVELS[level]
  if (valueIdr <= l.limitIdr) return null
  return `Nilai ${formatIdr(valueIdr)} melebihi batas ${formatIdr(l.limitIdr)} untuk level ${l.label}. ${l.next ?? 'Gunakan akun organisasi untuk transaksi sebesar ini.'}`
}
