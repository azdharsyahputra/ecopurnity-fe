import type { Tone } from '@/domain/status'
import type { AccountStatus, AlertStatus, AlertType, DocKind, Finding, VerificationStatus } from './types'

export const ACCOUNT_STATUS: Record<AccountStatus, [string, Tone]> = {
  active: ['Aktif', 'green'],
  restricted: ['Dibatasi', 'orange'],
  suspended: ['Suspended', 'red'],
}

export const VERIFICATION_STATUS: Record<VerificationStatus, [string, Tone]> = {
  pending: ['Menunggu review', 'yellow'],
  approved: ['Disetujui', 'green'],
  rejected: ['Ditolak', 'red'],
  reupload: ['Unggah ulang', 'orange'],
}

export const DOC_KIND: Record<DocKind, string> = { nib: 'NIB', npwp: 'NPWP', akta: 'Akta pendirian', ktp: 'KTP', selfie: 'Selfie + KTP' }

export const ALERT_TYPE: Record<AlertType, { label: string; network: boolean }> = {
  bid_manipulation: { label: 'Bid manipulation', network: false },
  collusion: { label: 'Collusion pattern', network: true },
  fake_accounts: { label: 'Fake accounts', network: true },
  abnormal_bidding: { label: 'Abnormal bidding', network: false },
  wash_trading: { label: 'Wash trading', network: true },
  price_manipulation: { label: 'Sudden price manipulation', network: false },
  transaction_network: { label: 'Suspicious transaction network', network: true },
}

export const ALERT_STATUS: Record<AlertStatus, [string, Tone]> = {
  new: ['Baru', 'orange'],
  investigating: ['Investigasi', 'blue'],
  escalated: ['Dieskalasi', 'red'],
  dismissed: ['Dismissed', 'gray'],
  closed: ['Ditutup', 'gray'],
}

export const SEVERITY: Record<Finding['severity'], [string, Tone]> = { high: ['Tinggi', 'red'], medium: ['Sedang', 'orange'], low: ['Rendah', 'yellow'] }

/** Risk score → tone, for score pills and graph nodes. */
export const riskTone = (score: number): Tone => (score >= 80 ? 'red' : score >= 60 ? 'orange' : 'yellow')

/** RFC 4180-ish CSV: quote every cell, double inner quotes. */
export function toCsv(rows: (string | number | undefined)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
}
