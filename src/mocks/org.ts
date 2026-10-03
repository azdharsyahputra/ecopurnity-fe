import type { AuctionDetail, AuditEntry, CategoryId, PublicBid, TransactionDetail } from '@/domain/types'
import type { TransactionStatus } from '@/domain/status'
import {
  DEFAULT_PERMISSIONS, DEFAULT_WEIGHTS, ROLE_LABEL, auctionValue, awardRuleInfo, higherWins, requiredApprovers, type ApprovalRule, type CollectivePool, type InventoryData,
  type OrgAuction, type OrgLot, type OrgMember, type OrgSettings, type PoolMember, type ProcurementRequest, type Supplier,
  type SupplierRelation,
} from '@/domain/org'
import { AUCTION_TYPES } from '@/domain/catalog'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { economy } from './economy'

// Business workspace mock data (PRD §9). One persisted blob per org plus the shared collective pools.
// ponytail: whole-store JSON in localStorage, rewritten on every mutation; fine for two demo orgs.

export type OrgTx = TransactionDetail & { supplierId?: string }

export interface HistoryRow {
  code: string
  month: string
  item: string
  categoryId: CategoryId
  supplierId: string
  quantity: { value: number; unit: string }
  unitPriceIdr: number
  budgetUnitIdr: number
  marketUnitIdr: number
  via: 'auction' | 'collective' | 'direct'
  bidders?: number
  openingIdr?: number
}

export interface OrgData {
  settings: OrgSettings
  members: (OrgMember & { userId?: string })[]
  /** Demo user who owns this org's economy auctions (economy.owners). */
  ownerUserId: string
  savingsTargetIdr: number
  inventory: InventoryData
  procurements: ProcurementRequest[]
  auctions: OrgAuction[]
  /** Live lots as economy auctions; re-injected into the public economy on load. */
  economyAuctions: AuctionDetail[]
  suppliers: Record<string, { relation: SupplierRelation; myRating?: number }>
  transactions: OrgTx[]
  history: HistoryRow[]
  activity: AuditEntry[]
}

type StoredPoolMember = PoolMember & { orgId?: string }
export type StoredPool = Omit<CollectivePool, 'members'> & { members: StoredPoolMember[] }

interface Store {
  v: 2
  orgs: Record<string, OrgData>
  pools: StoredPool[]
}

const KEY = 'ecp-mock-org'
const NOW = Date.now()
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
const ahead = (min: number) => new Date(NOW + min * 60_000).toISOString()
const DAY = 1440
let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

let seed = 7331
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

// ── Supplier directory (shared, code-seeded) ─────────────────────

type SupplierRow = [id: string, name: string, cats: CategoryId[], region: string, rating: number, verified: boolean, capacity: string, base: number]

const SUPPLIER_ROWS: SupplierRow[] = [
  ['sup-kertas-prima', 'PT Kertas Prima Jabar', ['packaging'], 'Jawa Barat', 4.6, true, '600 ton kraft/bulan', 86],
  ['sup-flexo-warna', 'CV Flexo Warna', ['manufacturing', 'packaging'], 'Jawa Barat', 4.3, true, '8 ton tinta/bulan', 81],
  ['sup-lem-nusantara', 'PT Lem Nusantara', ['manufacturing'], 'Jawa Tengah', 4.1, true, '40 ton adhesive/bulan', 78],
  ['sup-pallet-indo', 'PT Pallet Indo', ['packaging', 'logistics'], 'Jawa Barat', 3.9, false, '3.000 pallet/bulan', 72],
  ['sup-polimer-jaya', 'PT Polimer Jaya', ['manufacturing', 'packaging'], 'DKI Jakarta', 4.5, true, '250 ton resin/bulan', 84],
  ['sup-kemas-prima', 'PT Kemas Prima', ['packaging'], 'DKI Jakarta', 4.4, true, '2 juta pouch/bulan', 83],
  ['sup-makmur-jaya', 'UD Makmur Jaya', ['packaging', 'agri'], 'Jawa Barat', 3.7, false, '20.000 karung/bulan', 70],
  ['sup-logistik-andalan', 'PT Logistik Andalan', ['logistics'], 'DKI Jakarta', 4.2, true, '45 truk', 80],
  ['sup-mitra-tani', 'Koperasi Mitra Tani', ['agri'], 'Jawa Tengah', 4.7, true, '400 ton pupuk/bulan', 88],
  ['sup-karung-sejahtera', 'CV Karung Sejahtera', ['packaging', 'agri'], 'Jawa Timur', 4.0, true, '35.000 karung/bulan', 76],
  ['sup-energi-hijau', 'PT Energi Hijau', ['energy'], 'Bali', 4.3, true, '120 paket PLTS/bulan', 79],
  ['sup-roasting', 'PT Mesin Roasting Nusantara', ['manufacturing'], 'Jawa Timur', 4.1, false, 'Servis 30 mesin/bulan', 74],
]

const monthKey = (back: number) => {
  const d = new Date(NOW)
  d.setDate(1)
  d.setMonth(d.getMonth() - back)
  return d.toISOString().slice(0, 7)
}

export const SUPPLIERS: Supplier[] = SUPPLIER_ROWS.map(([id, name, categories, region, rating, verified, capacity, base]) => {
  const clamp = (n: number) => Math.max(40, Math.min(99, Math.round(n)))
  return {
    id, name, categories, region, rating, verified, capacity,
    documents: verified ? ['NIB.pdf', 'NPWP.pdf', 'Sertifikat-mutu.pdf'] : ['NIB.pdf'],
    scorecard: Array.from({ length: 6 }, (_, k) => ({
      month: monthKey(5 - k),
      price: clamp(base + (rand() - 0.5) * 12 + k),
      reliability: clamp(base + (rand() - 0.5) * 10),
      quality: clamp(base + 3 + (rand() - 0.5) * 8),
      delivery: clamp(base - 2 + (rand() - 0.5) * 14 + k * 0.6),
    })),
  }
})

export const supplierById = (id: string) => SUPPLIERS.find((s) => s.id === id)

// ── Shared builders ──────────────────────────────────────────────

const RULES = (): ApprovalRule[] => [
  { id: 'rule-50jt', label: 'Procurement > Rp 50 jt', minAmountIdr: 50_000_000, approvers: ['finance', 'owner'], appliesTo: ['procurement', 'auction'] },
  { id: 'rule-auction-200jt', label: 'Auction > Rp 200 jt', minAmountIdr: 200_000_000, approvers: ['owner', 'procurement'], appliesTo: ['auction'] },
]

const baseSettings = (name: string, industry: string, location: string, categories: CategoryId[]): OrgSettings => ({
  profile: {
    name, industry, location, legal: { nib: '', npwp: '', akta: '' }, description: '', categories,
    hours: { days: [0, 1, 2, 3, 4], from: '08:00', to: '17:00' }, documents: [], verification: 'unverified',
  },
  roles: (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((id) => ({ id, label: ROLE_LABEL[id], custom: false })),
  permissions: structuredClone(DEFAULT_PERMISSIONS),
  departments: ['Direksi', 'Pengadaan', 'Keuangan', 'Operasional', 'Penjualan'],
  approvalRules: RULES(),
})

const TIMELINE: TransactionStatus[] = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'completed']

