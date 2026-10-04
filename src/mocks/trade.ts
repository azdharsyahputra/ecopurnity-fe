import type { PartyRef, Shipment, TransactionDetail } from '@/domain/types'
import type { TransactionStatus } from '@/domain/status'
import {
  TERMS, TRADE_ACTION_LABEL, breakdown, nextStatus, partialRefund, timelineFor, tradeActions, tradeStateOf,
  type PaymentTerms, type Role, type TradeAction, type TradeActionInput, type TradeState,
} from '@/domain/trade'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { newId, notify, personal, savePersonal } from './personal'
import { claim, consumeUpload, uploadFileInfo } from './kyc'





const now = () => new Date().toISOString()
const day = 864e5
const userName = (userId: string) => db.users.find((u) => u.id === userId)?.name ?? 'Pengguna'



export function ensureF6<T extends TransactionDetail>(t: T): T {
  t.terms ??= 'escrow'
  t.agreement ??= t.status === 'agreement' ? {} : { buyerAcceptedAt: t.createdAt, supplierAcceptedAt: t.createdAt }
  t.makerFeeRate ??= t.auctionId ? 0.005 : 0
  if (!t.shipments) {
    const shipped = ['fulfilling', 'delivered', 'accepted', 'completed'].includes(t.status)
    t.shipments = shipped
      ? [{
          id: `${t.id}-s1`, quantity: t.quantity.value, dropPoint: t.delivery.address, carrier: 'Armada supplier', scheduledAt: t.updatedAt,
          status: t.status === 'fulfilling' ? 'in_transit' : 'delivered', deliveredAt: t.status === 'fulfilling' ? undefined : t.updatedAt, proof: t.delivery.proof,
        }]
      : []
  }
  if (!t.invoice && t.status !== 'agreement' && t.status !== 'cancelled') {
    t.invoice = { number: `INV-${t.code.slice(4)}`, issuedAt: t.createdAt, dueAt: t.dueAt }
  }
  t.reviews ??= {}
  if (!t.timeline.some((s) => s.status === 'accepted') && t.terms !== 'escrow') t.timeline = rebuildTimeline(t)
  return t
}

function rebuildTimeline(t: TransactionDetail) {
  return timelineFor(t.terms ?? 'escrow').map((status) => t.timeline.find((s) => s.status === status) ?? { status })
}

export const tradeState = (t: TransactionDetail): TradeState => tradeStateOf(ensureF6(t))



type Side = { userId: string } | { party: PartyRef }

export interface NewTrade {
  title: string
  buyer: Side
  supplier: Side
  quantity: { value: number; unit: string }
  unitPriceIdr: number
  terms?: PaymentTerms
  makerFeeRate?: number
  auctionId?: string
  address?: string
  group?: TransactionDetail['group']
}

const partyOf = (side: Side): PartyRef =>
  'userId' in side ? { name: userName(side.userId), kind: 'person', verified: !!db.users.find((u) => u.id === side.userId)?.emailVerified } : side.party

function baseRecord(n: NewTrade, id: string, role: Role, counterparty: PartyRef): TransactionDetail {
  const terms = n.terms ?? 'escrow'
  const totalIdr = n.quantity.value * n.unitPriceIdr
  return {
    id, code: `TRX-${id.slice(-4).toUpperCase()}`, title: n.title, role, counterparty, status: 'agreement',
    quantity: n.quantity, unitPriceIdr: n.unitPriceIdr, totalIdr, createdAt: now(), updatedAt: now(), dueAt: new Date(Date.now() + 14 * day).toISOString(),
    auctionId: n.auctionId, terms, agreement: {}, makerFeeRate: n.makerFeeRate ?? 0, shipments: [], reviews: {}, group: n.group,
    timeline: timelineFor(terms).map((status, i) => ({ status, at: i === 0 ? now() : undefined })),
    documents: [{ id: `${id}-o`, kind: 'order', name: `PO-${id.slice(-4).toUpperCase()}.pdf`, at: now() }],
    payment: { status: 'unpaid' },
    delivery: { address: n.address ?? 'Alamat pengiriman dari profil' },
  }
}


