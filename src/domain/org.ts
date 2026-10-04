import type { AllocationLine, AuctionType, BidVisibility, CategoryId, Offer, OrgRole, Quantity, AuditEntry, TransactionDetail } from './types'
import type { AuctionStatus, Tone } from './status'
import { suggestAllocation } from './auction'
import { TRADE_ACTION_LABEL, type TradeAction } from './trade'






export type Module = 'procurement' | 'auctions' | 'collective' | 'suppliers' | 'inventory' | 'transactions' | 'analytics' | 'team' | 'profile'
export type Action = 'view' | 'create' | 'approve' | 'manage'

export type Permissions = Record<string, Partial<Record<Module, Action[]>>>

export const MODULES: Record<Module, string> = {
  procurement: 'Procurement', auctions: 'Auctions', collective: 'Collective', suppliers: 'Suppliers', inventory: 'Inventory',
  transactions: 'Transactions', analytics: 'Analytics', team: 'Tim', profile: 'Profil bisnis',
}
export const ACTIONS: Record<Action, string> = { view: 'Lihat', create: 'Buat', approve: 'Setujui', manage: 'Kelola' }

export const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Owner', procurement: 'Procurement', finance: 'Finance', operations: 'Operations', sales: 'Sales' }

const ALL: Action[] = ['view', 'create', 'approve', 'manage']
const V: Action[] = ['view']
const VC: Action[] = ['view', 'create']
const VCM: Action[] = ['view', 'create', 'manage']

export const DEFAULT_PERMISSIONS: Record<OrgRole, Record<Module, Action[]>> = {
  owner: { procurement: ALL, auctions: ALL, collective: ALL, suppliers: ALL, inventory: ALL, transactions: ALL, analytics: ALL, team: ALL, profile: ALL },
  procurement: { procurement: VCM, auctions: VCM, collective: VCM, suppliers: VCM, inventory: V, transactions: VC, analytics: V, team: V, profile: V },
  finance: { procurement: ['view', 'approve'], auctions: ['view', 'approve'], collective: V, suppliers: V, inventory: V, transactions: ['view', 'approve', 'manage'], analytics: V, team: V, profile: V },
  operations: { procurement: VC, auctions: V, collective: V, suppliers: V, inventory: VCM, transactions: ['view', 'manage'], analytics: V, team: V, profile: V },
  sales: { procurement: V, auctions: V, collective: V, suppliers: V, inventory: V, transactions: V, analytics: V, team: V, profile: V },
}


export function can(perms: Permissions | undefined, role: string, module: Module, action: Action): boolean {
  if (role === 'owner') return true
  const p = perms?.[role] ?? DEFAULT_PERMISSIONS[role as OrgRole]
  return !!p?.[module]?.includes(action)
}


export const deniedReason = (roleLabel: string, module: Module, action: Action) =>
  `Peran ${roleLabel} tidak punya izin ${ACTIONS[action].toLowerCase()} ${MODULES[module]}`


export const TX_ACTION_ROLES: Record<TradeAction, OrgRole[]> = {
  accept_agreement: ['owner', 'procurement', 'sales'],
  issue_invoice: ['owner', 'finance', 'sales'],
  pay: ['owner', 'finance'],
  ship: ['owner', 'operations'],
  upload_proof: ['owner', 'operations'],
  confirm_receipt: ['owner', 'procurement', 'operations'],
  cancel: ['owner', 'procurement'],
  dispute: ['owner', 'procurement'],
  add_evidence: ['owner', 'procurement', 'operations'],
  review: ['owner', 'procurement'],
}


export function canTransact(perms: Permissions | undefined, role: string, action: TradeAction): boolean {
  if (Object.hasOwn(ROLE_LABEL, role)) return TX_ACTION_ROLES[action].includes(role as OrgRole)
  return can(perms, role, 'transactions', 'manage')
}


