import type { TransactionDetail } from './types'




export type ReputationTx = Pick<TransactionDetail, 'id' | 'title' | 'status' | 'counterparty' | 'totalIdr' | 'createdAt' | 'updatedAt' | 'dueAt' | 'timeline' | 'dispute'> &
  Partial<Pick<TransactionDetail, 'role' | 'reviews'>>

export interface ReputationBreakdown {

  fulfillmentRate: number | null

  onTimeRate: number | null
  cancellationRate: number | null
  disputeRate: number | null

  volumeIdr: number

  repeatRate: number | null

  responseHours: number | null

  ratingAvg: number | null
  ratingCount: number
}


export function receivedRatings(txs: ReputationTx[]): number[] {
  return txs.flatMap((t) => {
    const r = t.role && t.reviews?.[t.role === 'buyer' ? 'supplier' : 'buyer']
    return r ? [r.rating] : []
  })
}

export interface ReputationCounts {
  transactions: number
  successful: number
  disputes: number
  cancelled: number
}

export interface ReputationEvent {
  id: string
  at: string
  title: string

  delta: number

  score: number
}

export interface ReputationReport {
  score: number
  breakdown: ReputationBreakdown
  counts: ReputationCounts

  trend: { month: string; score: number }[]

  events: ReputationEvent[]
}


export const BASELINE_SCORE = 80

const ratio = (n: number, d: number) => (d ? n / d : null)
const FINISHED = ['completed', 'cancelled', 'disputed']
const completedAt = (t: ReputationTx) => t.timeline.find((s) => s.status === 'completed')?.at ?? t.updatedAt

export function reputationScore(txs: ReputationTx[]): { score: number; breakdown: ReputationBreakdown; counts: ReputationCounts } {
  const completed = txs.filter((t) => t.status === 'completed')
  const cancelled = txs.filter((t) => t.status === 'cancelled')
  const disputes = txs.filter((t) => t.dispute || t.status === 'disputed')
  const finished = txs.filter((t) => FINISHED.includes(t.status))
  const seen = new Map<string, number>()
  for (const t of txs) seen.set(t.counterparty.name, (seen.get(t.counterparty.name) ?? 0) + 1)
  const ratings = receivedRatings(txs)
  const responses = txs
    .map((t) => t.timeline.find((s, i) => i > 0 && s.at)?.at)
    .map((at, i) => (at ? (new Date(at).getTime() - new Date(txs[i].createdAt).getTime()) / 3_600_000 : null))
    .filter((h): h is number => h !== null && h >= 0)

  const breakdown: ReputationBreakdown = {
    fulfillmentRate: ratio(completed.length, finished.length),
    onTimeRate: ratio(completed.filter((t) => completedAt(t) <= t.dueAt).length, completed.length),
    cancellationRate: ratio(cancelled.length, txs.length),
    disputeRate: ratio(disputes.length, txs.length),
    volumeIdr: completed.reduce((s, t) => s + t.totalIdr, 0),
    repeatRate: ratio(completed.filter((t) => (seen.get(t.counterparty.name) ?? 0) > 1).length, completed.length),
    responseHours: responses.length ? Math.round((responses.reduce((s, h) => s + h, 0) / responses.length) * 10) / 10 : null,
    ratingAvg: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null,
    ratingCount: ratings.length,
  }
  const b = breakdown
  const raw = finished.length
    ? 40 * (b.fulfillmentRate ?? 0) +
      20 * (b.onTimeRate ?? 0) +
      15 * (1 - (b.cancellationRate ?? 0)) +
      15 * (1 - (b.disputeRate ?? 0)) +
      5 * (b.repeatRate ?? 0) +
      5 * Math.min(1, completed.length / 20)
    : BASELINE_SCORE

  const rated = b.ratingAvg === null ? raw : 0.9 * raw + 10 * ((b.ratingAvg - 1) / 4)
  return {
    score: Math.round(Math.min(100, Math.max(0, rated))),
    breakdown,
    counts: { transactions: txs.length, successful: completed.length, disputes: disputes.length, cancelled: cancelled.length },
  }
}

const EVENT_TITLE: Record<string, string> = { completed: 'Transaksi selesai', cancelled: 'Transaksi dibatalkan', disputed: 'Dispute dibuka' }


export function reputationReport(txs: ReputationTx[], now = new Date()): ReputationReport {
  const byTime = [...txs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
  const events: ReputationEvent[] = []
  let prev = BASELINE_SCORE
  byTime.forEach((t, i) => {
    if (!FINISHED.includes(t.status)) return
    const score = reputationScore(byTime.slice(0, i + 1)).score
    const resolved = t.dispute?.status === 'resolved' ? ' (dispute diselesaikan)' : t.dispute ? ' (dengan dispute)' : ''
    events.push({ id: t.id, at: t.updatedAt, title: `${EVENT_TITLE[t.status]}${resolved}: ${t.title}`, delta: score - prev, score })
    prev = score
  })

  const trend = Array.from({ length: 12 }, (_, k) => {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - k) + 1, 1)).toISOString()
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - k), 1)).toISOString().slice(0, 7)
    return { month, score: reputationScore(byTime.filter((t) => t.updatedAt < end)).score }
  })

  return { ...reputationScore(txs), trend, events: events.reverse() }
}