export function createTrade(n: NewTrade) {
  const id = newId('trx')
  const out: { buyer?: TransactionDetail; supplier?: TransactionDetail } = {}
  if ('userId' in n.buyer) {
    out.buyer = baseRecord(n, id, 'buyer', partyOf(n.supplier))
    personal(n.buyer.userId).transactions.unshift(out.buyer)
  }
  if ('userId' in n.supplier) {
    out.supplier = baseRecord(n, 'userId' in n.buyer ? `${id}p` : id, 'supplier', partyOf(n.buyer))
    out.supplier.code = out.buyer?.code ?? out.supplier.code
    personal(n.supplier.userId).transactions.unshift(out.supplier)
  }
  if (out.buyer && out.supplier && 'userId' in n.buyer && 'userId' in n.supplier) {
    out.buyer.peer = { userId: n.supplier.userId, txId: out.supplier.id }
    out.supplier.peer = { userId: n.buyer.userId, txId: out.buyer.id }
    notify(n.supplier.userId, { type: 'transaction_update', title: `Agreement baru: ${n.title}`, body: `${userName(n.buyer.userId)} menunggu persetujuanmu.`, href: `/app/transactions/${out.supplier.id}` })
  }
  savePersonal()
  return out
}



const SHARED: (keyof TransactionDetail)[] = [
  'status', 'updatedAt', 'timeline', 'documents', 'payment', 'delivery', 'dispute', 'terms', 'agreement', 'makerFeeRate',
  'invoice', 'shipments', 'qc', 'reviews', 'quantity', 'totalIdr', 'dueAt',
]


export function mirror(t: TransactionDetail) {
  if (!t.peer) return
  const other = personal(t.peer.userId).transactions.find((x) => x.id === t.peer!.txId)
  if (!other) return
  for (const k of SHARED) (other as unknown as Record<string, unknown>)[k] = structuredClone(t[k])
}


export type ActionInput = TradeActionInput & { fileUrl?: string }

export type ActionResult = { ok: true; tx: TransactionDetail } | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> }


export interface TradeSink {
  save: () => void
  audit: (entry: Parameters<typeof audit>[0]) => unknown
}
const personalSink: TradeSink = { save: () => savePersonal(), audit }

const err = (status: number, code: string, message: string, fields?: Record<string, string>): ActionResult => ({ ok: false, status, code, message, fields })