export function txDeniedReason(perms: Permissions | undefined, role: string, roleLabel: string, action: TradeAction) {
  if (canTransact(perms, role, action)) return undefined
  if (!Object.hasOwn(ROLE_LABEL, role)) return deniedReason(roleLabel, 'transactions', 'manage')
  return `${TRADE_ACTION_LABEL[action]} hanya untuk ${TX_ACTION_ROLES[action].map((r) => ROLE_LABEL[r]).join(', ')}; peranmu ${roleLabel}`
}



export type ApprovalSubject = 'procurement' | 'auction'

export interface ApprovalRule {
  id: string
  label: string

  minAmountIdr: number

  approvers: string[]
  appliesTo: ApprovalSubject[]
}

export interface Approval {
  role: string
  by: string
  at: string
  decision: 'approved' | 'rejected'
  note?: string
}


export function requiredApprovers(amountIdr: number, subject: ApprovalSubject, rules: ApprovalRule[]): string[] {
  const roles = rules.filter((r) => r.appliesTo.includes(subject) && amountIdr > r.minAmountIdr).flatMap((r) => r.approvers)
  return [...new Set(roles)]
}

export function approvalState(required: string[], approvals: Approval[]) {
  const rejected = approvals.some((a) => a.decision === 'rejected')
  const pending = required.filter((role) => !approvals.some((a) => a.role === role && a.decision === 'approved'))
  return { pending, rejected, approved: !rejected && pending.length === 0 }
}






export function signingRoles(role: string, required: string[], approvals: Approval[], activeRoles?: string[]): string[] {
  const s = approvalState(required, approvals)
  if (s.rejected) return []
  const own = s.pending.includes(role) ? [role] : []
  const orphans = role === 'owner' && activeRoles ? s.pending.filter((r) => r !== role && !activeRoles.includes(r)) : []
  return [...own, ...orphans]
}

export const canApprove = (role: string, required: string[], approvals: Approval[], activeRoles?: string[]) =>
  signingRoles(role, required, approvals, activeRoles).length > 0


export const approvalBy = (name: string, actorRoleLabel: string, signedRoleLabel: string, onBehalf: boolean) =>
  onBehalf ? `${name} · ${actorRoleLabel} (atas nama ${signedRoleLabel})` : `${name} (${actorRoleLabel})`


export function approverUserIds(required: string[], approvals: Approval[], members: { userId: string; role: string }[], actorId?: string): string[] {
  const active = members.map((m) => m.role)
  return [...new Set(members.filter((m) => m.userId !== actorId && canApprove(m.role, required, approvals, active)).map((m) => m.userId))]
}



export type ProcurementStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'published' | 'in_auction' | 'in_collective' | 'awarded' | 'po_issued' | 'rejected' | 'cancelled'

export const PROCUREMENT_STATUS: Record<ProcurementStatus, [label: string, tone: Tone]> = {
  draft: ['Draf', 'gray'],
  pending_approval: ['Menunggu persetujuan', 'yellow'],
  approved: ['Disetujui', 'blue'],
  published: ['Diterbitkan', 'teal'],
  in_auction: ['Di auction', 'orange'],
  in_collective: ['Di collective', 'purple'],
  awarded: ['Pemenang ditetapkan', 'green'],
  po_issued: ['PO terbit', 'green'],
  rejected: ['Ditolak', 'red'],
  cancelled: ['Dibatalkan', 'gray'],
}

export type Visibility = 'public' | 'private' | 'invite' | 'aggregate'

export const VISIBILITY: Record<Visibility, { label: string; hint: string }> = {
  public: { label: 'Publik', hint: 'Terlihat oleh semua supplier terverifikasi di kategori ini.' },
  private: { label: 'Internal', hint: 'Hanya tim internal; dipakai untuk pencatatan atau negosiasi langsung.' },
  invite: { label: 'Undang supplier', hint: 'Hanya supplier yang kamu undang yang bisa melihat dan menawar.' },
  aggregate: { label: 'Gabung pembeli lain', hint: 'Digabung dengan demand bisnis lain untuk harga skala (collective).' },
}

