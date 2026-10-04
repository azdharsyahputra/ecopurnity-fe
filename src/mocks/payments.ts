import type { TransactionDetail } from '@/domain/types'
import { paymentExpiryMs, paymentLabel, type Payment, type PaymentInput, type VaBank } from '@/domain/payment'
import { breakdown, tradeActions } from '@/domain/trade'
import { applyAction, ensureF6, tradeState, type TradeSink } from './trade'
import { newId } from './personal'





type Stored = Payment & { payer: string }
const KEY = 'ecp-mock-payments'
const SETTLE_MS = 8_000
const store: Record<string, Stored[]> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // per-tab only
  }
}

export const PAY_VIA_GATEWAY = 'Bayar lewat tombol Bayar: pilih metode pembayaran (virtual account, QRIS, atau e-wallet)'

export type PayResult = { ok: true; payment: Payment } | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> }
const err = (status: number, code: string, message: string, fields?: Record<string, string>): PayResult => ({ ok: false, status, code, message, fields })
const view = ({ payer: _, ...p }: Stored): Payment => p

const VA_PREFIX: Record<VaBank, string> = { bca: '39021', bni: '9880', bri: '88608', permata: '8562', cimb: '7031' }
const METHODS = ['bank_transfer', 'echannel', 'qris', 'gopay', 'shopeepay']

function digits(seed: string, n: number) {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < n; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i % seed.length), 16777619) >>> 0
    out += String(h % 10)
  }
  return out
}


function fakeQr(seed: string) {
  const n = 25
  const bits = digits(seed, n * n)
  const finder = (x: number, y: number) =>
    [[0, 0], [n - 7, 0], [0, n - 7]].some(([ox, oy]) => {
      const dx = x - ox, dy = y - oy
      return dx >= 0 && dx < 7 && dy >= 0 && dy < 7 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4))
    })
  const reserved = (x: number, y: number) => ((x < 8 || x >= n - 8) && y < 8) || (x < 8 && y >= n - 8)
  let cells = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (finder(x, y) || (!reserved(x, y) && Number(bits[y * n + x]) % 2)) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>${cells}</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}


function tick(t: TransactionDetail, sink?: TradeSink) {
  const p = store[t.id]?.[0]
  if (!p || p.status !== 'pending') return
  if (Date.now() - Date.parse(p.createdAt) >= SETTLE_MS) {
    Object.assign(p, { status: 'settlement', paidAt: new Date().toISOString() })
    applyAction(ensureF6(t), p.payer, { action: 'pay', note: `Midtrans ${paymentLabel(p)} · ${p.orderId}` }, sink)
  } else if (Date.parse(p.expiresAt) <= Date.now()) p.status = 'expire'
  save()
}


export function currentPayment(t: TransactionDetail, sink?: TradeSink): Payment | null {
  if (t.role !== 'buyer') return null
  tick(t, sink)
  const p = store[t.id]?.[0]
  return p ? view(p) : null
}


export function createPayment(t: TransactionDetail, input: PaymentInput, payer: string, sink?: TradeSink): PayResult {
  if (t.role !== 'buyer' || !tradeActions(tradeState(t), 'buyer').includes('pay')) return err(409, 'invalid_transition', 'Aksi ini tidak tersedia untuk status sekarang')
  if (!METHODS.includes(input.method)) return err(422, 'validation', 'Pilih metode pembayaran', { method: 'Pilih metode pembayaran' })
  if (input.method === 'bank_transfer' && !(input.bank && input.bank in VA_PREFIX)) return err(422, 'validation', 'Pilih bank untuk virtual account', { bank: 'Pilih bank untuk virtual account' })
  tick(t, sink)
  const list = (store[t.id] ??= [])
  if (list[0]?.status === 'settlement') return err(409, 'already_paid', 'Pembayaran sebelumnya sudah diterima')
  if (list[0]?.status === 'pending') list[0].status = 'cancel'
  const orderId = `${t.code}-${list.length + 1}-${Math.random().toString(36).slice(2, 6)}`
  const now = Date.now()
  const p: Stored = {
    id: newId('pay'), transactionId: t.id, orderId, method: input.method, amountIdr: breakdown(t.totalIdr).buyerPaysIdr, status: 'pending', payer,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + paymentExpiryMs(input.method)).toISOString(),
  }
  if (input.method === 'bank_transfer') Object.assign(p, { bank: input.bank, vaNumber: VA_PREFIX[input.bank!] + digits(orderId, 16 - VA_PREFIX[input.bank!].length) })
  if (input.method === 'echannel') Object.assign(p, { bank: 'mandiri', billerCode: '70012', billKey: digits(orderId, 12) })
  if (input.method === 'qris' || input.method === 'gopay') p.qrUrl = fakeQr(orderId)
  if (input.method === 'gopay') p.deeplinkUrl = `gojek://gopay/merchanttransfer?tref=${orderId}`
  if (input.method === 'shopeepay') p.deeplinkUrl = `shopeeid://main?order=${orderId}`
  list.unshift(p)
  save()
  return { ok: true, payment: view(p) }
}

export function cancelPayment(t: TransactionDetail, sink?: TradeSink): PayResult {
  if (t.role === 'buyer') tick(t, sink)
  const p = store[t.id]?.[0]
  if (t.role !== 'buyer' || p?.status !== 'pending') return err(409, 'invalid_transition', 'Tidak ada pembayaran yang menunggu')
  p.status = 'cancel'
  save()
  return { ok: true, payment: view(p) }
}