export function applyAction(t: TransactionDetail, actorName: string, input: ActionInput, sink: TradeSink = personalSink): ActionResult {
  const s = tradeState(t)
  const role = t.role
  if (!tradeActions(s, role).includes(input.action)) return err(409, 'invalid_transition', 'Aksi ini tidak tersedia untuk status sekarang')
  const at = now()
  let note = TRADE_ACTION_LABEL[input.action]
  let stepNote: string | undefined

  switch (input.action) {
    case 'accept_agreement':
      t.agreement = { ...t.agreement, [role === 'buyer' ? 'buyerAcceptedAt' : 'supplierAcceptedAt']: at }
      t.documents.push({ id: newId('doc'), kind: 'agreement', name: `Agreement-${t.code.slice(4)}-${role}.pdf`, at })
      note = 'Agreement disetujui'
      break
    case 'issue_invoice': {
      const due = t.terms === 'escrow' ? new Date(Date.now() + 3 * day) : new Date(Date.now() + (TERMS[t.terms!].days + 5) * day)
      t.invoice = { number: `INV-${t.code.slice(4)}`, issuedAt: at, dueAt: due.toISOString() }
      t.dueAt = t.invoice.dueAt
      t.documents.push({ id: newId('doc'), kind: 'invoice', name: `${t.invoice.number}.pdf`, at })
      break
    }
    case 'pay':
      t.payment = { status: t.terms === 'escrow' ? 'escrow' : 'released', paidAt: at }
      note = t.terms === 'escrow' ? 'Dana masuk escrow' : 'Pembayaran diterima supplier'
      if (input.note) stepNote = `${note} · ${input.note}`
      break
    case 'ship': {
      const sh = input.shipment
      if (!sh || !(sh.quantity > 0)) return err(422, 'validation', 'Isi kuantitas pengiriman', { quantity: 'Isi kuantitas pengiriman' })
      if (sh.quantity > s.unscheduledQty) return err(422, 'validation', `Maksimal ${s.unscheduledQty} ${t.quantity.unit}`, { quantity: `Maksimal ${s.unscheduledQty} ${t.quantity.unit}` })
      if (!sh.dropPoint?.trim()) return err(422, 'validation', 'Isi titik tujuan', { dropPoint: 'Isi titik tujuan' })
      const shipment: Shipment = { id: newId('shp'), quantity: sh.quantity, dropPoint: sh.dropPoint.trim(), carrier: sh.carrier || 'Armada supplier', scheduledAt: sh.scheduledAt || at, status: 'in_transit' }
      t.shipments = [...t.shipments!, shipment]
      t.delivery.eta = shipment.scheduledAt
      note = `Kirim ${sh.quantity.toLocaleString('id-ID')} ${t.quantity.unit} ke ${shipment.dropPoint}`
      break
    }
    case 'upload_proof': {
      const sh = t.shipments!.find((x) => x.id === input.shipmentId && x.status !== 'delivered') ?? t.shipments!.find((x) => x.status !== 'delivered')
      if (!sh) return err(409, 'invalid_transition', 'Tidak ada pengiriman yang sedang berjalan')
      if (!input.file) return err(422, 'validation', 'Pilih file bukti pengiriman', { uploadId: 'Pilih file bukti pengiriman' })
      Object.assign(sh, { status: 'delivered', deliveredAt: at, proof: input.file, proofUrl: input.fileUrl })
      t.delivery.proof = input.file
      t.documents.push({ id: newId('doc'), kind: 'proof', name: input.file, url: input.fileUrl, at })
      note = `Terkirim ${sh.quantity.toLocaleString('id-ID')} ${t.quantity.unit} ke ${sh.dropPoint}`
      break
    }
    case 'confirm_receipt': {
      const qc = input.qc ?? { outcome: 'accepted' as const }
      const accepted = qc.outcome === 'accepted' ? t.quantity.value : qc.outcome === 'rejected' ? 0 : Math.min(t.quantity.value, Math.max(0, qc.acceptedQty ?? 0))
      if (qc.outcome === 'partial' && !(accepted > 0 && accepted < t.quantity.value)) return err(422, 'validation', 'Isi kuantitas yang diterima', { acceptedQty: `Antara 1 dan ${t.quantity.value - 1}` })
      if (qc.outcome !== 'accepted' && !qc.note?.trim()) return err(422, 'validation', 'Jelaskan temuan QC', { note: 'Jelaskan temuan QC' })
      t.qc = { outcome: qc.outcome, acceptedQty: accepted, note: qc.note?.trim(), at }
      if (qc.outcome === 'partial') {
        const refund = t.payment.status === 'escrow' ? partialRefund(t.unitPriceIdr, t.quantity.value, accepted) : 0
        t.quantity = { ...t.quantity, value: accepted }
        t.totalIdr = accepted * t.unitPriceIdr
        note = `Diterima sebagian (${accepted.toLocaleString('id-ID')} ${t.quantity.unit})${refund ? `, refund ${formatIdr(refund)}` : ''}`
      } else if (qc.outcome === 'rejected') {
        t.dispute = { status: 'open', reason: `QC menolak barang: ${qc.note!.trim()}`, openedAt: at, evidence: [{ id: newId('evd'), by: role, name: actorName, text: qc.note!.trim(), at }] }
        note = 'Barang ditolak saat QC, dispute dibuka'
      } else note = 'Barang diterima'
      if (qc.outcome !== 'rejected' && t.terms === 'escrow') t.payment.status = 'released'
      if (qc.outcome !== 'rejected' && t.terms !== 'escrow') t.dueAt = new Date(Date.now() + TERMS[t.terms!].days * day).toISOString()
      break
    }
    case 'cancel':
      if (t.payment.status === 'escrow') t.payment.status = 'refunded'
      break
    case 'dispute':
      if (!input.note?.trim()) return err(422, 'validation', 'Jelaskan alasannya', { note: 'Jelaskan alasan dispute' })
      t.dispute = { status: 'open', reason: input.note.trim(), openedAt: at, evidence: [{ id: newId('evd'), by: role, name: actorName, text: input.note.trim(), file: input.file, url: input.fileUrl, at }] }
      break
    case 'add_evidence':
      if (!input.note?.trim()) return err(422, 'validation', 'Tulis keterangan bukti', { note: 'Tulis keterangan bukti' })
      t.dispute!.evidence = [...(t.dispute!.evidence ?? []), { id: newId('evd'), by: role, name: actorName, text: input.note.trim(), file: input.file, url: input.fileUrl, at }]
      if (t.dispute!.status === 'open') t.dispute!.status = 'evidence'
      note = 'Bukti dispute ditambahkan'
      break
    case 'review': {
      const r = input.review
      if (!r || !(r.rating >= 1 && r.rating <= 5)) return err(422, 'validation', 'Beri rating 1–5', { rating: 'Beri rating 1–5' })
      t.reviews = { ...t.reviews, [role]: { ...r, by: actorName, at } }
      note = `Ulasan ${r.rating}/5`
      break
    }
  }

  const before = t.status
  const allDelivered = t.shipments!.length > 0 && t.shipments!.every((x) => x.status === 'delivered') && tradeState(t).unscheduledQty === 0
  t.status = nextStatus({ ...s, status: before }, input.action, { allDelivered, qc: input.qc?.outcome })
  t.updatedAt = at
  if (t.status !== before) {
    const step = t.timeline.find((x) => x.status === t.status)
    if (step) Object.assign(step, { at, note: stepNote ?? note })
  }
  mirror(t)
  sink.save()

  sink.audit({
    actor: actorName, action: note, entity: { type: 'transaction', id: t.id, label: `${t.code} · ${t.title}` }, reason: input.note?.trim() || undefined,
    changes: before === t.status ? undefined : [{ field: 'Status', before, after: t.status }],
  })
  if (t.peer) notify(t.peer.userId, { type: input.action === 'pay' ? 'payment' : ['ship', 'upload_proof'].includes(input.action) ? 'delivery' : 'transaction_update', title: `${t.code}: ${note}`, body: `${actorName} · ${t.title}`, href: `/app/transactions/${t.peer.txId}` })
  return { ok: true, tx: t }
}

