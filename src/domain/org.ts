import type { AllocationLine, AuctionType, BidVisibility, CategoryId, Offer, OrgRole, Quantity, AuditEntry, TransactionDetail } from './types'
import type { AuctionStatus, Tone } from './status'
import { suggestAllocation } from './auction'

// Business / organization workspace (PRD §9): contract types plus the branching rules shared by
// the UI (what to show/enable) and the mock API (what to accept). BE should enforce the same tables.

// ── Roles & permissions ──────────────────────────────────────────

export type Module = 'procurement' | 'auctions' | 'collective' | 'suppliers' | 'inventory' | 'transactions' | 'analytics' | 'team' | 'profile'
export type Action = 'view' | 'create' | 'approve' | 'manage'
/** roleId → module → allowed actions. Built-in role ids are `OrgRole`; custom roles get `custom-…` ids. */
export type Permissions = Record<string, Partial<Record<Module, Action[]>>>

export const MODULES: Record<Module, string> = {
  procurement: 'Procurement', auctions: 'Auctions', collective: 'Collective', suppliers: 'Suppliers', inventory: 'Inventory',
  transactions: 'Transactions', analytics: 'Analytics', team: 'Tim', profile: 'Profil bisnis',
}
export const ACTIONS: Record<Action, string> = { view: 'Lihat', create: 'Buat', approve: 'Approve', manage: 'Kelola' }

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

/** Owner always has everything so an org can never lock itself out of its own settings. */
export function can(perms: Permissions | undefined, role: string, module: Module, action: Action): boolean {
  if (role === 'owner') return true
  const p = perms?.[role] ?? DEFAULT_PERMISSIONS[role as OrgRole]
  return !!p?.[module]?.includes(action)
}

/** Why an action is unavailable, for disabled buttons. */
export const deniedReason = (roleLabel: string, module: Module, action: Action) =>
  `Peran ${roleLabel} tidak punya izin ${ACTIONS[action].toLowerCase()} ${MODULES[module]}`

// ── Approval rules ───────────────────────────────────────────────

export type ApprovalSubject = 'procurement' | 'auction'

