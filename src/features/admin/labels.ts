import type { Tone } from '@/domain/status'
import type { AccountStatus, AlertStatus, AlertType, DocKind, Finding, VerificationStatus, WithdrawalStatus } from './types'

export const ACCOUNT_STATUS: Record<AccountStatus, [string, Tone]> = {
  active: ['Aktif', 'green'],
  restricted: ['Dibatasi', 'orange'],
  suspended: ['Suspended', 'red'],
}

export const VERIFICATION_STATUS: Record<VerificationStatus, [string, Tone]> = {
  pending: ['Menunggu peninjauan', 'yellow'],
  approved: ['Disetujui', 'green'],
  rejected: ['Ditolak', 'red'],
  reupload: ['Unggah ulang', 'orange'],
}

export const DOC_KIND: Record<DocKind, string> = { nib: 'NIB', npwp: 'NPWP', akta: 'Akta pendirian', ktp: 'KTP', selfie: 'Selfie + KTP' }

export const ALERT_TYPE: Record<AlertType, { label: string; network: boolean }> = {
  bid_manipulation: { label: 'Manipulasi bid', network: false },
  collusion: { label: 'Pola kolusi', network: true },
  fake_accounts: { label: 'Akun palsu', network: true },
  abnormal_bidding: { label: 'Penawaran tidak wajar', network: false },
  wash_trading: { label: 'Transaksi semu', network: true },
  price_manipulation: { label: 'Manipulasi harga mendadak', network: false },
  transaction_network: { label: 'Jaringan transaksi mencurigakan', network: true },
}

export const ALERT_STATUS: Record<AlertStatus, [string, Tone]> = {
  new: ['Baru', 'orange'],
  investigating: ['Investigasi', 'blue'],
  escalated: ['Dieskalasi', 'red'],
  dismissed: ['Dikesampingkan', 'gray'],
  closed: ['Ditutup', 'gray'],
}

export const SEVERITY: Record<Finding['severity'], [string, Tone]> = { high: ['Tinggi', 'red'], medium: ['Sedang', 'orange'], low: ['Rendah', 'yellow'] }


export const riskTone = (score: number): Tone => (score >= 80 ? 'red' : score >= 60 ? 'orange' : 'yellow')


export function toCsv(rows: (string | number | undefined)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
}

export const WITHDRAWAL_STATUS: Record<WithdrawalStatus, [string, Tone]> = {
  processing: ['Diproses', 'yellow'],
  paid: ['Dibayar', 'green'],
  rejected: ['Ditolak', 'red'],
}
