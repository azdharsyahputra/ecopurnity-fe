import type { DisputeStatus, TransactionStatus } from './status'
import type { TransactionDetail } from './types'

// Dispute workflow (PRD §11 disputes). Shared by the admin case screen (which buttons to show)
// and the mock API (which requests to accept); the BE should enforce the same table.

export type DisputeAction = 'request_evidence' | 'start_review' | 'resolve'

export const DISPUTE_STEPS: DisputeStatus[] = ['open', 'evidence', 'review', 'resolved']

const FLOW: Record<DisputeAction, { from: DisputeStatus[]; to: DisputeStatus }> = {
  request_evidence: { from: ['open', 'evidence'], to: 'evidence' },
  start_review: { from: ['open', 'evidence'], to: 'review' },
  resolve: { from: ['review'], to: 'resolved' },
}

export const disputeActions = (status: DisputeStatus) => (Object.keys(FLOW) as DisputeAction[]).filter((a) => FLOW[a].from.includes(status))

/** Next status, or null when the action isn't allowed now. */
export const disputeTransition = (status: DisputeStatus, action: DisputeAction) => (FLOW[action].from.includes(status) ? FLOW[action].to : null)

export type Resolution = { kind: 'refund' } | { kind: 'release' } | { kind: 'partial'; refundIdr: number }

export interface ResolutionOutcome {
  status: TransactionStatus
  payment: TransactionDetail['payment']['status']
  refundIdr: number
  releaseIdr: number
  /** Human summary for the timeline and notifications. */
  note: string
}

const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

/** Error message for an invalid resolution, or null. */
export function validateResolution(totalIdr: number, r: Resolution): string | null {
  if (r.kind !== 'partial') return null
  if (!Number.isInteger(r.refundIdr) || r.refundIdr <= 0) return 'Isi nominal refund lebih dari 0'
  if (r.refundIdr >= totalIdr) return `Refund sebagian harus kurang dari total ${rp(totalIdr)}; pakai refund penuh`
  return null
}

/**
 * What a resolution does to the escrowed transaction:
 * refund → buyer gets everything back, the order is cancelled;
 * release → supplier gets everything, the order completes;
 * partial → buyer gets `refundIdr` back, supplier the rest, the order completes.
 */
export function resolveOutcome(totalIdr: number, r: Resolution): ResolutionOutcome {
  if (r.kind === 'refund') return { status: 'cancelled', payment: 'refunded', refundIdr: totalIdr, releaseIdr: 0, note: `Refund penuh ${rp(totalIdr)} ke pembeli` }
  if (r.kind === 'release') return { status: 'completed', payment: 'released', refundIdr: 0, releaseIdr: totalIdr, note: `Dana ${rp(totalIdr)} dilepas ke supplier` }
  const releaseIdr = totalIdr - r.refundIdr
  return { status: 'completed', payment: 'released', refundIdr: r.refundIdr, releaseIdr, note: `${rp(r.refundIdr)} dikembalikan ke pembeli, ${rp(releaseIdr)} dilepas ke supplier` }
}