export function makeTx(
  t: Pick<OrgTx, 'title' | 'role' | 'counterparty' | 'quantity' | 'unitPriceIdr' | 'supplierId' | 'auctionId'> & { status?: TransactionStatus; createdMin?: number; poNumber?: string; address: string },
): OrgTx {
  const id = newId('otx')
  const created = t.createdMin ?? 0
  const status = t.status ?? 'agreement'
  const reached = TIMELINE.indexOf(status)
  const at = (i: number) => ago(Math.max(0, created - i * (created / 6)))
  const code = id.slice(-4).toUpperCase()
  return {
    id, code: `TRX-${code}`, title: t.title, role: t.role, counterparty: t.counterparty, status, quantity: t.quantity,
    unitPriceIdr: t.unitPriceIdr, totalIdr: t.unitPriceIdr * t.quantity.value, supplierId: t.supplierId, auctionId: t.auctionId,
    createdAt: ago(created), updatedAt: ago(Math.max(1, created / 3)), dueAt: ahead(10 * DAY),
    timeline: TIMELINE.map((s, i) => ({ status: s, at: i <= reached ? at(i) : undefined })),
    documents: [
      { id: `${id}-po`, kind: 'order', name: `${t.poNumber ?? `PO-${code}`}.pdf`, at: ago(created) },
      { id: `${id}-ag`, kind: 'agreement', name: 'Perjanjian-pengadaan.pdf', at: ago(created) },
      ...(reached >= 1 ? [{ id: `${id}-in`, kind: 'invoice' as const, name: `INV-${code}.pdf`, at: at(1) }] : []),
      ...(reached >= 4 ? [{ id: `${id}-pr`, kind: 'proof' as const, name: 'surat-jalan.jpg', at: at(4) }] : []),
    ],
    payment: { status: reached >= 5 ? 'released' : reached >= 2 ? 'escrow' : 'unpaid', paidAt: reached >= 2 ? at(2) : undefined },
    delivery: { address: t.address, eta: reached >= 3 && reached < 5 ? ahead(2 * DAY) : undefined, proof: reached >= 4 ? 'surat-jalan.jpg' : undefined },
  }
}

const q = (value: number, unit: string) => ({ value, unit })
const party = (name: string, verified = true) => ({ name, kind: 'business' as const, verified })

/** One economy auction per lot so the realtime bots and the public room treat it like any other. */
export function lotAuction(orgName: string, oa: OrgAuction, lot: OrgLot, i: number, opts: { status?: AuctionDetail['status']; startsAt?: string; endsAt?: string } = {}): AuctionDetail {
  const market = economy.markets.find((m) => m.categoryId === oa.categoryId) ?? economy.markets[0]
  const sealed = oa.type === 'sealed'
  const startsAt = opts.startsAt ?? oa.schedule.startsAt ?? new Date().toISOString()
  return {
    id: `${oa.id}-l${i + 1}`, code: `${oa.code}${oa.lots.length > 1 ? `-L${i + 1}` : ''}`,
    title: oa.lots.length > 1 ? `${oa.title} · Lot ${i + 1}: ${lot.item}` : oa.title,
    marketId: market.id, marketName: `${orgName} · ${oa.objective === 'selling' ? 'Penjualan' : 'Procurement'}`, categoryId: oa.categoryId,
    type: oa.type, status: opts.status ?? (new Date(startsAt).getTime() > Date.now() ? 'scheduled' : 'live'),
    visibility: sealed ? 'sealed' : oa.rules.visibility,
    lot: { item: lot.item, quantity: lot.quantity, spec: lot.spec },
    startsAt, endsAt: opts.endsAt ?? new Date(new Date(startsAt).getTime() + oa.schedule.durationMinutes * 60_000).toISOString(),
    participants: 0, bidCount: 0, openingPriceIdr: lot.reservePriceIdr,
    currentPriceIdr: sealed || oa.rules.visibility !== 'full' ? undefined : lot.reservePriceIdr,
    minStepIdr: oa.rules.minStepIdr,
    extension: oa.rules.autoExtension ? { windowMinutes: 2, extendMinutes: 5 } : { windowMinutes: 0, extendMinutes: 0 },
    rules: [
      { label: 'Tipe', value: `${AUCTION_TYPES[oa.type].label} auction${oa.lots.length > 1 ? ` · lot ${i + 1} dari ${oa.lots.length}` : ''}` },
      { label: 'Penyelenggara', value: orgName },
      { label: oa.type === 'forward' ? 'Reserve' : 'Harga target', value: `${formatIdr(lot.reservePriceIdr)} per ${lot.quantity.unit}` },
      ...(oa.rules.minStepIdr ? [{ label: oa.type === 'forward' ? 'Kenaikan minimum' : 'Penurunan minimum', value: formatIdr(oa.rules.minStepIdr) }] : []),
      { label: 'Perpanjangan otomatis', value: oa.rules.autoExtension ? '+5 menit jika ada bid di 2 menit terakhir' : 'Tidak ada' },
      { label: 'Kualifikasi', value: `Rating ≥ ${oa.qualification.minRating}${oa.qualification.documents.length ? `, dokumen: ${oa.qualification.documents.join(', ')}` : ''}${oa.qualification.regions.length ? `, wilayah: ${oa.qualification.regions.join(', ')}` : ''}` },
      { label: 'Penetapan pemenang', value: awardRuleInfo(oa.rules.award, higherWins(oa.type)).label },
    ],
    bids: [],
  }
}

/** Seeded bid history for demo auctions (best last → newest first). */
function seedBids(a: AuctionDetail, n: number, to: number) {
  const lastAt = Math.min(Date.now(), new Date(a.endsAt).getTime()) - 60_000
  const span = lastAt - new Date(a.startsAt).getTime()
  const bids: PublicBid[] = Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n
    return { id: `${a.id}-s${i}`, bidder: `Supplier ${1 + ((i * 7 + 3) % Math.max(3, Math.ceil(n * 0.6)))}`, priceIdr: Math.round(a.openingPriceIdr + (to - a.openingPriceIdr) * t), at: new Date(lastAt - span * (1 - t) * 0.9).toISOString() }
  }).reverse()
  a.bids = a.visibility === 'full' ? bids : []
  a.bidCount = n
  a.participants = new Set(bids.map((b) => b.bidder)).size
  if (a.visibility === 'full') a.currentPriceIdr = to
  economy.bestPrice.set(a.id, to)
}

// ── Seeds ────────────────────────────────────────────────────────

const actorOf = (o: Pick<OrgData, 'members' | 'settings'>, memberId: string) => {
  const m = o.members.find((x) => x.id === memberId)!
  return `${m.name} (${o.settings.roles.find((r) => r.id === m.role)?.label ?? m.role})`
}