const FILE_PURPOSE: Partial<Record<TradeAction, string>> = { upload_proof: 'trade_proof', dispute: 'dispute_evidence', add_evidence: 'dispute_evidence' }





export function applyUserAction(t: TransactionDetail, userId: string, actorName: string, input: TradeActionInput, sink?: TradeSink): ActionResult {
  const purpose = FILE_PURPOSE[input.action]
  let file: string | undefined
  if (purpose && input.uploadId) {
    const r = claim(userId, input.uploadId, purpose, 'uploadId')
    if (typeof r !== 'string') return err(422, 'validation', 'Periksa kembali file yang diunggah', r)
    file = r
  }
  const res = applyAction(t, actorName, { ...input, file, fileUrl: file && uploadFileInfo(input.uploadId!).url }, sink)
  if (res.ok && file) consumeUpload(userId, input.uploadId, purpose!, 'uploadId')
  return res
}



const BOT_PRIORITY: TradeAction[] = ['accept_agreement', 'issue_invoice', 'pay', 'ship', 'upload_proof', 'confirm_receipt', 'review']





export function botStep(t: TransactionDetail, sink: TradeSink = personalSink): TradeAction | undefined {
  const other: Role = t.role === 'buyer' ? 'supplier' : 'buyer'
  if (t.peer || (['completed', 'cancelled', 'disputed'].includes(t.status) && t.reviews?.[other])) return
  if (Date.now() - new Date(t.updatedAt).getTime() < 8_000) return
  const action = BOT_PRIORITY.find((a) => tradeActions(tradeState(t), other).includes(a))
  if (!action) return

  const view = { ...t, role: other } as TransactionDetail
  const res = applyAction(view, t.counterparty.name, {
    action,
    shipment: action === 'ship' ? { quantity: tradeState(t).unscheduledQty, dropPoint: t.delivery.address, carrier: 'Armada supplier', scheduledAt: now() } : undefined,
    file: action === 'upload_proof' ? 'surat-jalan-ttd.jpg' : undefined,
    qc: action === 'confirm_receipt' ? { outcome: 'accepted' } : undefined,
    review: action === 'review' ? { rating: 5, quality: 5, timeliness: 4, communication: 5, text: 'Transaksi lancar, terima kasih.' } : undefined,
  }, sink)
  if (!res.ok) return
  Object.assign(t, { ...res.tx, role: t.role })
  sink.save()
  return action
}