export interface ProcurementRequest {
  id: string
  code: string
  need: string
  categoryId: CategoryId
  quantity: Quantity
  budgetIdr: number
  deadline: string
  spec: string
  deliveryLocation: string
  visibility: Visibility
  invitedSupplierIds: string[]
  status: ProcurementStatus
  requiredApprovers: string[]
  approvals: Approval[]
  createdBy: string
  createdAt: string
  updatedAt: string
  auctionId?: string
  poolId?: string
}

export type ProcurementInput = Pick<ProcurementRequest, 'need' | 'categoryId' | 'quantity' | 'budgetIdr' | 'deadline' | 'spec' | 'deliveryLocation' | 'visibility' | 'invitedSupplierIds'>


export function statusAfterApproval(required: string[], approvals: Approval[]): ProcurementStatus {
  const s = approvalState(required, approvals)
  return s.rejected ? 'rejected' : s.approved ? 'approved' : 'pending_approval'
}

export const PIPELINE = [
  ['draft', 'Draf'], ['approval', 'Persetujuan'], ['published', 'Diterbitkan'], ['auction', 'Auction'], ['awarded', 'Pemenang ditetapkan'], ['po', 'PO'],
] as const
export type PipelineStage = (typeof PIPELINE)[number][0]

export function pipelineStage(s: ProcurementStatus): PipelineStage | null {
  const map: Partial<Record<ProcurementStatus, PipelineStage>> = {
    draft: 'draft', pending_approval: 'approval', approved: 'published', published: 'published', in_collective: 'published',
    in_auction: 'auction', awarded: 'awarded', po_issued: 'po',
  }
  return map[s] ?? null
}

export function pipelineCounts(statuses: ProcurementStatus[]): Record<PipelineStage, number> {
  const counts = Object.fromEntries(PIPELINE.map(([k]) => [k, 0])) as Record<PipelineStage, number>
  for (const s of statuses) {
    const stage = pipelineStage(s)
    if (stage) counts[stage]++
  }
  return counts
}


export type ProcurementAction = 'submit' | 'approve' | 'reject' | 'publish' | 'cancel' | 'collective'

export function procurementActions(r: Pick<ProcurementRequest, 'status' | 'requiredApprovers' | 'approvals'>, role: string, perms?: Permissions, activeRoles?: string[]): ProcurementAction[] {
  const out: ProcurementAction[] = []
  const manage = can(perms, role, 'procurement', 'manage') || can(perms, role, 'procurement', 'create')
  if (r.status === 'draft' && manage) out.push('submit')
  if (r.status === 'pending_approval' && canApprove(role, r.requiredApprovers, r.approvals, activeRoles)) out.push('approve', 'reject')
  if (r.status === 'approved' && manage) out.push('publish')
  if ((r.status === 'approved' || r.status === 'published') && can(perms, role, 'collective', 'create')) out.push('collective')
  if (['draft', 'pending_approval', 'approved', 'published'].includes(r.status) && manage) out.push('cancel')
  return out
}

export const canConvertToAuction = (r: Pick<ProcurementRequest, 'status'>, role: string, perms?: Permissions) =>
  (r.status === 'approved' || r.status === 'published') && can(perms, role, 'auctions', 'create')



export interface ScorePoint {
  month: string
  price: number
  reliability: number
  quality: number
  delivery: number
}

export interface Supplier {
  id: string
  name: string
  categories: CategoryId[]
  region: string

  rating: number
  verified: boolean
  documents: string[]
  capacity: string

  scorecard: ScorePoint[]
}

export type SupplierRelation = 'none' | 'shortlisted' | 'invited' | 'verified' | 'blocked'

export const RELATION: Record<SupplierRelation, [label: string, tone: Tone]> = {
  none: ['Belum terhubung', 'gray'], shortlisted: ['Pilihan', 'blue'], invited: ['Diundang', 'purple'], verified: ['Terverifikasi', 'green'], blocked: ['Diblokir', 'red'],
}