function history(items: [item: string, cat: CategoryId, unit: string, price: number, qtyLo: number, qtyHi: number, suppliers: string[]][], prefix: string): HistoryRow[] {
  const rows: HistoryRow[] = []
  let n = 100
  for (let back = 11; back >= 0; back--) {
    for (const [item, categoryId, unit, price, lo, hi, sups] of items) {
      if (rand() < 0.15) continue
      const drift = 1 + (11 - back) * 0.004 + (rand() - 0.5) * 0.05
      const market = Math.round(price * drift)
      const via = rand() < 0.45 ? 'auction' : rand() < 0.5 ? 'collective' : 'direct'
      const paid = Math.round(market * (via === 'direct' ? 0.99 : via === 'collective' ? 0.9 : 0.93 + (rand() - 0.5) * 0.04))
      const opening = Math.round(market * 1.06)
      rows.push({
        code: `${prefix}-${n++}`, month: monthKey(back), item, categoryId, supplierId: sups[Math.floor(rand() * sups.length)],
        quantity: { value: Math.round(lo + rand() * (hi - lo)), unit }, unitPriceIdr: paid, budgetUnitIdr: Math.round(market * 1.04), marketUnitIdr: market, via,
        ...(via === 'auction' ? { bidders: 3 + Math.floor(rand() * 8), openingIdr: opening } : {}),
      })
    }
  }
  return rows
}

function procurement(o: OrgData, p: Omit<ProcurementRequest, 'requiredApprovers' | 'approvals' | 'createdAt' | 'updatedAt' | 'invitedSupplierIds'> & { createdMin: number; approvedBy?: string[]; invitedSupplierIds?: string[] }): ProcurementRequest {
  const required = requiredApprovers(p.budgetIdr, 'procurement', o.settings.approvalRules)
  const done = p.approvedBy ?? (['draft', 'pending_approval', 'rejected'].includes(p.status) ? [] : required)
  const { createdMin, approvedBy: _a, ...rest } = p
  return {
    ...rest, invitedSupplierIds: p.invitedSupplierIds ?? [], requiredApprovers: required, createdAt: ago(createdMin), updatedAt: ago(createdMin / 3),
    approvals: done.map((role, i) => ({ role, by: actorOf(o, o.members.find((m) => m.role === role)!.id), at: ago(createdMin - 60 * (i + 1)), decision: 'approved' as const })),
  }
}

function orgAuction(o: OrgData, a: Omit<OrgAuction, 'valueIdr' | 'requiredApprovers' | 'approvals' | 'createdAt' | 'rules' | 'qualification' | 'invited' | 'schedule' | 'objective' | 'multiLot'> & { createdMin: number; durationMinutes: number; approvedBy?: string[]; rules?: Partial<OrgAuction['rules']> }): OrgAuction {
  const value = auctionValue(a.lots)
  const required = requiredApprovers(value, 'auction', o.settings.approvalRules)
  const done = a.approvedBy ?? (a.status === 'pending_approval' ? [] : required)
  const { createdMin, durationMinutes, approvedBy: _a, rules, ...rest } = a
  return {
    ...rest, objective: 'procurement', multiLot: a.lots.length > 1, valueIdr: value, requiredApprovers: required, createdAt: ago(createdMin),
    rules: { minStepIdr: 10, visibility: 'full', autoExtension: true, withdraw: 'before_last_30', award: 'lowest', weights: DEFAULT_WEIGHTS, ...rules },
    qualification: { documents: ['NIB', 'Sertifikat mutu'], minRating: 4, regions: ['Jawa Barat', 'DKI Jakarta'] }, invited: [],
    schedule: { durationMinutes },
    approvals: done.map((role, i) => ({ role, by: actorOf(o, o.members.find((m) => m.role === role)!.id), at: ago(createdMin - 30 * (i + 1)), decision: 'approved' as const })),
  }
}

function goLiveSeed(o: OrgData, oa: OrgAuction, opts: { status: AuctionDetail['status']; startMin: number; endMin: number; bids: number; to: number[] }) {
  oa.lots.forEach((lot, i) => {
    const a = lotAuction(o.settings.profile.name, oa, lot, i, { status: opts.status, startsAt: ago(-opts.startMin), endsAt: ago(-opts.endMin) })
    seedBids(a, opts.bids + i * 2, opts.to[i])
    lot.auctionId = a.id
    o.economyAuctions.push(a)
  })
}