export interface ApprovalRule {
  id: string
  label: string
  /** Applies when the value is strictly above this. */
  minAmountIdr: number
  /** Role ids that must each approve. */
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

/** Every role that must sign off, in rule order, without duplicates. */
export function requiredApprovers(amountIdr: number, subject: ApprovalSubject, rules: ApprovalRule[]): string[] {
  const roles = rules.filter((r) => r.appliesTo.includes(subject) && amountIdr > r.minAmountIdr).flatMap((r) => r.approvers)
  return [...new Set(roles)]
}

export function approvalState(required: string[], approvals: Approval[]) {
  const rejected = approvals.some((a) => a.decision === 'rejected')
  const pending = required.filter((role) => !approvals.some((a) => a.role === role && a.decision === 'approved'))
  return { pending, rejected, approved: !rejected && pending.length === 0 }
}

export const canApprove = (role: string, required: string[], approvals: Approval[]) => {
  const s = approvalState(required, approvals)
  return !s.rejected && s.pending.includes(role)
}

// ── Procurement (PRD §9.4) ───────────────────────────────────────

export type ProcurementStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'published' | 'in_auction' | 'in_collective' | 'awarded' | 'po_issued' | 'rejected' | 'cancelled'

export const PROCUREMENT_STATUS: Record<ProcurementStatus, [label: string, tone: Tone]> = {
  draft: ['Draft', 'gray'],
  pending_approval: ['Menunggu approval', 'yellow'],
  approved: ['Approved', 'blue'],
  published: ['Published', 'teal'],
  in_auction: ['Di auction', 'orange'],
  in_collective: ['Di collective', 'purple'],
  awarded: ['Awarded', 'green'],
  po_issued: ['PO terbit', 'green'],
  rejected: ['Ditolak', 'red'],
  cancelled: ['Dibatalkan', 'gray'],
}

export type Visibility = 'public' | 'private' | 'invite' | 'aggregate'

export const VISIBILITY: Record<Visibility, { label: string; hint: string }> = {
  public: { label: 'Publish', hint: 'Terlihat oleh semua supplier terverifikasi di kategori ini.' },
  private: { label: 'Private', hint: 'Hanya tim internal; dipakai untuk pencatatan atau negosiasi langsung.' },
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

/** Status right after submit (or after a decision): approvals decide whether it can move on. */
export function statusAfterApproval(required: string[], approvals: Approval[]): ProcurementStatus {
  const s = approvalState(required, approvals)
  return s.rejected ? 'rejected' : s.approved ? 'approved' : 'pending_approval'
}

export const PIPELINE = [
  ['draft', 'Draft'], ['approval', 'Approval'], ['published', 'Published'], ['auction', 'Auction'], ['awarded', 'Awarded'], ['po', 'PO'],
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

/** Actions a role can take on a request now; the mock API accepts exactly these. */
export type ProcurementAction = 'submit' | 'approve' | 'reject' | 'publish' | 'cancel' | 'collective'

export function procurementActions(r: Pick<ProcurementRequest, 'status' | 'requiredApprovers' | 'approvals'>, role: string, perms?: Permissions): ProcurementAction[] {
  const out: ProcurementAction[] = []
  const manage = can(perms, role, 'procurement', 'manage') || can(perms, role, 'procurement', 'create')
  if (r.status === 'draft' && manage) out.push('submit')
  if (r.status === 'pending_approval' && canApprove(role, r.requiredApprovers, r.approvals)) out.push('approve', 'reject')
  if (r.status === 'approved' && manage) out.push('publish')
  if ((r.status === 'approved' || r.status === 'published') && can(perms, role, 'collective', 'create')) out.push('collective')
  if (['draft', 'pending_approval', 'approved', 'published'].includes(r.status) && manage) out.push('cancel')
  return out
}

export const canConvertToAuction = (r: Pick<ProcurementRequest, 'status'>, role: string, perms?: Permissions) =>
  (r.status === 'approved' || r.status === 'published') && can(perms, role, 'auctions', 'create')

// ── Suppliers (PRD §9.7) ─────────────────────────────────────────

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
  /** 0–5 stars from all buyers. */
  rating: number
  verified: boolean
  documents: string[]
  capacity: string
  /** Monthly 0–100 scorecard, oldest first. */
  scorecard: ScorePoint[]
}

export type SupplierRelation = 'none' | 'shortlisted' | 'invited' | 'verified' | 'blocked'

export const RELATION: Record<SupplierRelation, [label: string, tone: Tone]> = {
  none: ['Belum terhubung', 'gray'], shortlisted: ['Shortlist', 'blue'], invited: ['Diundang', 'purple'], verified: ['Terverifikasi', 'green'], blocked: ['Diblokir', 'red'],
}

export interface OrgSupplier extends Supplier {
  relation: SupplierRelation
  /** This org's own rating, 1–5. */
  myRating?: number
  transactions: number
  spendIdr: number
}

export interface SupplierDetail extends OrgSupplier {
  history: TransactionDetail[]
}

export type SupplierAction = 'shortlist' | 'invite' | 'verify' | 'block' | 'unblock' | 'rate'

export const scoreOf = (p: Omit<ScorePoint, 'month'>) => Math.round((p.price + p.reliability + p.quality + p.delivery) / 4)

// ── Weighted scoring & award rules (PRD §9.6) ────────────────────

export interface Weights {
  price: number
  quality: number
  delivery: number
  reliability: number
}

export const DEFAULT_WEIGHTS: Weights = { price: 60, quality: 20, delivery: 10, reliability: 10 }

export interface LotOffer extends Offer {
  supplierId: string
  /** 0–100 from the supplier scorecard. */
  quality: number
  delivery: number
  reliability: number
}

/** 0–100 per offer. Price scores relative to the cheapest offer (cheapest = 100). Weights need not sum to 100. */
export function weightedScores(offers: Pick<LotOffer, 'priceIdr' | 'quality' | 'delivery' | 'reliability'>[], w: Weights): number[] {
  if (!offers.length) return []
  const min = Math.min(...offers.map((o) => o.priceIdr))
  const total = w.price + w.quality + w.delivery + w.reliability || 1
  return offers.map((o) => Math.round(((min / o.priceIdr) * 100 * w.price + o.quality * w.quality + o.delivery * w.delivery + o.reliability * w.reliability) / total))
}

export type AwardRule = 'lowest' | 'weighted' | 'split' | 'bundled'

export const AWARD_RULES: Record<AwardRule, { label: string; hint: string }> = {
  lowest: { label: 'Harga terendah', hint: 'Seluruh lot ke penawar termurah.' },
  weighted: { label: 'Weighted score', hint: 'Skor gabungan harga, kualitas, pengiriman, reliabilitas.' },
  split: { label: 'Split award', hint: 'Dibagi ke beberapa supplier termurah sesuai kapasitas (Smart Allocation).' },
  bundled: { label: 'Bundled', hint: 'Semua lot ke satu supplier dengan total termurah.' },
}

const line = (o: LotOffer, quantity: number): AllocationLine => ({ offerId: o.id, supplier: o.supplier.name, quantity, priceIdr: o.priceIdr })

/**
 * Award lines per lot under a rule. Bundled falls back to empty lots when no supplier bid on every lot.
 * Selling (forward/Dutch) auctions ignore the rule: the highest bid takes the whole lot.
 */
export function awardLines(lots: { quantity: number; offers: LotOffer[] }[], rule: AwardRule, w: Weights = DEFAULT_WEIGHTS, higherWins = false): AllocationLine[][] {
  if (higherWins) return lots.map((l) => (l.offers.length ? [line([...l.offers].sort((x, y) => y.priceIdr - x.priceIdr)[0], l.quantity)] : []))
  if (rule === 'bundled') {
    const common = lots.reduce<string[] | null>((ids, l) => {
      const here = l.offers.map((o) => o.supplierId)
      return ids === null ? here : ids.filter((id) => here.includes(id))
    }, null) ?? []
    const cost = (id: string) => lots.reduce((s, l) => s + Math.min(...l.offers.filter((o) => o.supplierId === id).map((o) => o.priceIdr)) * l.quantity, 0)
    const best = [...new Set(common)].sort((a, b) => cost(a) - cost(b))[0]
    return lots.map((l) => {
      const o = l.offers.filter((x) => x.supplierId === best).sort((x, y) => x.priceIdr - y.priceIdr)[0]
      return o ? [line(o, l.quantity)] : []
    })
  }
  return lots.map((l) => {
    if (!l.offers.length) return []
    if (rule === 'split') return suggestAllocation(l.offers, l.quantity)
    if (rule === 'weighted') {
      const scores = weightedScores(l.offers, w)
      const i = scores.indexOf(Math.max(...scores))
      return [line(l.offers[i], l.quantity)]
    }
    const cheapest = [...l.offers].sort((x, y) => x.priceIdr - y.priceIdr)[0]
    return [line(cheapest, l.quantity)]
  })
}

/** Summary of an award, for the simulation table and the confirm dialog. */
export function awardSummary(lots: { quantity: number }[], lines: AllocationLine[][]) {
  const totalIdr = lines.flat().reduce((s, l) => s + l.quantity * l.priceIdr, 0)
  const asked = lots.reduce((s, l) => s + l.quantity, 0)
  const covered = lines.flat().reduce((s, l) => s + l.quantity, 0)
  return { totalIdr, suppliers: new Set(lines.flat().map((l) => l.supplier)).size, coverage: asked ? covered / asked : 0 }
}

// ── Collective procurement (PRD §9.5) ────────────────────────────

/**
 * Volume discount from aggregation: 6% per doubling above the reference lot, capped at 25%.
 * ponytail: one log curve for every category; per-category supplier tiers come with real price data.
 */
export function scaleDiscount(totalQty: number, refQty: number) {
  if (totalQty <= refQty || refQty <= 0) return 0
  return Math.min(0.25, 0.06 * Math.log2(totalQty / refQty))
}

export const projectedUnitPrice = (baseIdr: number, totalQty: number, refQty: number) => Math.round(baseIdr * (1 - scaleDiscount(totalQty, refQty)))

export type PoolStatus = 'open' | 'market_requested' | 'market_live'

export interface PoolMember {
  /** Shown only when `optIn`; otherwise masked as "Bisnis lain". */
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
  /** Lot size suppliers quote the base price for. */
  refQty: number
  /** Total demand that justifies its own market. */
  thresholdQty: number
  status: PoolStatus
  members: PoolMember[]
  marketRequestedAt?: string
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

/** Members as another business sees them: names only for those who opted in. */
export const maskMembers = (members: PoolMember[]) =>
  members.map((m, i) => (m.mine || m.optIn ? m : { ...m, name: `Bisnis lain #${i + 1}` }))

// ── Business auctions (PRD §9.6) ─────────────────────────────────

export type AuctionObjective = 'procurement' | 'selling'
export type WithdrawRule = 'anytime' | 'before_last_30' | 'never'
export type OrgAuctionStatus = 'pending_approval' | 'scheduled' | 'live' | 'closed' | 'awarded' | 'rejected'

export const ORG_AUCTION_STATUS: Record<OrgAuctionStatus, [label: string, tone: Tone]> = {
  pending_approval: ['Menunggu approval', 'yellow'], scheduled: ['Scheduled', 'gray'], live: ['Live', 'lime'],
  closed: ['Closed', 'blue'], awarded: ['Awarded', 'green'], rejected: ['Ditolak', 'red'],
}

export const WITHDRAW_RULES: Record<WithdrawRule, string> = {
  anytime: 'Boleh tarik kapan saja', before_last_30: 'Boleh tarik sampai 30 menit terakhir', never: 'Bid mengikat, tidak bisa ditarik',
}

export interface OrgLot {
  id: string
  item: string
  quantity: Quantity
  spec: string
  /** Reverse: target/max price per unit; forward: reserve per unit. Also the opening price. */
  reservePriceIdr: number
  /** Economy auction this lot runs as once live. */
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

/** Per-lot live facts merged from the economy auction. */
export interface OrgAuctionView extends OrgAuction {
  live: { auctionId: string; status: AuctionStatus; bidCount: number; participants: number; bestPriceIdr?: number; endsAt: string }[]
}

export const auctionValue = (lots: Pick<OrgLot, 'quantity' | 'reservePriceIdr'>[]) => lots.reduce((s, l) => s + l.quantity.value * l.reservePriceIdr, 0)

/** Org-level status from its lots: live while any lot runs, closed when all are done. */
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

// ── Inventory (PRD §9.3) ─────────────────────────────────────────

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

/** RFC 4180-ish: quoted fields, escaped quotes, CRLF. */
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

/** Rows from an inventory CSV (header row required) plus per-row errors; invalid rows are skipped. */
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

// ── Org profile, team, overview, analytics ───────────────────────

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
  /** Spend per month per category (Rupiah), oldest first. */
  spend: ({ month: string } & Partial<Record<CategoryId, number>>)[]
  /** Paid vs budget vs market per month. */
  savings: { month: string; spendIdr: number; budgetIdr: number; marketIdr: number }[]
  /** Average unit price per item, ours vs market. */
  unitPrices: { item: string; unit: string; avgIdr: number; marketIdr: number }[]
  /** Our unit price vs market for the biggest item, indexed to its first month = 100. */
  priceTrend: { item: string; points: { month: string; ours: number; market: number }[] }
  /** Purchased quantity of the biggest item per month. */
  demand: { item: string; unit: string; points: { month: string; quantity: number; requests: number }[] }
  suppliers: { id: string; name: string; score: number; onTime: number; spendIdr: number }[]
  auctions: { code: string; title: string; bidders: number; openingIdr: number; clearingIdr: number }[]
  history: { code: string; month: string; item: string; categoryId: CategoryId; supplier: string; quantity: Quantity; unitPriceIdr: number; totalIdr: number; via: 'auction' | 'collective' | 'direct' }[]
}
