import { describe, expect, it } from 'vitest'
import { breakdown, nextStatus, partialRefund, tradeActions, type TradeState } from './trade'

const base: TradeState = {
  status: 'agreement', terms: 'escrow', agreement: { buyer: false, supplier: false }, unscheduledQty: 100, openShipments: 0,
  reviewed: { buyer: false, supplier: false },
}

describe('trade actions', () => {
  it('needs both parties on the agreement before an invoice', () => {
    expect(tradeActions(base, 'supplier')).toEqual(['accept_agreement', 'cancel'])
    const one = { ...base, agreement: { buyer: true, supplier: true } }
    expect(tradeActions(one, 'supplier')).toContain('issue_invoice')
    expect(tradeActions(one, 'buyer')).not.toContain('issue_invoice')
  })

  it('escrow pays before shipping, net terms ship before paying', () => {
    const invoiced = { ...base, status: 'invoiced' as const, agreement: { buyer: true, supplier: true } }
    expect(tradeActions(invoiced, 'buyer')).toContain('pay')
    expect(tradeActions(invoiced, 'supplier')).not.toContain('ship')
    const net = { ...invoiced, terms: 'net30' as const }
    expect(tradeActions(net, 'buyer')).not.toContain('pay')
    expect(tradeActions(net, 'supplier')).toContain('ship')
    expect(tradeActions({ ...net, status: 'accepted' }, 'buyer')).toContain('pay')
    expect(nextStatus(net, 'pay')).toBe('completed')
  })

  it('stays fulfilling until every unit has arrived, and QC decides the outcome', () => {
    const f = { ...base, status: 'fulfilling' as const, unscheduledQty: 40, openShipments: 1 }
    expect(tradeActions(f, 'supplier')).toEqual(['ship', 'upload_proof', 'dispute'])
    expect(nextStatus(f, 'upload_proof', { allDelivered: false })).toBe('fulfilling')
    expect(nextStatus(f, 'upload_proof', { allDelivered: true })).toBe('delivered')
    expect(nextStatus({ ...f, status: 'delivered' }, 'confirm_receipt', { qc: 'partial' })).toBe('completed')
    expect(nextStatus({ ...f, status: 'delivered', terms: 'net14' }, 'confirm_receipt', { qc: 'accepted' })).toBe('accepted')
    expect(nextStatus({ ...f, status: 'delivered' }, 'confirm_receipt', { qc: 'rejected' })).toBe('disputed')
  })

  it('lets each side review once after completion', () => {
    const done = { ...base, status: 'completed' as const, reviewed: { buyer: true, supplier: false } }
    expect(tradeActions(done, 'buyer')).toEqual([])
    expect(tradeActions(done, 'supplier')).toEqual(['review'])
  })
})

describe('money', () => {
  it('adds PPN for the buyer and takes fees from the supplier side', () => {
    const b = breakdown(1_000_000, 0.005)
    expect(b).toEqual({ subtotalIdr: 1_000_000, vatIdr: 110_000, buyerPaysIdr: 1_110_000, platformFeeIdr: 10_000, makerFeeIdr: 5_000, supplierReceivesIdr: 1_095_000 })
  })

  it('refunds the short quantity including its PPN', () => {
    expect(partialRefund(1_000, 100, 90)).toBe(11_100)
    expect(partialRefund(1_000, 100, 120)).toBe(0)
  })
})