function seedSkn(): OrgData {
  const o: OrgData = {
    settings: baseSettings('PT Solusi Kemasan Nusantara', 'Manufaktur kemasan karton & fleksibel', 'Bandung, Jawa Barat', ['packaging', 'manufacturing', 'logistics']),
    members: [
      { id: 'mem-ajar', userId: 'usr-ajar', name: 'Ajar Pratama', email: 'ajar@demo.ecopurnity.id', role: 'owner', department: 'Direksi', status: 'active', joinedAt: ago(700 * DAY) },
      { id: 'mem-maya', userId: 'usr-maya', name: 'Maya Sari', email: 'maya@demo.ecopurnity.id', role: 'finance', department: 'Keuangan', status: 'active', joinedAt: ago(540 * DAY) },
      { id: 'mem-bima', userId: 'usr-bima', name: 'Bima Santoso', email: 'bima@demo.ecopurnity.id', role: 'procurement', department: 'Pengadaan', status: 'active', joinedAt: ago(420 * DAY) },
      { id: 'mem-wulan', name: 'Wulan Sari', email: 'wulan@solusikemasan.co.id', role: 'operations', department: 'Operasional', status: 'active', joinedAt: ago(300 * DAY) },
      { id: 'mem-fajar', name: 'Fajar Nugraha', email: 'fajar@solusikemasan.co.id', role: 'sales', department: 'Penjualan', status: 'active', joinedAt: ago(200 * DAY) },
      { id: 'mem-hendra', name: 'hendra@solusikemasan.co.id', email: 'hendra@solusikemasan.co.id', role: 'operations', department: 'Operasional', status: 'invited', joinedAt: ago(2 * DAY) },
    ],
    ownerUserId: 'usr-ajar',
    savingsTargetIdr: 60_000_000,
    inventory: {
      warehouses: [
        { name: 'Gudang Cimahi', location: 'Cimahi, Jawa Barat', capacityM2: 2_400 },
        { name: 'Gudang Rancaekek', location: 'Kab. Bandung, Jawa Barat', capacityM2: 1_100 },
      ],
      items: [
        ['KRF-150', 'Kertas kraft liner 150 gsm', 'packaging', 'Gudang Cimahi', 38, 'ton', 5, 7, 'Kraft liner 150 gsm, RCT ≥ 1,6 kN/m'],
        ['FLT-BC', 'Medium flute BC 125 gsm', 'packaging', 'Gudang Cimahi', 22, 'ton', 5, 7, 'Medium 125 gsm, CMT ≥ 180 N'],
        ['BOX-RSC3', 'Box karton RSC 3 ply (jadi)', 'packaging', 'Gudang Rancaekek', 84_000, 'pcs', 5_000, 5, '40×30×20 cm, cetak 1 warna'],
        ['PCH-250', 'Standing pouch 250 g (jadi)', 'packaging', 'Gudang Rancaekek', 120_000, 'pcs', 10_000, 10, 'Food grade, zipper, 3 warna'],
        ['INK-WB', 'Tinta flexo water-based', 'manufacturing', 'Gudang Cimahi', 640, 'kg', 200, 14, 'Water-based, food-safe'],
        ['GLU-PVAC', 'Lem PVAc industri', 'manufacturing', 'Gudang Cimahi', 1_800, 'kg', 500, 10, 'Viskositas 8.000–12.000 cP'],
        ['PLT-1210', 'Pallet kayu 120×100', 'packaging', 'Gudang Rancaekek', 260, 'pcs', 100, 7, 'Kayu pinus, heat treated ISPM 15'],
      ].map(([sku, name, categoryId, warehouse, qty, unit, moq, lead, spec]) => ({
        id: `inv-${String(sku).toLowerCase()}`, sku: String(sku), name: String(name), categoryId: categoryId as CategoryId, warehouse: String(warehouse),
        quantity: q(Number(qty), String(unit)), moq: Number(moq), leadTimeDays: Number(lead), qualitySpec: String(spec),
      })),
      capacity: [
        { line: 'Corrugator line 1', outputPerMonth: q(1_200_000, 'pcs'), utilization: 0.78 },
        { line: 'Flexo printer 4 warna', outputPerMonth: q(900_000, 'pcs'), utilization: 0.64 },
        { line: 'Pouch making machine', outputPerMonth: q(1_500_000, 'pcs'), utilization: 0.52 },
      ],
      logistics: {
        fleet: [{ type: 'Truk engkel', count: 4, capacity: '2 ton' }, { type: 'Truk CDD', count: 2, capacity: '5 ton' }, { type: 'Pick-up', count: 3, capacity: '800 kg' }],
        regions: ['Jawa Barat', 'DKI Jakarta', 'Banten'],
      },
      schedules: [
        { id: 'sch-1', item: 'Kertas kraft liner 150 gsm', quantity: q(40, 'ton'), every: 'monthly', counterparty: 'PT Kertas Prima Jabar', direction: 'in', nextAt: ahead(9 * DAY) },
        { id: 'sch-2', item: 'Box karton RSC 3 ply', quantity: q(25_000, 'pcs'), every: 'weekly', counterparty: 'Kedai Kopi Senja', direction: 'out', nextAt: ahead(2 * DAY) },
        { id: 'sch-3', item: 'Tinta flexo water-based', quantity: q(400, 'kg'), every: 'monthly', counterparty: 'CV Flexo Warna', direction: 'in', nextAt: ahead(16 * DAY) },
      ],
    },
    procurements: [], auctions: [], economyAuctions: [],
    suppliers: {
      'sup-kertas-prima': { relation: 'verified', myRating: 5 }, 'sup-flexo-warna': { relation: 'verified', myRating: 4 },
      'sup-lem-nusantara': { relation: 'verified', myRating: 4 }, 'sup-polimer-jaya': { relation: 'shortlisted' },
      'sup-kemas-prima': { relation: 'invited' }, 'sup-pallet-indo': { relation: 'blocked', myRating: 2 },
      'sup-logistik-andalan': { relation: 'verified', myRating: 4 },
    },
    transactions: [],
    history: [],
    activity: [],
  }
  const p = o.settings.profile
  Object.assign(p, {
    legal: { nib: '9120004417263', npwp: '02.417.556.8-421.000', akta: 'No. 14, 12 Maret 2019, Notaris R. Siregar, S.H.' },
    description: 'Produsen box karton corrugated dan kemasan fleksibel untuk UMKM makanan dan e-commerce di Jawa Barat. Kapasitas 1,2 juta box per bulan.',
    hours: { days: [0, 1, 2, 3, 4, 5], from: '07:30', to: '16:30' },
    documents: [{ name: 'NIB-SKN.pdf', kind: 'nib', uploadedAt: ago(200 * DAY) }, { name: 'NPWP-SKN.pdf', kind: 'npwp', uploadedAt: ago(200 * DAY) }, { name: 'Akta-pendirian.pdf', kind: 'akta', uploadedAt: ago(200 * DAY) }],
    verification: 'verified',
  })
  o.history = history([
    ['Kertas kraft liner 150 gsm', 'packaging', 'ton', 11_800_000, 30, 50, ['sup-kertas-prima']],
    ['Tinta flexo water-based', 'manufacturing', 'kg', 48_000, 1_500, 2_500, ['sup-flexo-warna']],
    ['Lem PVAc industri', 'manufacturing', 'kg', 7_200, 4_000, 7_000, ['sup-lem-nusantara', 'sup-polimer-jaya']],
    ['Pallet kayu 120×100', 'packaging', 'pcs', 86_000, 250, 450, ['sup-pallet-indo', 'sup-kertas-prima']],
    ['Jasa angkut truk CDD', 'logistics', 'trip', 1_550_000, 20, 40, ['sup-logistik-andalan']],
  ], 'HST')

  const P = (x: Parameters<typeof procurement>[1]) => o.procurements.push(procurement(o, x))
  P({ id: 'prq-1041', code: 'PRQ-1041', need: 'Kertas kraft liner 150 gsm', categoryId: 'packaging', quantity: q(40, 'ton'), budgetIdr: 480_000_000, deadline: ahead(20 * DAY), spec: 'Kraft liner 150 gsm, RCT ≥ 1,6 kN/m, roll 125 cm', deliveryLocation: 'Gudang Cimahi', visibility: 'public', status: 'pending_approval', createdBy: 'Bima Santoso (Procurement)', createdMin: 2 * DAY, approvedBy: ['finance'] })
  P({ id: 'prq-1042', code: 'PRQ-1042', need: 'Tinta flexo water-based 4 warna', categoryId: 'manufacturing', quantity: q(2_000, 'kg'), budgetIdr: 96_000_000, deadline: ahead(25 * DAY), spec: 'CMYK, food-safe, viskositas 25–30 s (Zahn #2)', deliveryLocation: 'Gudang Cimahi', visibility: 'invite', invitedSupplierIds: ['sup-flexo-warna', 'sup-polimer-jaya'], status: 'pending_approval', createdBy: 'Bima Santoso (Procurement)', createdMin: 6 * 60 })
  P({ id: 'prq-1044', code: 'PRQ-1044', need: 'Stretch film 23 mikron', categoryId: 'packaging', quantity: q(1_200, 'roll'), budgetIdr: 38_000_000, deadline: ahead(30 * DAY), spec: 'Lebar 50 cm, 300 m/roll', deliveryLocation: 'Gudang Rancaekek', visibility: 'public', status: 'draft', createdBy: 'Wulan Sari (Operations)', createdMin: 90 })
  P({ id: 'prq-1038', code: 'PRQ-1038', need: 'Lem PVAc industri', categoryId: 'manufacturing', quantity: q(6_000, 'kg'), budgetIdr: 42_000_000, deadline: ahead(12 * DAY), spec: 'Viskositas 8.000–12.000 cP, drum 200 kg', deliveryLocation: 'Gudang Cimahi', visibility: 'public', status: 'published', createdBy: 'Bima Santoso (Procurement)', createdMin: 4 * DAY })
  P({ id: 'prq-1035', code: 'PRQ-1035', need: 'Box karton RSC 3 ply', categoryId: 'packaging', quantity: q(60_000, 'pcs'), budgetIdr: 138_000_000, deadline: ahead(14 * DAY), spec: '40×30×20 cm, flute BC, cetak 1 warna', deliveryLocation: 'Gudang Rancaekek', visibility: 'public', status: 'in_auction', auctionId: 'oau-1201', createdBy: 'Bima Santoso (Procurement)', createdMin: 5 * DAY })
  P({ id: 'prq-1036', code: 'PRQ-1036', need: 'Biji plastik HDPE & LDPE', categoryId: 'manufacturing', quantity: q(30, 'ton'), budgetIdr: 640_000_000, deadline: ahead(10 * DAY), spec: 'HDPE blow grade MFI 0,3; LDPE film grade MFI 2', deliveryLocation: 'Gudang Cimahi', visibility: 'invite', invitedSupplierIds: ['sup-polimer-jaya', 'sup-kemas-prima'], status: 'in_auction', auctionId: 'oau-1198', createdBy: 'Bima Santoso (Procurement)', createdMin: 9 * DAY })
  P({ id: 'prq-1031', code: 'PRQ-1031', need: 'Plastik PE film 60 mikron', categoryId: 'packaging', quantity: q(8, 'ton'), budgetIdr: 260_000_000, deadline: ahead(4 * DAY), spec: 'LDPE film 60 mikron, lebar 100 cm', deliveryLocation: 'Gudang Rancaekek', visibility: 'public', status: 'awarded', auctionId: 'oau-1190', createdBy: 'Bima Santoso (Procurement)', createdMin: 15 * DAY })
  P({ id: 'prq-1027', code: 'PRQ-1027', need: 'Pallet kayu 120×100', categoryId: 'packaging', quantity: q(400, 'pcs'), budgetIdr: 36_000_000, deadline: ago(3 * DAY), spec: 'Heat treated ISPM 15', deliveryLocation: 'Gudang Rancaekek', visibility: 'public', status: 'po_issued', createdBy: 'Wulan Sari (Operations)', createdMin: 21 * DAY })
  P({ id: 'prq-1029', code: 'PRQ-1029', need: 'Standing pouch 250 g food grade', categoryId: 'packaging', quantity: q(60_000, 'unit'), budgetIdr: 108_000_000, deadline: ahead(18 * DAY), spec: 'Food grade, zipper, 3 warna', deliveryLocation: 'Gudang Rancaekek', visibility: 'aggregate', status: 'in_collective', poolId: 'pool-pouch-bdg', createdBy: 'Bima Santoso (Procurement)', createdMin: 7 * DAY })
  P({ id: 'prq-1020', code: 'PRQ-1020', need: 'Solar industri', categoryId: 'energy', quantity: q(12_000, 'liter'), budgetIdr: 190_000_000, deadline: ago(10 * DAY), spec: 'B35, kirim bertahap', deliveryLocation: 'Gudang Cimahi', visibility: 'private', status: 'rejected', createdBy: 'Wulan Sari (Operations)', createdMin: 30 * DAY })
  o.procurements.find((r) => r.id === 'prq-1020')!.approvals = [{ role: 'finance', by: 'Maya Sari (Finance)', at: ago(29 * DAY), decision: 'rejected', note: 'Pakai kontrak solar tahunan yang sudah ada.' }]

  // Auctions: one live, one closed awaiting evaluation (2 lots), one awarded, one pending approval.
  const A = (x: Parameters<typeof orgAuction>[1]) => {
    const a = orgAuction(o, x)
    o.auctions.push(a)
    return a
  }
  const live = A({ id: 'oau-1201', code: 'OAU-1201', title: 'Box karton RSC 3 ply 60.000 pcs', categoryId: 'packaging', type: 'reverse', status: 'live', procurementId: 'prq-1035', createdBy: 'Bima Santoso (Procurement)', createdMin: 4 * DAY, durationMinutes: 4 * DAY,
    lots: [{ id: 'lot-1', item: 'Box karton RSC 3 ply', quantity: q(60_000, 'pcs'), spec: '40×30×20 cm, flute BC, cetak 1 warna', reservePriceIdr: 2_300 }] })
  goLiveSeed(o, live, { status: 'live', startMin: -DAY, endMin: 180, bids: 14, to: [2_120] })
  const closed = A({ id: 'oau-1198', code: 'OAU-1198', title: 'Biji plastik HDPE & LDPE', categoryId: 'manufacturing', type: 'reverse', status: 'live', procurementId: 'prq-1036', createdBy: 'Bima Santoso (Procurement)', createdMin: 8 * DAY, durationMinutes: 2 * DAY,
    rules: { award: 'split', minStepIdr: 50 },
    lots: [
      { id: 'lot-1', item: 'HDPE blow grade', quantity: q(18_000, 'kg'), spec: 'MFI 0,3 g/10 min', reservePriceIdr: 21_500 },
      { id: 'lot-2', item: 'LDPE film grade', quantity: q(12_000, 'kg'), spec: 'MFI 2 g/10 min', reservePriceIdr: 22_800 },
    ] })
  goLiveSeed(o, closed, { status: 'closed', startMin: -3 * DAY, endMin: -6 * 60, bids: 10, to: [20_150, 21_300] })
  const awarded = A({ id: 'oau-1190', code: 'OAU-1190', title: 'Plastik PE film 60 mikron 8 ton', categoryId: 'packaging', type: 'reverse', status: 'live', procurementId: 'prq-1031', createdBy: 'Bima Santoso (Procurement)', createdMin: 14 * DAY, durationMinutes: DAY,
    lots: [{ id: 'lot-1', item: 'LDPE film 60 mikron', quantity: q(8_000, 'kg'), spec: 'Lebar 100 cm', reservePriceIdr: 32_000 }] })
  goLiveSeed(o, awarded, { status: 'awarded', startMin: -12 * DAY, endMin: -11 * DAY, bids: 9, to: [29_400] })
  awarded.award = { lines: [[{ offerId: 'oau-1190-l1-Supplier 4', supplier: 'PT Polimer Jaya', quantity: 8_000, priceIdr: 29_400 }]], reason: 'Harga terendah dan supplier terverifikasi dengan skor kualitas 87.', at: ago(10 * DAY), by: 'Ajar Pratama (Owner)' }
  A({ id: 'oau-1204', code: 'OAU-1204', title: 'Jasa angkut Bandung–Jakarta 40 trip', categoryId: 'logistics', type: 'reverse', status: 'pending_approval', createdBy: 'Bima Santoso (Procurement)', createdMin: 5 * 60, durationMinutes: DAY, approvedBy: ['finance'],
    lots: [{ id: 'lot-1', item: 'Trip truk CDD Bandung–Jakarta', quantity: q(40, 'trip'), spec: 'CDD 5 ton, GPS, asuransi muatan', reservePriceIdr: 1_600_000 }] })
  // Selling surplus stock above Rp 200 jt: the owner signed; Finance (Maya) and Procurement (Bima) still have to.
  A({ id: 'oau-1206', code: 'OAU-1206', title: 'Jual stok box karton RSC 84.000 pcs', categoryId: 'packaging', type: 'forward', status: 'pending_approval', createdBy: 'Ajar Pratama (Owner)', createdMin: 3 * 60, durationMinutes: DAY, approvedBy: ['owner'],
    rules: { award: 'split' },
    lots: [{ id: 'lot-1', item: 'Box karton RSC 3 ply', quantity: q(84_000, 'pcs'), spec: '40×30×20 cm, cetak 1 warna', reservePriceIdr: 2_450 }] }).objective = 'selling'

  o.transactions = [
    makeTx({ title: 'Pallet kayu 120×100 · 400 pcs', role: 'buyer', counterparty: party('PT Kertas Prima Jabar'), supplierId: 'sup-kertas-prima', quantity: q(400, 'pcs'), unitPriceIdr: 84_500, status: 'delivered', createdMin: 6 * DAY, poNumber: 'PO-SKN-0417', address: 'Gudang Rancaekek' }),
    makeTx({ title: 'Kertas kraft liner · 36 ton', role: 'buyer', counterparty: party('PT Kertas Prima Jabar'), supplierId: 'sup-kertas-prima', quantity: q(36, 'ton'), unitPriceIdr: 11_650_000, status: 'completed', createdMin: 25 * DAY, poNumber: 'PO-SKN-0402', address: 'Gudang Cimahi' }),
    makeTx({ title: 'Tinta flexo · 1.800 kg', role: 'buyer', counterparty: party('CV Flexo Warna'), supplierId: 'sup-flexo-warna', quantity: q(1_800, 'kg'), unitPriceIdr: 47_200, status: 'invoiced', createdMin: 3 * DAY, poNumber: 'PO-SKN-0421', address: 'Gudang Cimahi' }),
    makeTx({ title: 'Jasa angkut CDD · 28 trip', role: 'buyer', counterparty: party('PT Logistik Andalan'), supplierId: 'sup-logistik-andalan', quantity: q(28, 'trip'), unitPriceIdr: 1_520_000, status: 'paid', createdMin: 2 * DAY, poNumber: 'PO-SKN-0423', address: 'Gudang Rancaekek' }),
    makeTx({ title: 'Box karton RSC · 25.000 pcs', role: 'supplier', counterparty: party('Kedai Kopi Senja'), quantity: q(25_000, 'pcs'), unitPriceIdr: 2_450, status: 'fulfilling', createdMin: 4 * DAY, poNumber: 'PO-KKS-0088', address: 'Kedai Kopi Senja, Jakarta Selatan' }),
    makeTx({ title: 'Lem PVAc · 5.000 kg', role: 'buyer', counterparty: party('PT Lem Nusantara'), supplierId: 'sup-lem-nusantara', quantity: q(5_000, 'kg'), unitPriceIdr: 7_050, status: 'completed', createdMin: 40 * DAY, poNumber: 'PO-SKN-0388', address: 'Gudang Cimahi' }),
  ]

  o.activity = [
    ['mem-bima', 'Ajukan procurement', 'procurement', 'prq-1042', 'PRQ-1042 Tinta flexo', 6 * 60],
    ['mem-maya', 'Approve procurement (Finance)', 'procurement', 'prq-1041', 'PRQ-1041 Kertas kraft', DAY],
    ['mem-bima', 'Buka auction', 'auction', 'oau-1201', 'OAU-1201 Box karton', 4 * DAY],
    ['mem-wulan', 'Konfirmasi barang diterima', 'transaction', 'po-0417', 'PO-SKN-0417 Pallet kayu', 2 * DAY],
    ['mem-ajar', 'Award auction', 'auction', 'oau-1190', 'OAU-1190 Plastik PE film', 10 * DAY],
    ['mem-maya', 'Bayar ke escrow', 'transaction', 'po-0423', 'PO-SKN-0423 Jasa angkut', 2 * DAY - 120],
  ].map(([m, action, type, id, label, min], i) => ({
    id: `aud-seed-skn-${i}`, actor: actorOf(o, String(m)), action: String(action), entity: { type: type as AuditEntry['entity']['type'], id: String(id), label: String(label) }, at: ago(Number(min)),
  })).sort((a, b) => b.at.localeCompare(a.at))
  return o
}

