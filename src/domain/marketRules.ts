import type { BidVisibility, LabeledValue, MarketMechanism, Quantity } from './types'
import { formatDate, formatNumber } from './format'



export type Eligibility = 'open' | 'verified' | 'verified_docs'
export type AwardRule = 'lowest_price' | 'highest_price' | 'score' | 'pro_rata'

export interface MarketRules {
  eligibility: Eligibility
  visibility: BidVisibility

  minStepPct: number
  minQuantity: number
  maxQuantity: number

  windowStart: string
  windowEnd: string
  region: string
  radiusKm: number
  award: AwardRule
}

export interface RuleVersion {
  version: number
  rules: MarketRules

  effectiveFromRound: number
  createdAt: string
  author: string
  reason?: string
}

export const ELIGIBILITY: Record<Eligibility, string> = {
  open: 'Terbuka untuk semua akun',
  verified: 'Akun terverifikasi',
  verified_docs: 'Akun terverifikasi + dokumen legal usaha',
}

export const AWARD: Record<AwardRule, string> = {
  lowest_price: 'Harga terendah',
  highest_price: 'Harga tertinggi',
  score: 'Skor harga 70% + kualitas 30%',
  pro_rata: 'Pro-rata ke semua penawar yang lolos',
}

export const VISIBILITY: Record<BidVisibility, string> = {
  full: 'Harga terlihat, identitas disamarkan',
  rank_only: 'Peserta hanya melihat peringkat',
  sealed: 'Tertutup sampai penutupan',
}

const date = (d: string) => (d ? formatDate(`${d}T00:00:00+07:00`) : '—')


export const RULE_FIELDS: { key: keyof MarketRules; label: string; format: (r: MarketRules, unit: string) => string }[] = [
  { key: 'eligibility', label: 'Kelayakan', format: (r) => ELIGIBILITY[r.eligibility] },
  { key: 'visibility', label: 'Visibilitas bid', format: (r) => VISIBILITY[r.visibility] },
  { key: 'minStepPct', label: 'Kenaikan/penurunan minimum', format: (r) => `${String(r.minStepPct).replace('.', ',')}% dari harga pembuka` },
  { key: 'minQuantity', label: 'Kuantitas minimum', format: (r, u) => `${formatNumber(r.minQuantity)} ${u} per pesanan` },
  { key: 'maxQuantity', label: 'Kuantitas maksimum', format: (r, u) => `${formatNumber(r.maxQuantity)} ${u} per peserta` },
  { key: 'windowStart', label: 'Jendela mulai', format: (r) => date(r.windowStart) },
  { key: 'windowEnd', label: 'Jendela selesai', format: (r) => date(r.windowEnd) },
  { key: 'region', label: 'Wilayah', format: (r) => r.region },
  { key: 'radiusKm', label: 'Radius', format: (r) => `${formatNumber(r.radiusKm)} km` },
  { key: 'award', label: 'Penetapan pemenang', format: (r) => AWARD[r.award] },
]

export const rulesToLabeled = (r: MarketRules, unit: string): LabeledValue[] => RULE_FIELDS.map((f) => ({ label: f.label, value: f.format(r, unit) }))


export function diffRules(before: MarketRules, after: MarketRules, unit: string) {
  return RULE_FIELDS.filter((f) => before[f.key] !== after[f.key]).map((f) => ({ field: f.label, before: f.format(before, unit), after: f.format(after, unit) }))
}


export function validateRules(r: MarketRules): Record<string, string> {
  const e: Record<string, string> = {}
  if (!(r.minQuantity > 0)) e.minQuantity = 'Harus lebih dari 0'
  if (!(r.maxQuantity >= r.minQuantity)) e.maxQuantity = 'Tidak boleh di bawah kuantitas minimum'
  if (!(r.minStepPct >= 0 && r.minStepPct <= 20)) e.minStepPct = 'Antara 0 dan 20%'
  if (!r.windowStart) e.windowStart = 'Isi tanggal mulai'
  if (!r.windowEnd || r.windowEnd < r.windowStart) e.windowEnd = 'Harus setelah tanggal mulai'
  if (!r.region.trim()) e.region = 'Isi wilayah'
  if (!(r.radiusKm > 0)) e.radiusKm = 'Harus lebih dari 0'
  return e
}


export function activeVersion(versions: RuleVersion[], round: number): RuleVersion {
  return [...versions].reverse().find((v) => v.effectiveFromRound <= round) ?? versions[0]
}


export function pendingVersion(versions: RuleVersion[], round: number): RuleVersion | undefined {
  const active = activeVersion(versions, round)
  const last = versions[versions.length - 1]
  return last.version > active.version ? last : undefined
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`





export function defaultRules(m: { demand: Quantity; supply: Quantity; region: string; mechanism: MarketMechanism }, today = new Date()): MarketRules {
  const weekend = today.getDay() === 0 || today.getDay() === 6
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + (weekend ? 7 : 0))
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  const start = weekend ? monday : today
  return {
    eligibility: 'verified_docs', visibility: m.mechanism === 'sealed_bid' ? 'sealed' : 'full', minStepPct: 1,
    minQuantity: Math.max(1, Math.round(m.demand.value * 0.01)), maxQuantity: Math.max(1, Math.round(m.supply.value * 0.4)),
    windowStart: isoDay(start), windowEnd: isoDay(friday), region: m.region, radiusKm: 75,
    award: m.mechanism === 'forward_auction' ? 'highest_price' : m.mechanism === 'sealed_bid' ? 'score' : m.mechanism === 'collective_procurement' ? 'pro_rata' : 'lowest_price',
  }
}


export function addVersion(versions: RuleVersion[], rules: MarketRules, round: number, author: string, reason?: string, at = new Date().toISOString()): RuleVersion[] {
  return [...versions, { version: versions.length + 1, rules, effectiveFromRound: round + 1, createdAt: at, author, reason }]
}
