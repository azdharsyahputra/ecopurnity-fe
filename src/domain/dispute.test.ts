import { describe, expect, it } from 'vitest'
import { disputeActions, disputeTransition, resolveOutcome, validateResolution } from './dispute'

describe('dispute workflow', () => {
  it('moves open → evidence → review → resolved', () => {
    expect(disputeActions('open')).toEqual(['request_evidence', 'start_review'])
    expect(disputeTransition('open', 'request_evidence')).toBe('evidence')
    expect(disputeTransition('evidence', 'start_review')).toBe('review')
    expect(disputeTransition('review', 'resolve')).toBe('resolved')
  })

  it('cannot resolve before review or act after resolution', () => {
    expect(disputeTransition('open', 'resolve')).toBeNull()
    expect(disputeActions('resolved')).toEqual([])
  })
})

describe('dispute resolution', () => {
  it('refund cancels and returns everything to the buyer', () => {
    expect(resolveOutcome(1_000_000, { kind: 'refund' })).toMatchObject({ status: 'cancelled', payment: 'refunded', refundIdr: 1_000_000, releaseIdr: 0 })
  })

  it('release completes and pays the supplier', () => {
    expect(resolveOutcome(1_000_000, { kind: 'release' })).toMatchObject({ status: 'completed', payment: 'released', refundIdr: 0, releaseIdr: 1_000_000 })
  })

  it('partial splits the escrow', () => {
    const o = resolveOutcome(1_000_000, { kind: 'partial', refundIdr: 250_000 })
    expect(o).toMatchObject({ status: 'completed', payment: 'released', refundIdr: 250_000, releaseIdr: 750_000 })
    expect(o.note).toContain('250.000')
  })

  it('partial amount must be between 0 and the total', () => {
    expect(validateResolution(1_000_000, { kind: 'partial', refundIdr: 0 })).toBeTruthy()
    expect(validateResolution(1_000_000, { kind: 'partial', refundIdr: 1_000_000 })).toBeTruthy()
    expect(validateResolution(1_000_000, { kind: 'partial', refundIdr: 1.5 })).toBeTruthy()
    expect(validateResolution(1_000_000, { kind: 'partial', refundIdr: 400_000 })).toBeNull()
    expect(validateResolution(1_000_000, { kind: 'refund' })).toBeNull()
  })
})