function seedKkj(): OrgData {
  const o: OrgData = {
    settings: baseSettings('Koperasi Kopi Jabar', 'Koperasi petani kopi arabika', 'Garut, Jawa Barat', ['agri', 'packaging', 'logistics']),
    members: [
      { id: 'mem-ujang', name: 'Ujang Saepudin', email: 'ujang@kopijabar.id', role: 'owner', department: 'Pengurus', status: 'active', joinedAt: ago(900 * DAY) },
      { id: 'mem-dimas', userId: 'usr-dimas', name: 'Dimas Haryanto', email: 'dimas@demo.ecopurnity.id', role: 'procurement', department: 'Pengadaan', status: 'active', joinedAt: ago(400 * DAY) },
      { id: 'mem-neneng', name: 'Neneng Rohmah', email: 'neneng@kopijabar.id', role: 'finance', department: 'Keuangan', status: 'active', joinedAt: ago(380 * DAY) },
      { id: 'mem-asep', name: 'Asep Kurnia', email: 'asep@kopijabar.id', role: 'operations', department: 'Gudang', status: 'active', joinedAt: ago(250 * DAY) },
    ],
    ownerUserId: 'usr-dimas',
    savingsTargetIdr: 15_000_000,
    inventory: {
      warehouses: [{ name: 'Gudang Cikajang', location: 'Garut, Jawa Barat', capacityM2: 600 }],
      items: [
        { id: 'inv-gb1', sku: 'GB-ARB-G1', name: 'Green bean arabika grade 1', categoryId: 'agri', warehouse: 'Gudang Cikajang', quantity: q(14_000, 'kg'), moq: 500, leadTimeDays: 3, qualitySpec: 'Kadar air ≤ 12,5%, defect ≤ 5' },
        { id: 'inv-gb2', sku: 'GB-ARB-G2', name: 'Green bean arabika grade 2', categoryId: 'agri', warehouse: 'Gudang Cikajang', quantity: q(9_500, 'kg'), moq: 500, leadTimeDays: 3, qualitySpec: 'Natural process' },
        { id: 'inv-goni', sku: 'KRG-60', name: 'Karung goni 60 kg', categoryId: 'packaging', warehouse: 'Gudang Cikajang', quantity: q(420, 'pcs'), moq: 500, leadTimeDays: 10, qualitySpec: 'Jute, 60×100 cm' },
      ],
      capacity: [{ line: 'Huller & sortasi', outputPerMonth: q(40_000, 'kg'), utilization: 0.7 }],
      logistics: { fleet: [{ type: 'Truk engkel', count: 2, capacity: '2 ton' }], regions: ['Jawa Barat', 'DKI Jakarta'] },
      schedules: [{ id: 'sch-k1', item: 'Pupuk organik granul', quantity: q(20_000, 'kg'), every: 'monthly', counterparty: 'Koperasi Mitra Tani', direction: 'in', nextAt: ahead(6 * DAY) }],
    },
    procurements: [], auctions: [], economyAuctions: [],
    suppliers: { 'sup-mitra-tani': { relation: 'verified', myRating: 5 }, 'sup-karung-sejahtera': { relation: 'shortlisted' }, 'sup-makmur-jaya': { relation: 'verified', myRating: 3 } },
    transactions: [],
    history: [],
    activity: [],
  }
  Object.assign(o.settings.profile, {
    legal: { nib: '8120117763012', npwp: '03.552.118.4-443.000', akta: 'Badan Hukum Koperasi No. 211/BH/2016' },
    description: 'Koperasi 340 petani kopi arabika di dataran tinggi Garut. Menjual green bean ke roastery dan kafe Jabodetabek.',
    documents: [{ name: 'NIB-KKJ.pdf', kind: 'nib', uploadedAt: ago(100 * DAY) }], verification: 'pending',
  })
  o.history = history([
    ['Karung goni 60 kg', 'packaging', 'pcs', 9_000, 800, 2_000, ['sup-makmur-jaya', 'sup-karung-sejahtera']],
    ['Pupuk organik granul', 'agri', 'kg', 2_400, 15_000, 35_000, ['sup-mitra-tani']],
    ['Valve bag kopi 1 kg', 'packaging', 'pcs', 3_200, 4_000, 9_000, ['sup-kemas-prima']],
    ['Jasa angkut Garut–Jakarta', 'logistics', 'trip', 1_250_000, 8, 18, ['sup-logistik-andalan']],
  ], 'HKJ')
  const P = (x: Parameters<typeof procurement>[1]) => o.procurements.push(procurement(o, x))
  P({ id: 'prq-k210', code: 'PRQ-K210', need: 'Pupuk organik granul', categoryId: 'agri', quantity: q(30_000, 'kg'), budgetIdr: 72_000_000, deadline: ahead(15 * DAY), spec: 'C-organik ≥ 15%, SNI 7763', deliveryLocation: 'Gudang Cikajang', visibility: 'aggregate', status: 'pending_approval', createdBy: 'Dimas Haryanto (Procurement)', createdMin: 3 * 60, approvedBy: ['finance'] })
  P({ id: 'prq-k208', code: 'PRQ-K208', need: 'Karung goni 60 kg', categoryId: 'packaging', quantity: q(3_000, 'pcs'), budgetIdr: 27_000_000, deadline: ahead(9 * DAY), spec: 'Jute, 60×100 cm', deliveryLocation: 'Gudang Cikajang', visibility: 'public', status: 'in_auction', auctionId: 'oau-k301', createdBy: 'Dimas Haryanto (Procurement)', createdMin: 2 * DAY })
  P({ id: 'prq-k205', code: 'PRQ-K205', need: 'Valve bag kopi 1 kg', categoryId: 'packaging', quantity: q(8_000, 'pcs'), budgetIdr: 26_000_000, deadline: ahead(20 * DAY), spec: 'Aluminium foil, one-way valve', deliveryLocation: 'Gudang Cikajang', visibility: 'public', status: 'published', createdBy: 'Dimas Haryanto (Procurement)', createdMin: 4 * DAY })
  P({ id: 'prq-k211', code: 'PRQ-K211', need: 'Servis mesin huller', categoryId: 'manufacturing', quantity: q(2, 'unit'), budgetIdr: 9_000_000, deadline: ahead(12 * DAY), spec: 'Ganti bearing dan saringan', deliveryLocation: 'Gudang Cikajang', visibility: 'invite', invitedSupplierIds: ['sup-roasting'], status: 'draft', createdBy: 'Asep Kurnia (Operations)', createdMin: 60 })
  const live = orgAuction(o, { id: 'oau-k301', code: 'OAU-K301', title: 'Karung goni 60 kg 3.000 pcs', categoryId: 'packaging', type: 'reverse', status: 'live', procurementId: 'prq-k208', createdBy: 'Dimas Haryanto (Procurement)', createdMin: 2 * DAY, durationMinutes: 3 * DAY,
    lots: [{ id: 'lot-1', item: 'Karung goni 60 kg', quantity: q(3_000, 'pcs'), spec: 'Jute, 60×100 cm', reservePriceIdr: 9_000 }] })
  o.auctions.push(live)
  goLiveSeed(o, live, { status: 'live', startMin: -DAY, endMin: 8 * 60, bids: 8, to: [8_450] })
  o.transactions = [
    makeTx({ title: 'Pupuk organik · 20.000 kg', role: 'buyer', counterparty: party('Koperasi Mitra Tani'), supplierId: 'sup-mitra-tani', quantity: q(20_000, 'kg'), unitPriceIdr: 2_330, status: 'fulfilling', createdMin: 5 * DAY, poNumber: 'PO-KKJ-0131', address: 'Gudang Cikajang' }),
    makeTx({ title: 'Karung goni · 1.500 pcs', role: 'buyer', counterparty: party('UD Makmur Jaya', false), supplierId: 'sup-makmur-jaya', quantity: q(1_500, 'pcs'), unitPriceIdr: 8_700, status: 'completed', createdMin: 28 * DAY, poNumber: 'PO-KKJ-0122', address: 'Gudang Cikajang' }),
    makeTx({ title: 'Green bean grade 1 · 2.000 kg', role: 'supplier', counterparty: party('Kedai Kopi Senja'), quantity: q(2_000, 'kg'), unitPriceIdr: 92_000, status: 'invoiced', createdMin: DAY, poNumber: 'PO-KKS-0091', address: 'Kedai Kopi Senja, Jakarta Selatan' }),
  ]
  o.activity = [
    { id: 'aud-seed-kkj-0', actor: 'Neneng Rohmah (Finance)', action: 'Approve procurement (Finance)', entity: { type: 'procurement', id: 'prq-k210', label: 'PRQ-K210 Pupuk organik' }, at: ago(60) },
    { id: 'aud-seed-kkj-1', actor: 'Dimas Haryanto (Procurement)', action: 'Buka auction', entity: { type: 'auction', id: 'oau-k301', label: 'OAU-K301 Karung goni' }, at: ago(DAY) },
  ]
  return o
}

