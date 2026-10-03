import { describe, expect, it } from 'vitest'
import {
  approvalState, approverUserIds, awardLines, awardSummary, can, canApprove, canTransact, inventoryFromCsv, parseCsv, pipelineCounts, poolTotals,
  procurementActions, projectedUnitPrice, requiredApprovers, scaleDiscount, statusAfterApproval, toCsv, txDeniedReason, weightedScores,
  type ApprovalRule, type LotOffer,
} from './org'

const RULES: ApprovalRule[] = [
  { id: 'r1', label: '> 50 jt', minAmountIdr: 50_000_000, approvers: ['finance', 'owner'], appliesTo: ['procurement', 'auction'] },
  { id: 'r2', label: 'Auction > 200 jt', minAmountIdr: 200_000_000, approvers: ['owner', 'procurement'], appliesTo: ['auction'] },
]
const ok = (role: string) => ({ role, by: 'x', at: '2026-10-01T00:00:00Z', decision: 'approved' as const })

describe('permissions', () => {
  it('defaults per role, owner always allowed, custom roles from the matrix', () => {
    expect(can(undefined, 'finance', 'procurement', 'approve')).toBe(true)
    expect(can(undefined, 'sales', 'procurement', 'create')).toBe(false)
    expect(can({ owner: {} }, 'owner', 'team', 'manage')).toBe(true)
    expect(can({ 'custom-qc': { inventory: ['view'] } }, 'custom-qc', 'inventory', 'view')).toBe(true)
    expect(can({ 'custom-qc': { inventory: ['view'] } }, 'custom-qc', 'inventory', 'manage')).toBe(false)
  })
})

describe('transaction permissions', () => {
  it('gates each step by role', () => {
    expect(canTransact(undefined, 'finance', 'pay')).toBe(true)
    expect(canTransact(undefined, 'procurement', 'pay')).toBe(false)
    expect(canTransact(undefined, 'sales', 'issue_invoice')).toBe(true)
    expect(canTransact(undefined, 'operations', 'ship')).toBe(true)
    expect(canTransact(undefined, 'finance', 'upload_proof')).toBe(false)
    expect(canTransact(undefined, 'procurement', 'confirm_receipt')).toBe(true)
    expect(canTransact(undefined, 'operations', 'cancel')).toBe(false)
    expect(canTransact(undefined, 'owner', 'dispute')).toBe(true)
    expect(canTransact(undefined, 'sales', 'accept_agreement')).toBe(true)
    expect(canTransact(undefined, 'finance', 'review')).toBe(false)
  })

  it('custom roles fall back to transactions.manage; denials name who may act', () => {
    expect(canTransact({ 'custom-ap': { transactions: ['view', 'manage'] } }, 'custom-ap', 'pay')).toBe(true)
    expect(canTransact({ 'custom-qc': { transactions: ['view'] } }, 'custom-qc', 'pay')).toBe(false)
    expect(txDeniedReason(undefined, 'finance', 'Finance', 'pay')).toBeUndefined()
    expect(txDeniedReason(undefined, 'sales', 'Sales', 'pay')).toBe('Bayar hanya untuk Owner, Finance; peranmu Sales')
  })
})

describe('approval rules', () => {
  it('collects approvers above the threshold, per subject, without duplicates', () => {
    expect(requiredApprovers(50_000_000, 'procurement', RULES)).toEqual([])
    expect(requiredApprovers(60_000_000, 'procurement', RULES)).toEqual(['finance', 'owner'])
    expect(requiredApprovers(300_000_000, 'procurement', RULES)).toEqual(['finance', 'owner'])
    expect(requiredApprovers(300_000_000, 'auction', RULES)).toEqual(['finance', 'owner', 'procurement'])
  })

  it('tracks pending roles and decisions', () => {
    const req = ['finance', 'owner']
    expect(approvalState(req, [ok('finance')])).toEqual({ pending: ['owner'], rejected: false, approved: false })
    expect(statusAfterApproval(req, [ok('finance'), ok('owner')])).toBe('approved')
    expect(statusAfterApproval(req, [{ ...ok('finance'), decision: 'rejected' }])).toBe('rejected')
    expect(statusAfterApproval([], [])).toBe('approved')
    expect(canApprove('owner', req, [ok('finance')])).toBe(true)
    expect(canApprove('finance', req, [ok('finance')])).toBe(false)
  })

  it('asks the users holding a still-pending role, not the one who just acted', () => {
    const members = [{ userId: 'ajar', role: 'owner' }, { userId: 'maya', role: 'finance' }, { userId: 'bima', role: 'procurement' }]
    expect(approverUserIds(['finance', 'owner'], [], members, 'bima')).toEqual(['ajar', 'maya'])
    expect(approverUserIds(['finance', 'owner'], [], members, 'ajar')).toEqual(['maya'])
    expect(approverUserIds(['finance', 'owner'], [ok('finance')], members)).toEqual(['ajar'])
    expect(approverUserIds(['finance', 'owner'], [{ ...ok('finance'), decision: 'rejected' }], members)).toEqual([])
  })

  it('only offers actions the role may take', () => {
    const pending = { status: 'pending_approval' as const, requiredApprovers: ['finance', 'owner'], approvals: [ok('finance')] }
    expect(procurementActions(pending, 'owner')).toEqual(['approve', 'reject', 'cancel'])
    expect(procurementActions(pending, 'sales')).toEqual([])
    expect(procurementActions({ ...pending, status: 'draft' }, 'procurement')).toEqual(['submit', 'cancel'])
  })

  it('counts the pipeline by stage', () => {
    expect(pipelineCounts(['draft', 'pending_approval', 'approved', 'published', 'in_auction', 'po_issued', 'rejected'])).toEqual({
      draft: 1, approval: 1, published: 2, auction: 1, awarded: 0, po: 1,
    })
  })
})