export interface OrgSupplier extends Supplier {
  relation: SupplierRelation

  myRating?: number
  transactions: number
  spendIdr: number
}

export interface SupplierDetail extends OrgSupplier {
  history: TransactionDetail[]
}

export type SupplierAction = 'shortlist' | 'invite' | 'verify' | 'block' | 'unblock' | 'rate'

export const scoreOf = (p: Omit<ScorePoint, 'month'>) => Math.round((p.price + p.reliability + p.quality + p.delivery) / 4)



export interface Weights {
  price: number
  quality: number
  delivery: number
  reliability: number
}

export const DEFAULT_WEIGHTS: Weights = { price: 60, quality: 20, delivery: 10, reliability: 10 }

export interface LotOffer extends Offer {
  supplierId: string

  quality: number
  delivery: number
  reliability: number
}


export const higherWins = (t: AuctionType) => t === 'forward' || t === 'dutch'





export function weightedScores(offers: Pick<LotOffer, 'priceIdr' | 'quality' | 'delivery' | 'reliability'>[], w: Weights, higher = false): number[] {
  if (!offers.length) return []
  const prices = offers.map((o) => o.priceIdr)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const total = w.price + w.quality + w.delivery + w.reliability || 1
  return offers.map((o) => {
    const price = higher ? o.priceIdr / max : min / o.priceIdr
    return Math.round((price * 100 * w.price + o.quality * w.quality + o.delivery * w.delivery + o.reliability * w.reliability) / total)
  })
}

export type AwardRule = 'lowest' | 'weighted' | 'split' | 'bundled'

export const AWARD_RULES: Record<AwardRule, { label: string; hint: string }> = {
  lowest: { label: 'Harga terendah', hint: 'Seluruh lot ke penawar termurah.' },
  weighted: { label: 'Weighted score', hint: 'Skor gabungan harga, kualitas, pengiriman, reliabilitas.' },
  split: { label: 'Split award', hint: 'Dibagi ke beberapa supplier termurah sesuai kapasitas (Smart Allocation).' },
  bundled: { label: 'Bundled', hint: 'Semua lot ke satu supplier dengan total termurah.' },
}

const SELLING_AWARD_RULES: Record<AwardRule, { label: string; hint: string }> = {
  lowest: { label: 'Harga tertinggi', hint: 'Seluruh lot ke penawar tertinggi.' },
  weighted: { label: 'Weighted score', hint: 'Skor gabungan harga (tertinggi terbaik), kualitas, pengiriman, reliabilitas.' },
  split: { label: 'Split award', hint: 'Dibagi ke beberapa pembeli dengan harga tertinggi sesuai kapasitas.' },
  bundled: { label: 'Bundled', hint: 'Semua lot ke satu pembeli dengan total tertinggi.' },
}


export const awardRuleInfo = (rule: AwardRule, higher = false) => (higher ? SELLING_AWARD_RULES : AWARD_RULES)[rule]


const line = (o: LotOffer, quantity: number): AllocationLine => ({ offerId: o.id, supplier: o.supplier.name, quantity: Math.min(quantity, o.capacity.value), priceIdr: o.priceIdr })






export function awardLines(lots: { quantity: number; offers: LotOffer[] }[], rule: AwardRule, w: Weights = DEFAULT_WEIGHTS, higher = false): AllocationLine[][] {
  const better = (x: LotOffer, y: LotOffer) => (higher ? y.priceIdr - x.priceIdr : x.priceIdr - y.priceIdr)
  if (rule === 'bundled') {
    const common = lots.reduce<string[] | null>((ids, l) => {
      const here = l.offers.map((o) => o.supplierId)
      return ids === null ? here : ids.filter((id) => here.includes(id))
    }, null) ?? []
    const pick = higher ? Math.max : Math.min
    const total = (id: string) => lots.reduce((s, l) => s + pick(...l.offers.filter((o) => o.supplierId === id).map((o) => o.priceIdr)) * l.quantity, 0)
    const best = [...new Set(common)].sort((a, b) => (higher ? total(b) - total(a) : total(a) - total(b)))[0]
    return lots.map((l) => {
      const o = l.offers.filter((x) => x.supplierId === best).sort(better)[0]
      return o ? [line(o, l.quantity)] : []
    })
  }
  return lots.map((l) => {
    if (!l.offers.length) return []
    if (rule === 'split') return higher ? splitHighest(l.offers, l.quantity) : suggestAllocation(l.offers, l.quantity)
    if (rule === 'weighted') {
      const scores = weightedScores(l.offers, w, higher)
      const i = scores.indexOf(Math.max(...scores))
      return [line(l.offers[i], l.quantity)]
    }
    return [line([...l.offers].sort(better)[0], l.quantity)]
  })
}