export const botNotice = (t: TransactionDetail, action: TradeAction) => ({
  type: action === 'pay' ? 'payment' as const : ['ship', 'upload_proof'].includes(action) ? 'delivery' as const : 'transaction_update' as const,
  title: `${t.code}: ${TRADE_ACTION_LABEL[action]}`, body: `${t.counterparty.name} · ${t.title}`,
})


export function counterpartyTick() {
  for (const u of db.users) {
    for (const t of personal(u.id).transactions) {
      const action = botStep(t)
      if (action && action !== 'review') notify(u.id, { ...botNotice(t, action), href: `/app/transactions/${t.id}` })
    }
  }
}



const FIN_KEY = 'ecp-mock-finance'

export interface StoredWithdrawal {
  id: string
  code: string
  amountIdr: number
  at: string
  status: 'processing' | 'paid' | 'rejected'
  bank: { bank: string; accountNo: string; holder: string }
  transferRef?: string
  paidAt?: string
  note?: string
  reason?: string
  decidedAt?: string
  decidedBy?: string
}
interface FinanceStore {
  bank?: { bank: string; accountNo: string; holder: string }
  withdrawals: StoredWithdrawal[]
}
const finance: Record<string, FinanceStore> = (() => {
  try {
    return JSON.parse(localStorage.getItem(FIN_KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const saveFinance = () => {
  try {
    localStorage.setItem(FIN_KEY, JSON.stringify(finance))
  } catch {
    // per-tab only
  }
}
const fin = (userId: string) => (finance[userId] ??= { withdrawals: [] })

export function financeOf(userId: string) {
  const txs = personal(userId).transactions.map(ensureF6)
  const entries: { id: string; at: string; label: string; amountIdr: number; kind: 'escrow' | 'payout' | 'refund' | 'payment' | 'withdrawal' | 'fee' }[] = []
  let escrowHeldIdr = 0
  let receivableIdr = 0
  let earnedIdr = 0
  for (const t of txs) {
    const b = breakdown(t.totalIdr, t.makerFeeRate ?? 0)
    const at = t.payment.paidAt ?? t.updatedAt
    if (t.role === 'buyer') {
      if (t.payment.status === 'escrow') escrowHeldIdr += b.buyerPaysIdr
      if (t.payment.status !== 'unpaid') entries.push({ id: `${t.id}-pay`, at, label: `Bayar ${t.code} · ${t.title}`, amountIdr: -b.buyerPaysIdr, kind: t.payment.status === 'escrow' ? 'escrow' : 'payment' })
      if (t.payment.status === 'refunded') entries.push({ id: `${t.id}-ref`, at: t.updatedAt, label: `Refund ${t.code}`, amountIdr: b.buyerPaysIdr, kind: 'refund' })
    } else {
      if (t.payment.status === 'escrow' || (t.terms !== 'escrow' && ['delivered', 'accepted'].includes(t.status))) receivableIdr += b.supplierReceivesIdr
      if (t.payment.status === 'released') {
        earnedIdr += b.supplierReceivesIdr
        entries.push({ id: `${t.id}-out`, at: t.updatedAt, label: `Pencairan ${t.code} · ${t.title}`, amountIdr: b.buyerPaysIdr, kind: 'payout' })
        entries.push({ id: `${t.id}-fee`, at: t.updatedAt, label: `Fee platform${b.makerFeeIdr ? ' + market maker' : ''} ${t.code}`, amountIdr: -(b.platformFeeIdr + b.makerFeeIdr), kind: 'fee' })
      }
    }
  }
  const f = fin(userId)
  const withdrawnIdr = f.withdrawals.filter((w) => w.status !== 'rejected').reduce((s, w) => s + w.amountIdr, 0)
  for (const w of f.withdrawals) {
    entries.push({ id: w.id, at: w.at, label: `Tarik dana ke ${w.bank?.bank ?? 'rekening'}`, amountIdr: -w.amountIdr, kind: 'withdrawal' })
    if (w.status === 'rejected') entries.push({ id: `${w.id}-rej`, at: w.decidedAt ?? w.at, label: `Pencairan ${w.code} ditolak · dana kembali ke saldo`, amountIdr: w.amountIdr, kind: 'withdrawal' })
  }
  return {
    escrowHeldIdr, receivableIdr, availableIdr: Math.max(0, earnedIdr - withdrawnIdr), withdrawnIdr, bank: f.bank,
    withdrawals: f.withdrawals.map(({ id, amountIdr, at, status, transferRef, paidAt, reason }) => ({ id, amountIdr, at, status, transferRef, paidAt, reason })),
    entries: entries.sort((a, b) => b.at.localeCompare(a.at)),
  }
}

export function setBank(userId: string, bank: FinanceStore['bank']) {
  fin(userId).bank = bank
  saveFinance()
}

export function withdraw(userId: string, amountIdr: number) {
  const f = financeOf(userId)
  if (!fin(userId).bank) return 'Tambahkan rekening pencairan dulu'
  if (!(amountIdr > 0) || amountIdr > f.availableIdr) return `Maksimal ${formatIdr(f.availableIdr)}`
  fin(userId).withdrawals.unshift({ id: newId('wd'), code: `WDR-${Date.now().toString(36).slice(-4).toUpperCase()}`, amountIdr, at: now(), status: 'processing', bank: { ...fin(userId).bank! } })
  saveFinance()
  return null
}


export const allWithdrawals = () =>
  Object.entries(finance).flatMap(([userId, f]) =>
    f.withdrawals.map((w) => {

      w.code ??= `WDR-${w.id.slice(-4).toUpperCase()}`
      w.bank ??= f.bank ?? { bank: '—', accountNo: '0000', holder: '—' }
      return { userId, w }
    }),
  )

export function decideWithdrawal(w: StoredWithdrawal, patch: Partial<StoredWithdrawal>) {
  Object.assign(w, patch)
  saveFinance()
}



const PAIRS_KEY = 'ecp-mock-pairs-v1'


export function seedPairs() {
  try {
    if (localStorage.getItem(PAIRS_KEY)) return
    localStorage.setItem(PAIRS_KEY, '1')
  } catch {
    return
  }
  if (!db.users.some((u) => u.id === 'usr-rina') || !db.users.some((u) => u.id === 'usr-ajar')) return
  createTrade({
    title: 'Box karton 40×30×20 · 300 pcs', buyer: { userId: 'usr-rina' }, supplier: { userId: 'usr-ajar' },
    quantity: { value: 300, unit: 'pcs' }, unitPriceIdr: 2_150, terms: 'net14', address: 'Gudang Rina, Garut',
  })
  const { buyer } = createTrade({
    title: 'Green bean arabika · 50 kg', buyer: { userId: 'usr-ajar' }, supplier: { userId: 'usr-rina' },
    quantity: { value: 50, unit: 'kg' }, unitPriceIdr: 89_000, terms: 'escrow', address: 'Kantor PT Solusi Kemasan, Bandung',
  })

  if (buyer) {
    const at = new Date(Date.now() - 2 * day).toISOString()
    Object.assign(buyer, {
      status: 'delivered' as TransactionStatus, agreement: { buyerAcceptedAt: at, supplierAcceptedAt: at },
      invoice: { number: `INV-${buyer.code.slice(4)}`, issuedAt: at, dueAt: at }, payment: { status: 'escrow', paidAt: at },
      shipments: [{ id: `${buyer.id}-s1`, quantity: 50, dropPoint: buyer.delivery.address, carrier: 'JNE Trucking', scheduledAt: at, status: 'delivered', deliveredAt: at, proof: 'surat-jalan.jpg' }],
    })
    buyer.timeline.forEach((s) => (['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered'].includes(s.status) ? (s.at = at) : undefined))
    mirror(buyer)
  }
  savePersonal()
}
