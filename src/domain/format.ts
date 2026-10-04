import type { Quantity } from './types'

const TZ = 'Asia/Jakarta'
const num = new Intl.NumberFormat('id-ID')
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 })
const dateTime = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ, timeZoneName: 'short',
})
const dateOnly = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })


export function formatIdr(amount: number, opts: { compact?: boolean } = {}) {
  return `Rp ${(opts.compact ? compact : num).format(amount)}`
}

export function formatNumber(n: number, opts: { compact?: boolean } = {}) {
  return (opts.compact ? compact : num).format(n)
}

export function formatQty(q: Quantity, opts: { compact?: boolean } = {}) {
  return `${formatNumber(q.value, opts)} ${q.unit}`
}

export function formatPercent(ratio: number, digits = 0) {
  return `${(ratio * 100).toFixed(digits).replace('.', ',')}%`
}


export function formatDateTime(iso: string) {
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string) {
  return dateOnly.format(new Date(iso))
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
]


export function formatRelative(iso: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000
  if (Math.abs(diff) < 45) return 'baru saja'
  const [unit, secs] = STEPS.find(([, s]) => Math.abs(diff) >= s)!
  return relative.format(Math.round(diff / secs), unit)
}


export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86_400)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hms = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return d > 0 ? `${d}h ${hms}` : hms
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}
