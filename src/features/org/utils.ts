import type { CategoryId } from '@/domain/types'
import { toCsv } from '@/domain/org'
import { SERIES } from '@/components/chart-tokens'

/** Color follows the category, never its rank (dataviz) — same mapping as the Explorer. */
export const CATEGORY_SERIES: Record<CategoryId, string> = {
  agri: SERIES[0], food: SERIES[1], packaging: SERIES[2], logistics: SERIES[3], energy: SERIES[4], it: SERIES[4], manufacturing: SERIES[4],
}

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' })
/** '2026-10' → 'Okt 26' */
export const monthLabel = (m: string) => monthFmt.format(new Date(`${m}-01T00:00:00Z`))

/** Client-side CSV download (exports what the user already sees). */
export function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  URL.revokeObjectURL(url)
}

export const toDate = (iso?: string) => (iso ? iso.slice(0, 10) : '')
export const fromDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : '')
export const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString()

export const selectClass =
  'h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