function splitHighest(offers: LotOffer[], quantity: number): AllocationLine[] {
  const lines: AllocationLine[] = []
  let left = quantity
  for (const o of [...offers].sort((x, y) => y.priceIdr - x.priceIdr || y.supplier.reputation - x.supplier.reputation)) {
    if (left <= 0) break
    const take = Math.min(left, o.capacity.value)
    lines.push(line(o, take))
    left -= take
  }
  return lines
}


export function awardSummary(lots: { quantity: number }[], lines: AllocationLine[][]) {
  const totalIdr = lines.flat().reduce((s, l) => s + l.quantity * l.priceIdr, 0)
  const asked = lots.reduce((s, l) => s + l.quantity, 0)
  const covered = lines.flat().reduce((s, l) => s + l.quantity, 0)
  return { totalIdr, suppliers: new Set(lines.flat().map((l) => l.supplier)).size, coverage: asked ? covered / asked : 0 }
}







export function scaleDiscount(totalQty: number, refQty: number) {
  if (totalQty <= refQty || refQty <= 0) return 0
  return Math.min(0.25, 0.06 * Math.log2(totalQty / refQty))
}

export const projectedUnitPrice = (baseIdr: number, totalQty: number, refQty: number) => Math.round(baseIdr * (1 - scaleDiscount(totalQty, refQty)))

export type PoolStatus = 'open' | 'market_requested' | 'market_live' | 'settled'

export interface PoolMember {

  name: string
  quantity: number
  optIn: boolean
  mine?: boolean
}

export interface CollectivePool {
  id: string
  title: string
  categoryId: CategoryId
  spec: string
  region: string
  deadline: string
  unit: string
  baseUnitPriceIdr: number

  refQty: number

  thresholdQty: number
  status: PoolStatus
  members: PoolMember[]
  marketRequestedAt?: string

  marketId?: string
  auctionId?: string

  round?: { status: AuctionStatus; endsAt: string }
  settlement?: PoolSettlement
}


export interface PoolSettlement {
  at: string
  by: string
  winner: string
  priceIdr: number
  lines: (PoolMember & { share: number; amountIdr: number; transactionId?: string })[]
}

export function poolTotals(pool: Pick<CollectivePool, 'members' | 'baseUnitPriceIdr' | 'refQty' | 'thresholdQty'>) {
  const mine = pool.members.filter((m) => m.mine).reduce((s, m) => s + m.quantity, 0)
  const total = pool.members.reduce((s, m) => s + m.quantity, 0)
  return {
    mine, others: total - mine, total, businesses: pool.members.length,
    unitPriceIdr: projectedUnitPrice(pool.baseUnitPriceIdr, total, pool.refQty),
    discount: scaleDiscount(total, pool.refQty),
    ready: total >= pool.thresholdQty,
    progress: Math.min(1, total / pool.thresholdQty),
  }
}


export const maskMembers = (members: PoolMember[]) =>
  members.map((m, i) => (m.mine || m.optIn ? m : { ...m, name: `Bisnis lain #${i + 1}` }))



export type AuctionObjective = 'procurement' | 'selling'
export type WithdrawRule = 'anytime' | 'before_last_30' | 'never'
export type OrgAuctionStatus = 'pending_approval' | 'scheduled' | 'live' | 'closed' | 'awarded' | 'rejected'