/** A freshly onboarded org: profile from the membership, everything else empty. */
function seedBlank(orgId: string): OrgData {
  const user = db.users.find((u) => u.orgs.some((m) => m.orgId === orgId))
  const m = user?.orgs.find((x) => x.orgId === orgId)
  return {
    settings: baseSettings(m?.orgName ?? 'Bisnis baru', '', user?.location ?? '', []),
    members: user ? [{ id: `mem-${user.id}`, userId: user.id, name: user.name, email: user.email, role: m?.role ?? 'owner', department: 'Direksi', status: 'active', joinedAt: new Date().toISOString() }] : [],
    ownerUserId: user?.id ?? '', savingsTargetIdr: 10_000_000,
    inventory: { items: [], warehouses: [], capacity: [], logistics: { fleet: [], regions: [] }, schedules: [] },
    procurements: [], auctions: [], economyAuctions: [], suppliers: {}, transactions: [], history: [], activity: [],
  }
}

const pool = (p: Omit<StoredPool, 'status'> & { status?: StoredPool['status'] }): StoredPool => ({ status: 'open', ...p })
const others = (rows: [string, number, boolean][]) => rows.map(([name, quantity, optIn]) => ({ name, quantity, optIn }))

function seedPools(): StoredPool[] {
  return [
    pool({ id: 'pool-pouch-bdg', title: 'Standing pouch 250 g food grade', categoryId: 'packaging', spec: 'Food grade, zipper, 3 warna', region: 'Jawa Barat', deadline: ahead(18 * DAY), unit: 'unit', baseUnitPriceIdr: 1_850, refQty: 50_000, thresholdQty: 500_000,
      members: [{ name: 'PT Solusi Kemasan Nusantara', quantity: 60_000, optIn: true, orgId: 'org-skn' }, ...others([['CV Sumber Pangan', 120_000, true], ['PT Rasa Nusantara', 90_000, false], ['Kedai Kopi Senja', 40_000, true], ['Toko Berkah', 25_000, false], ['UD Makmur Jaya', 70_000, false], ['PT Kemas Prima', 85_000, true]])] }),
    pool({ id: 'pool-kraft-jabar', title: 'Kertas kraft liner 125–150 gsm', categoryId: 'packaging', spec: 'Roll 125 cm, RCT ≥ 1,5 kN/m', region: 'Jawa Barat', deadline: ahead(25 * DAY), unit: 'ton', baseUnitPriceIdr: 11_900_000, refQty: 40, thresholdQty: 400,
      members: others([['PT Karton Priangan', 120, false], ['CV Box Mandiri', 60, true], ['PT Kemas Prima', 90, true]]) }),
    pool({ id: 'pool-karton-jkt', title: 'Box karton e-commerce standar', categoryId: 'packaging', spec: '3 ukuran standar, cetak 1 warna', region: 'DKI Jakarta', deadline: ahead(12 * DAY), unit: 'pcs', baseUnitPriceIdr: 2_400, refQty: 20_000, thresholdQty: 300_000,
      members: others([['Asosiasi Seller Online Jakarta', 180_000, true], ['Toko Berkah', 30_000, false], ['PT Rasa Nusantara', 45_000, false]]) }),
    pool({ id: 'pool-pupuk-jabar', title: 'Pupuk organik granul', categoryId: 'agri', spec: 'C-organik ≥ 15%, SNI 7763', region: 'Jawa Barat', deadline: ahead(15 * DAY), unit: 'kg', baseUnitPriceIdr: 2_450, refQty: 20_000, thresholdQty: 400_000,
      members: [{ name: 'Koperasi Kopi Jabar', quantity: 30_000, optIn: true, orgId: 'org-kkj' }, ...others([['Gapoktan Sumber Rejeki', 160_000, true], ['Koperasi Tani Karawang', 140_000, false], ['Kelompok Tani Cisurupan', 45_000, false], ['Koperasi Mitra Tani', 60_000, true]])] }),
    pool({ id: 'pool-goni-jabar', title: 'Karung goni 60 kg', categoryId: 'packaging', spec: 'Jute, 60×100 cm', region: 'Jawa Barat', deadline: ahead(20 * DAY), unit: 'pcs', baseUnitPriceIdr: 9_000, refQty: 2_000, thresholdQty: 30_000,
      members: others([['Koperasi Tani Karawang', 8_000, true], ['Kelompok Tani Cisurupan', 3_000, false]]) }),
    pool({ id: 'pool-angkut-jkt', title: 'Truk CDD Bandung–Jakarta', categoryId: 'logistics', spec: 'CDD 5 ton, GPS', region: 'Jawa Barat', deadline: ahead(10 * DAY), unit: 'trip', baseUnitPriceIdr: 1_600_000, refQty: 20, thresholdQty: 200,
      members: others([['PT Karton Priangan', 60, false], ['CV Sumber Pangan', 40, true], ['PT Rasa Nusantara', 70, false]]) }),
  ]
}

