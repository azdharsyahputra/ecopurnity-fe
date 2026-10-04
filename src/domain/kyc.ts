import { formatIdr } from './format'
import type { Identity } from './types'





export type KycLevel = 0 | 1

export const KYC_LEVELS: Record<KycLevel, { label: string; limitIdr: number; next?: string }> = {
  0: { label: 'Email', limitIdr: 10_000_000, next: 'Verifikasi KTP untuk naik ke Rp 2 M per transaksi.' },
  1: { label: 'KTP', limitIdr: 2_000_000_000 },
}

export function kycLevel(v: Identity['profile']['verification']): KycLevel {
  return v.identity === 'verified' ? 1 : 0
}


export function limitError(level: KycLevel, valueIdr: number): string | null {
  const l = KYC_LEVELS[level]
  if (valueIdr <= l.limitIdr) return null
  return `Nilai ${formatIdr(valueIdr)} melebihi batas ${formatIdr(l.limitIdr)} untuk level ${l.label}. ${l.next ?? 'Gunakan akun organisasi untuk transaksi sebesar ini.'}`
}