export const ORG_AUCTION_STATUS: Record<OrgAuctionStatus, [label: string, tone: Tone]> = {
  pending_approval: ['Menunggu persetujuan', 'yellow'], scheduled: ['Terjadwal', 'gray'], live: ['Berlangsung', 'lime'],
  closed: ['Ditutup', 'blue'], awarded: ['Pemenang ditetapkan', 'green'], rejected: ['Ditolak', 'red'],
}

export const WITHDRAW_RULES: Record<WithdrawRule, string> = {
  anytime: 'Boleh tarik kapan saja', before_last_30: 'Boleh tarik sampai 30 menit terakhir', never: 'Bid mengikat, tidak bisa ditarik',
}

export interface OrgLot {
  id: string
  item: string
  quantity: Quantity
  spec: string

  reservePriceIdr: number

  auctionId?: string
}

export interface OrgAuctionInput {
  title: string
  categoryId: CategoryId
  type: AuctionType
  objective: AuctionObjective
  multiLot: boolean
  lots: Omit<OrgLot, 'id' | 'auctionId'>[]
  rules: { minStepIdr: number; visibility: BidVisibility; autoExtension: boolean; withdraw: WithdrawRule; award: AwardRule; weights: Weights }
  qualification: { documents: string[]; minRating: number; regions: string[] }
  invited: string[]
  schedule: { startsAt?: string; durationMinutes: number }
  procurementId?: string
}

export interface OrgAuction extends Omit<OrgAuctionInput, 'lots'> {
  id: string
  code: string
  lots: OrgLot[]
  status: OrgAuctionStatus
  valueIdr: number
  requiredApprovers: string[]
  approvals: Approval[]
  createdBy: string
  createdAt: string
  award?: { lines: AllocationLine[][]; reason: string; at: string; by: string; poNumber?: string; transactionIds?: string[] }
}


export interface OrgAuctionView extends OrgAuction {
  live: { auctionId: string; status: AuctionStatus; bidCount: number; participants: number; bestPriceIdr?: number; endsAt: string }[]
}

export const auctionValue = (lots: Pick<OrgLot, 'quantity' | 'reservePriceIdr'>[]) => lots.reduce((s, l) => s + l.quantity.value * l.reservePriceIdr, 0)


export function orgAuctionStatus(a: Pick<OrgAuction, 'status' | 'award'>, lots: AuctionStatus[]): OrgAuctionStatus {
  if (a.status === 'pending_approval' || a.status === 'rejected') return a.status
  if (a.award) return 'awarded'
  if (!lots.length) return a.status
  if (lots.some((s) => s === 'live' || s === 'extended')) return 'live'
  if (lots.every((s) => s === 'scheduled' || s === 'qualification')) return 'scheduled'
  return 'closed'
}

export interface LotEvaluation {
  lot: OrgLot
  status: AuctionStatus
  offers: LotOffer[]
}

export interface OrgAuctionEvaluation {
  auction: OrgAuctionView
  lots: LotEvaluation[]
  org: { name: string; location: string; npwp: string }
}



export interface InventoryItem {
  id: string
  sku: string
  name: string
  categoryId: CategoryId
  warehouse: string
  quantity: Quantity
  moq: number
  leadTimeDays: number
  qualitySpec: string
}

export interface InventoryData {
  items: InventoryItem[]
  warehouses: { name: string; location: string; capacityM2: number }[]
  capacity: { line: string; outputPerMonth: Quantity; utilization: number }[]
  logistics: { fleet: { type: string; count: number; capacity: string }[]; regions: string[] }
  schedules: { id: string; item: string; quantity: Quantity; every: 'weekly' | 'monthly'; counterparty: string; direction: 'in' | 'out'; nextAt: string }[]
}


export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n')
}

export const INVENTORY_CSV_HEADER = ['sku', 'nama', 'kategori', 'gudang', 'jumlah', 'satuan', 'moq', 'lead_time_hari', 'spesifikasi']