// ── Store ────────────────────────────────────────────────────────

const store: Store = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null
    if (s?.v === 2) return s
  } catch {
    // corrupt: reseed
  }
  return { v: 2, orgs: {}, pools: [] }
})()

export function saveOrg() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // per-tab only
  }
}

if (!store.pools.length) store.pools = seedPools()
if (!store.orgs['org-skn']) store.orgs['org-skn'] = seedSkn()
if (!store.orgs['org-kkj']) store.orgs['org-kkj'] = seedKkj()
saveOrg()

// Put live lots back into the public economy so bots bid on them and the auction room shows them.
for (const o of Object.values(store.orgs)) {
  for (const a of o.economyAuctions) {
    if (!economy.auctions.some((x) => x.id === a.id)) economy.auctions.unshift(a)
    economy.owners.set(a.id, o.ownerUserId)
    if (!economy.bestPrice.has(a.id)) economy.bestPrice.set(a.id, a.currentPriceIdr ?? a.openingPriceIdr)
  }
}

/** Org evaluate page for an economy lot id (`<orgAuctionId>-l<n>`), or undefined for non-org auctions. */
export function orgEvaluateHref(economyAuctionId: string) {
  for (const [orgId, o] of Object.entries(store.orgs)) {
    if (o.economyAuctions.some((a) => a.id === economyAuctionId)) return `/org/${orgId}/auctions/${economyAuctionId.replace(/-l\d+$/, '')}/evaluate`
  }
  return undefined
}

export function org(orgId: string): OrgData {
  if (!store.orgs[orgId]) {
    store.orgs[orgId] = seedBlank(orgId)
    saveOrg()
  }
  return store.orgs[orgId]
}

export const pools = () => store.pools

/** Writes the shared audit log (PRD §12.6) and keeps a copy for the org's activity feed. */
export function orgAudit(o: OrgData, entry: Omit<AuditEntry, 'id' | 'at'>) {
  o.activity.unshift(audit(entry))
  o.activity.length = Math.min(o.activity.length, 200)
  saveOrg()
}
