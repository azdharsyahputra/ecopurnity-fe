import type { TransactionStatus } from './status'
import type { Review, TransactionDetail } from './types'

// Two-sided trade settlement (PRD F6): payment terms, agreement by both parties, staged shipments,
// receipt QC, disputes with evidence from both sides, reviews, and the money breakdown.
// The mock API and the UI both use these rules; the BE must enforce the same table.

export type PaymentTerms = 'escrow' | 'net14' | 'net30'
export type Role = 'buyer' | 'supplier'
export type TradeAction =
  | 'accept_agreement' | 'issue_invoice' | 'pay' | 'ship' | 'upload_proof' | 'confirm_receipt'
  | 'cancel' | 'dispute' | 'add_evidence' | 'review'

export const TERMS: Record<PaymentTerms, { label: string; hint: string; days: number }> = {
  escrow: { label: 'Escrow', hint: 'Pembeli bayar ke escrow sebelum kirim; dana dilepas setelah barang diterima.', days: 0 },
  net14: { label: 'Net 14', hint: 'Supplier kirim dulu; pembeli bayar paling lambat 14 hari setelah barang diterima.', days: 14 },
  net30: { label: 'Net 30', hint: 'Supplier kirim dulu; pembeli bayar paling lambat 30 hari setelah barang diterima.', days: 30 },
}

export const TRADE_ACTION_LABEL: Record<TradeAction, string> = {
  accept_agreement: 'Setujui agreement',
  issue_invoice: 'Terbitkan invoice',
  pay: 'Bayar',
  ship: 'Jadwalkan pengiriman',
  upload_proof: 'Konfirmasi terkirim',
  confirm_receipt: 'Periksa & terima barang',
  cancel: 'Batalkan',
  dispute: 'Ajukan dispute',
  add_evidence: 'Kirim bukti',
  review: 'Beri ulasan',
}

export interface TradeState {
  status: TransactionStatus
  terms: PaymentTerms
  agreement: Record<Role, boolean>
  /** Quantity not yet put on a shipment. */
  unscheduledQty: number
  /** Shipments scheduled or in transit (not delivered yet). */
  openShipments: number
  reviewed: Record<Role, boolean>
}

/** Happy-path order for the progress timeline. */
export const timelineFor = (terms: PaymentTerms): TransactionStatus[] =>
  terms === 'escrow'
    ? ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'completed']
    : ['agreement', 'invoiced', 'fulfilling', 'delivered', 'accepted', 'completed']

export function tradeActions(s: TradeState, role: Role): TradeAction[] {
  const escrow = s.terms === 'escrow'
  const out: TradeAction[] = []
  const add = (a: TradeAction, ok: boolean) => ok && out.push(a)
  add('accept_agreement', s.status === 'agreement' && !s.agreement[role])
  add('issue_invoice', s.status === 'agreement' && role === 'supplier' && s.agreement.buyer && s.agreement.supplier)
  add('pay', role === 'buyer' && s.status === (escrow ? 'invoiced' : 'accepted'))
  add('ship', role === 'supplier' && s.unscheduledQty > 0 && (escrow ? ['paid', 'fulfilling'] : ['invoiced', 'fulfilling']).includes(s.status))
  add('upload_proof', role === 'supplier' && s.status === 'fulfilling' && s.openShipments > 0)
  add('confirm_receipt', role === 'buyer' && s.status === 'delivered')
  add('cancel', s.status === 'agreement' || s.status === 'invoiced')
  add('dispute', (escrow ? ['paid', 'fulfilling', 'delivered'] : ['fulfilling', 'delivered', 'accepted']).includes(s.status))
  add('add_evidence', s.status === 'disputed')
  add('review', s.status === 'completed' && !s.reviewed[role])
  return out
}

export type QcOutcome = 'accepted' | 'partial' | 'rejected'

/** Status after an action; `delivered` = every unit has arrived (for upload_proof), `qc` for confirm_receipt. */
export function nextStatus(s: TradeState, action: TradeAction, opts: { allDelivered?: boolean; qc?: QcOutcome } = {}): TransactionStatus {
  const escrow = s.terms === 'escrow'
  switch (action) {
    case 'issue_invoice':
      return 'invoiced'
    case 'pay':
      return escrow ? 'paid' : 'completed'
    case 'ship':
      return 'fulfilling'
    case 'upload_proof':
      return opts.allDelivered ? 'delivered' : 'fulfilling'
    case 'confirm_receipt':
      return opts.qc === 'rejected' ? 'disputed' : escrow ? 'completed' : 'accepted'
    case 'cancel':
      return 'cancelled'
    case 'dispute':
      return 'disputed'
    default:
      return s.status
  }
}

export const VAT_RATE = 0.11
export const PLATFORM_FEE = 0.01

/**
 * Money for one invoice: the buyer pays subtotal + PPN; fees come out of the supplier's side.
 * `makerFeeRate` is the market maker's commission (0 for trades outside a market).
 */
export function breakdown(subtotalIdr: number, makerFeeRate = 0) {
  const vatIdr = Math.round(subtotalIdr * VAT_RATE)
  const platformFeeIdr = Math.round(subtotalIdr * PLATFORM_FEE)
  const makerFeeIdr = Math.round(subtotalIdr * makerFeeRate)
  const buyerPaysIdr = subtotalIdr + vatIdr
  return { subtotalIdr, vatIdr, buyerPaysIdr, platformFeeIdr, makerFeeIdr, supplierReceivesIdr: buyerPaysIdr - platformFeeIdr - makerFeeIdr }
}

/** Refund owed to the buyer when QC accepts fewer units than were paid for (escrow only). */
export function partialRefund(unitPriceIdr: number, paidQty: number, acceptedQty: number) {
  const short = Math.max(0, paidQty - acceptedQty)
  return breakdown(short * unitPriceIdr).buyerPaysIdr
}

/** Body of POST /me/transactions/:id/actions. */
export interface TradeActionInput {
  action: TradeAction
  note?: string
  /** Verified upload (POST /uploads): `trade_proof` for upload_proof (required), `dispute_evidence` for dispute / add_evidence. */
  uploadId?: string
  /** Legacy bare file name: only the simulated counterparties (demo bot) attach this way; a user's is ignored. */
  file?: string
  shipment?: { quantity: number; dropPoint: string; carrier: string; scheduledAt: string }
  shipmentId?: string
  qc?: { outcome: QcOutcome; acceptedQty?: number; note?: string }
  review?: Omit<Review, 'by' | 'at'>
}

/** Trade state from a transaction record, defaulting fields that records from before F6 lack. */
export function tradeStateOf(t: TransactionDetail): TradeState {
  const shipments = t.shipments ?? []
  const scheduled = shipments.reduce((sum, x) => sum + x.quantity, 0)
  const signed = t.status !== 'agreement'
  return {
    status: t.status,
    terms: t.terms ?? 'escrow',
    agreement: { buyer: signed || !!t.agreement?.buyerAcceptedAt, supplier: signed || !!t.agreement?.supplierAcceptedAt },
    unscheduledQty: Math.max(0, t.quantity.value - scheduled),
    openShipments: shipments.filter((x) => x.status !== 'delivered').length,
    reviewed: { buyer: !!t.reviews?.buyer, supplier: !!t.reviews?.supplier },
  }
}