export function inventoryFromCsv(rows: string[][], categories: CategoryId[]) {
  const [head, ...body] = rows
  const idx = Object.fromEntries((head ?? []).map((h, i) => [h.trim().toLowerCase(), i]))
  const missing = INVENTORY_CSV_HEADER.slice(0, 6).filter((h) => idx[h] === undefined)
  if (missing.length) return { items: [], errors: [`Kolom wajib tidak ada: ${missing.join(', ')}`] }
  const items: Omit<InventoryItem, 'id'>[] = []
  const errors: string[] = []
  body.forEach((r, n) => {
    const get = (h: string) => (idx[h] === undefined ? '' : (r[idx[h]] ?? '').trim())
    const qty = Number(get('jumlah'))
    const cat = get('kategori') as CategoryId
    if (!get('nama')) return errors.push(`Baris ${n + 2}: nama kosong`)
    if (!(qty >= 0) || get('jumlah') === '') return errors.push(`Baris ${n + 2}: jumlah bukan angka`)
    if (!categories.includes(cat)) return errors.push(`Baris ${n + 2}: kategori "${cat}" tidak dikenal`)
    items.push({
      sku: get('sku') || `SKU-${n + 1}`, name: get('nama'), categoryId: cat, warehouse: get('gudang') || 'Gudang utama',
      quantity: { value: qty, unit: get('satuan') || 'unit' }, moq: Number(get('moq')) || 0, leadTimeDays: Number(get('lead_time_hari')) || 0,
      qualitySpec: get('spesifikasi'),
    })
  })
  return { items, errors }
}



export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

export interface OrgProfile {
  name: string
  industry: string
  location: string
  legal: { nib: string; npwp: string; akta: string }
  description: string
  categories: CategoryId[]
  hours: { days: number[]; from: string; to: string }
  documents: { name: string; kind: 'nib' | 'npwp' | 'akta' | 'other'; uploadedAt: string }[]
  verification: VerificationStatus
}

export interface OrgRoleDef {
  id: string
  label: string
  custom: boolean
}

export interface OrgMember {
  id: string
  name: string
  email: string
  role: string
  department: string
  status: 'active' | 'invited'
  joinedAt: string
}

export interface OrgSettings {
  profile: OrgProfile
  roles: OrgRoleDef[]
  permissions: Permissions
  departments: string[]
  approvalRules: ApprovalRule[]

  activeRoles: string[]
}

export interface TeamData extends OrgSettings {
  members: OrgMember[]
}

export interface WaitingItem {
  kind: ApprovalSubject
  id: string
  code: string
  title: string
  valueIdr: number
  href: string
}

export interface OrgOverview {
  stats: {
    spendMonthIdr: number
    savingsMonthIdr: number
    savingsTargetIdr: number
    activeProcurement: number
    activeAuctions: number
    activeSuppliers: number
    runningTransactions: number
  }
  waiting: WaitingItem[]
  pipeline: Record<PipelineStage, number>
  activity: AuditEntry[]
}

export interface OrgAnalytics {
  categories: CategoryId[]

  spend: ({ month: string } & Partial<Record<CategoryId, number>>)[]

  savings: { month: string; spendIdr: number; budgetIdr: number; marketIdr: number }[]

  unitPrices: { item: string; unit: string; avgIdr: number; marketIdr: number }[]

  priceTrend: { item: string; points: { month: string; ours: number; market: number }[] }

  demand: { item: string; unit: string; points: { month: string; quantity: number; requests: number }[] }
  suppliers: { id: string; name: string; score: number; onTime: number; spendIdr: number }[]
  auctions: { code: string; title: string; bidders: number; openingIdr: number; clearingIdr: number }[]
  history: { code: string; month: string; item: string; categoryId: CategoryId; supplier: string; quantity: Quantity; unitPriceIdr: number; totalIdr: number; via: 'auction' | 'collective' | 'direct' }[]
}
