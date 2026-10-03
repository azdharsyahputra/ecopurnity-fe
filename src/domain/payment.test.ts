import { describe, expect, it } from 'vitest'
import { PAYMENT_OPTIONS, howToPay, paymentExpiryMs, paymentLabel, paymentOpen, type Payment } from './payment'

const p: Payment = {
  id: 'pay-1', transactionId: 'trx-1', orderId: 'TRX-AB12-1-x', method: 'bank_transfer', bank: 'bca', amountIdr: 1_110_000,
  status: 'pending', vaNumber: '39021123456789', expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString(),
}

describe('payments', () => {
  it('is open only while pending and before expiry', () => {
    expect(paymentOpen(p)).toBe(true)
    expect(paymentOpen({ ...p, status: 'expire' })).toBe(false)
    expect(paymentOpen(p, Date.now() + 120_000)).toBe(false)
    expect(paymentOpen(null)).toBe(false)
  })

  it('offers every VA bank, Mandiri bill and the instant methods, no cards', () => {
    expect(PAYMENT_OPTIONS.map((o) => o.key)).toEqual(['bca', 'bni', 'bri', 'permata', 'cimb', 'mandiri', 'qris', 'gopay', 'shopeepay'])
    expect(PAYMENT_OPTIONS.filter((o) => o.input.method === 'bank_transfer').every((o) => o.input.bank)).toBe(true)
  })

  it('labels and expiry follow the method', () => {
    expect(paymentLabel(p)).toBe('VA BCA')
    expect(paymentLabel({ method: 'echannel', bank: 'mandiri' })).toBe('Mandiri Bill')
    expect(paymentExpiryMs('bank_transfer')).toBe(24 * 3_600_000)
    expect(paymentExpiryMs('qris')).toBe(15 * 60_000)
  })

  it('how-to steps carry the number to enter', () => {
    expect(howToPay(p).some((s) => s.includes('39021123456789'))).toBe(true)
    expect(howToPay({ ...p, bank: 'bri' })[1]).toContain('BRIVA')
    expect(howToPay({ ...p, method: 'echannel', bank: 'mandiri', billerCode: '70012', billKey: '998877' }).join(' ')).toMatch(/70012.*998877/)
    expect(howToPay({ ...p, method: 'qris' })).toHaveLength(3)
  })
})