const offer = (id: string, price: number, cap: number, q = 80, supplierId = id): LotOffer => ({
  id, supplierId, priceIdr: price, capacity: { value: cap, unit: 'unit' }, submittedAt: '', quality: q, delivery: 80, reliability: 80,
  supplier: { name: supplierId, kind: 'business', verified: true, reputation: 90 },
})

describe('scoring and award rules', () => {
  it('scores price relative to the best offer: cheapest when buying, highest when selling', () => {
    const priceOnly = { price: 100, quality: 0, delivery: 0, reliability: 0 }
    expect(weightedScores([offer('a', 100, 1), offer('b', 200, 1)], priceOnly)).toEqual([100, 50])
    expect(weightedScores([offer('a', 100, 1), offer('b', 200, 1)], priceOnly, true)).toEqual([50, 100])
  })

  it('selling auctions flip every rule to the highest price', () => {
    const lots = [{ quantity: 100, offers: [offer('a', 100, 60, 100), offer('b', 105, 70, 50), offer('c', 90, 100, 100)] }]
    expect(awardLines(lots, 'lowest', undefined, true)[0][0].offerId).toBe('b')
    expect(awardLines(lots, 'split', undefined, true)[0].map((l) => [l.offerId, l.quantity])).toEqual([['b', 70], ['a', 30]])
    expect(awardLines(lots, 'weighted', { price: 20, quality: 80, delivery: 0, reliability: 0 }, true)[0][0].offerId).toBe('a')
    const two = [
      { quantity: 10, offers: [offer('a1', 100, 10, 80, 'a'), offer('b1', 120, 10, 80, 'b')] },
      { quantity: 10, offers: [offer('a2', 110, 10, 80, 'a'), offer('b2', 80, 10, 80, 'b')] },
    ]
    expect(awardLines(two, 'bundled', undefined, true).map((l) => l[0]?.offerId)).toEqual(['a1', 'a2'])
  })

  it('awards per rule', () => {
    const lots = [{ quantity: 100, offers: [offer('a', 100, 60, 50), offer('b', 105, 100, 100)] }]
    expect(awardLines(lots, 'lowest')[0]).toEqual([{ offerId: 'a', supplier: 'a', quantity: 100, priceIdr: 100 }])
    expect(awardLines(lots, 'weighted', { price: 20, quality: 80, delivery: 0, reliability: 0 })[0][0].offerId).toBe('b')
    expect(awardLines(lots, 'split')[0].map((l) => l.quantity)).toEqual([60, 40])
    expect(awardLines(lots, 'lowest', undefined, true)[0][0].offerId).toBe('b')
  })

  it('bundles all lots to the supplier with the lowest total among those who bid on every lot', () => {
    const lots = [
      { quantity: 10, offers: [offer('a1', 100, 10, 80, 'a'), offer('b1', 90, 10, 80, 'b')] },
      { quantity: 10, offers: [offer('a2', 100, 10, 80, 'a'), offer('c2', 50, 10, 80, 'c')] },
    ]
    const lines = awardLines(lots, 'bundled')
    expect(lines.map((l) => l[0]?.offerId)).toEqual(['a1', 'a2'])
    expect(awardSummary(lots, lines)).toEqual({ totalIdr: 2000, suppliers: 1, coverage: 1 })
  })
})

describe('collective aggregation', () => {
  it('discounts with scale, capped', () => {
    expect(scaleDiscount(1000, 1000)).toBe(0)
    expect(scaleDiscount(2000, 1000)).toBeCloseTo(0.06)
    expect(scaleDiscount(1e9, 1000)).toBe(0.25)
    expect(projectedUnitPrice(1000, 4000, 1000)).toBe(880)
  })

  it('totals a pool and knows when it can become a market', () => {
    const t = poolTotals({ baseUnitPriceIdr: 1000, refQty: 100, thresholdQty: 400, members: [{ name: 'me', quantity: 100, optIn: false, mine: true }, { name: 'x', quantity: 300, optIn: false }] })
    expect(t).toMatchObject({ mine: 100, others: 300, total: 400, businesses: 2, ready: true, unitPriceIdr: 880 })
  })
})

describe('csv', () => {
  it('round-trips quotes, commas and CRLF', () => {
    const rows = [['a', 'b,c'], ['say "hi"', '2']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
    expect(parseCsv('x,y\r\n1,2\r\n\r\n')).toEqual([['x', 'y'], ['1', '2']])
  })

  it('maps inventory rows and reports bad ones', () => {
    const csv = parseCsv('sku,nama,kategori,gudang,jumlah,satuan\nK1,Kraft,packaging,Gudang A,10,ton\nK2,,packaging,A,1,ton\nK3,X,mainan,A,1,ton')
    const r = inventoryFromCsv(csv, ['packaging'])
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ sku: 'K1', quantity: { value: 10, unit: 'ton' } })
    expect(r.errors).toHaveLength(2)
    expect(inventoryFromCsv(parseCsv('a,b\n1,2'), ['packaging']).errors[0]).toMatch(/Kolom wajib/)
  })
})
