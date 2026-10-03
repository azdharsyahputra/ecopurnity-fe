import type {
  AppNotification, AuctionDetail, CategoryId, DemandListing, Identity, Listing, NotificationPrefs, NotificationType, OnboardingInput, PartyRef,
  SupplyListing, TransactionDetail,
} from '@/domain/types'
import type { BidStatus, QualificationStatus } from '@/domain/status'
import { publish } from '@/lib/realtime'
import { db } from './db'

// Per-user mock data for the personal workspace (PRD §8). Persisted so flows survive reloads.
// ponytail: one JSON blob in localStorage; fine for a handful of demo users.

export interface StoredListing {
  listing: Listing
  history: { at: string; status: string; note: string }[]
}

export interface StoredBid {
  priceIdr: number
  /** Stated capacity (reverse/sealed), lot unit; undefined = the whole lot. */
  quantity?: number
  status: BidStatus
  submittedAt: string
  updatedAt: string
}

export interface PersonalData {
  identity: Identity
  listings: StoredListing[]
  opportunities: Record<string, { relation: 'following' | 'joined'; contribution?: { kind: 'supply' | 'demand'; listingId: string; quantity: { value: number; unit: string } } }>
  markets: Record<string, { joined: boolean; watchPriceIdr?: number }>
  qualifications: Record<string, QualificationStatus>
  bids: Record<string, StoredBid>
  /** Auctions this user created as a buyer; re-injected into the economy on load. */
  ownedAuctions: AuctionDetail[]
  transactions: TransactionDetail[]
  notifications: AppNotification[]
  prefs: NotificationPrefs
}

const KEY = 'ecp-mock-personal'
const store: Record<string, PersonalData> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()

export function savePersonal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // per-tab only
  }
}

const now = () => new Date().toISOString()
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

export const NOTIFICATION_TYPES: NotificationType[] = [
  'opportunity_detected', 'new_market', 'auction_invitation', 'outbid', 'winning_bid', 'auction_ending',
  'transaction_update', 'payment', 'delivery', 'reputation_update',
]

const defaultPrefs = (): NotificationPrefs =>
  Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { inApp: true, email: ['outbid', 'winning_bid', 'payment', 'transaction_update'].includes(t) }])) as NotificationPrefs

export function completeness(i: Identity) {
  const checks = [
    !!i.profile.bio, !!i.profile.location, i.profile.verification.email,
    i.profile.verification.identity === 'verified', i.items.some((x) => x.kind === 'skill' || x.kind === 'capacity'),
    i.items.some((x) => x.kind === 'asset' || x.kind === 'resource'), i.preferences.categories.length > 0, i.availability.days.length > 0,
  ]
  return checks.filter(Boolean).length / checks.length
}

function listing<L extends Listing>(l: L, note = 'Dibuat'): StoredListing {
  return { listing: l, history: [{ at: l.createdAt, status: l.status, note }] }
}

const party = (name: string, kind: PartyRef['kind'] = 'business', verified = true): PartyRef => ({ name, kind, verified })

function txn(
  id: string, title: string, role: 'buyer' | 'supplier', counterparty: PartyRef, status: TransactionDetail['status'],
  qty: number, unit: string, unitPriceIdr: number, createdMin: number,
): TransactionDetail {
  const order = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'completed'] as const
  const reached = order.indexOf(status as (typeof order)[number])
  return {
    id, code: `TRX-${id.slice(-4).toUpperCase()}`, title, role, counterparty, status,
    quantity: { value: qty, unit }, unitPriceIdr, totalIdr: qty * unitPriceIdr,
    createdAt: ago(createdMin), updatedAt: ago(Math.max(5, createdMin / 3)), dueAt: ahead(7 * 1440),
    timeline: order.map((s, i) => ({ status: s, at: i <= reached ? ago(createdMin - i * (createdMin / 6)) : undefined })),
    documents: [
      { id: `${id}-o`, kind: 'order', name: `PO-${id.slice(-4).toUpperCase()}.pdf`, at: ago(createdMin) },
      { id: `${id}-a`, kind: 'agreement', name: 'Perjanjian-jual-beli.pdf', at: ago(createdMin - 10) },
      ...(reached >= 1 ? [{ id: `${id}-i`, kind: 'invoice' as const, name: `INV-${id.slice(-4).toUpperCase()}.pdf`, at: ago(createdMin - 60) }] : []),
      ...(reached >= 4 ? [{ id: `${id}-p`, kind: 'proof' as const, name: 'bukti-terima.jpg', at: ago(createdMin / 4) }] : []),
    ],
    payment: { status: reached >= 5 ? 'released' : reached >= 2 ? 'escrow' : 'unpaid', paidAt: reached >= 2 ? ago(createdMin / 2) : undefined },
    delivery: { address: 'Gudang mitra, Jawa Barat', eta: reached >= 3 && reached < 5 ? ahead(2 * 1440) : undefined, proof: reached >= 4 ? 'bukti-terima.jpg' : undefined },
  }
}

/** Demo accounts get a lived-in workspace; new accounts start from their onboarding answers. */
function seed(userId: string): PersonalData {
  const user = db.users.find((u) => u.id === userId)
  const demo = !userId.startsWith('usr-new-')
  const base: PersonalData = {
    identity: {
      profile: {
        name: user?.name ?? '', username: user?.username ?? '', location: user?.location ?? '', bio: '',
        verification: { email: !!user?.emailVerified, identity: 'none' },
      },
      items: [],
      availability: { days: [0, 1, 2, 3, 4], from: '08:00', to: '17:00' },
      preferences: { locations: user?.location ? [user.location] : [], categories: [], deliveryRadiusKm: 25 },
      completeness: 0,
    },
    listings: [], opportunities: {}, markets: {}, qualifications: {}, bids: {}, ownedAuctions: [], transactions: [],
    notifications: [
      { id: newId('ntf'), type: 'opportunity_detected', title: 'Selamat datang di Ecopurnity', body: 'Lengkapi identitas ekonomi supaya engine bisa mencarikan opportunity untukmu.', href: '/app/identity', at: now(), read: false },
    ],
    prefs: defaultPrefs(),
  }
  if (!demo) return base

  base.identity.profile.bio = 'Pelaku usaha di jaringan Ecopurnity. Terbuka untuk pengadaan kolektif dan kerja sama pasokan rutin.'
  base.identity.profile.verification = { email: true, identity: 'verified' }
  base.identity.items = [
    { id: newId('cap'), kind: 'skill', name: 'Pengolahan pasca panen kopi', detail: 'Mahir', categoryId: 'agri' },
    { id: newId('cap'), kind: 'skill', name: 'Manajemen gudang', detail: 'Menengah', categoryId: 'logistics' },
    { id: newId('cap'), kind: 'asset', name: 'Truk engkel', detail: '1 unit, kapasitas 2 ton', categoryId: 'logistics' },
    { id: newId('cap'), kind: 'asset', name: 'Gudang kering', detail: '50 m², Garut', categoryId: 'logistics' },
    { id: newId('cap'), kind: 'capacity', name: 'Produksi green bean', detail: '2 ton/bulan', categoryId: 'agri' },
    { id: newId('cap'), kind: 'capacity', name: 'Pengiriman', detail: '2 trip/minggu', categoryId: 'logistics' },
    { id: newId('cap'), kind: 'resource', name: 'Stok green bean arabika', detail: '500 kg', categoryId: 'agri' },
  ]
  base.identity.preferences = { locations: ['Jawa Barat'], categories: ['agri', 'packaging', 'food'], minPriceIdr: 80_000, maxBudgetIdr: 50_000_000, deliveryRadiusKm: 75 }

  const supply = (id: string, item: string, cat: CategoryId, qty: number, unit: string, price: number, status: SupplyListing['status'], marketId?: string): SupplyListing => ({
    kind: 'supply', id, code: `SUP-${id.slice(-3).toUpperCase()}`, item, categoryId: cat, quantity: { value: qty, unit }, priceIdr: price, location: 'Garut, Jawa Barat',
    spec: 'Sesuai standar mutu market', delivery: 'both', attachments: ['foto-produk.jpg'], status, marketId,
    availableFrom: ago(1440), expiresAt: ahead(30 * 1440), createdAt: ago(9 * 1440), updatedAt: ago(1440),
  })
  const demand = (id: string, item: string, cat: CategoryId, qty: number, unit: string, budget: number, status: DemandListing['status'], marketId?: string): DemandListing => ({
    kind: 'demand', id, code: `DEM-${id.slice(-3).toUpperCase()}`, item, categoryId: cat, quantity: { value: qty, unit }, budgetIdr: budget, location: 'Garut, Jawa Barat',
    spec: 'Pengiriman ke gudang Garut', delivery: 'deliver', attachments: [], status, marketId,
    deadline: ahead(21 * 1440), createdAt: ago(6 * 1440), updatedAt: ago(2 * 1440),
  })
  base.listings = [
    listing(supply('lst-s01', 'Green bean arabika grade 1', 'agri', 500, 'kg', 88_000, 'in_market', 'mkt-kopi-garut')),
    listing(supply('lst-s02', 'Kopi bubuk robusta', 'food', 80, 'kg', 95_000, 'available')),
    listing(supply('lst-s03', 'Jasa angkut truk engkel', 'logistics', 8, 'trip', 1_400_000, 'reserved')),
    listing(supply('lst-s04', 'Cascara kering', 'agri', 40, 'kg', 60_000, 'sold')),
    listing(demand('lst-d01', 'Pupuk organik granul', 'agri', 2_000, 'kg', 4_800_000, 'in_market', 'mkt-pupuk-jateng')),
    listing(demand('lst-d02', 'Karung goni 60 kg', 'packaging', 1_000, 'pcs', 9_000_000, 'open')),
    listing(demand('lst-d03', 'Standing pouch 250 g', 'packaging', 5_000, 'unit', 9_500_000, 'open')),
  ]
  base.opportunities = {
    'opp-4826': { relation: 'joined', contribution: { kind: 'demand', listingId: 'lst-d01', quantity: { value: 2_000, unit: 'kg' } } },
    'opp-4822': { relation: 'following' },
  }
  base.markets = { 'mkt-kopi-garut': { joined: true, watchPriceIdr: 95_000 }, 'mkt-pupuk-jateng': { joined: true } }
  base.qualifications = { 'auc-karton-100k': 'qualified', 'auc-beras-200': 'qualified' }
  base.bids = {
    'auc-karton-100k': { priceIdr: 2_075, status: 'outbid', submittedAt: ago(40), updatedAt: ago(12) },
    'auc-beras-200': { priceIdr: 12_400, status: 'outbid', submittedAt: ago(90), updatedAt: ago(30) },
  }
  base.transactions = [
    txn('trx-a1f3', 'Green bean arabika 300 kg', 'supplier', party('Kedai Kopi Senja'), 'completed', 300, 'kg', 89_500, 20 * 1440),
    txn('trx-b7c2', 'Pupuk organik 1.500 kg (kolektif)', 'buyer', party('Koperasi Mitra Tani'), 'fulfilling', 1_500, 'kg', 2_350, 5 * 1440),
    txn('trx-c9d4', 'Kopi bubuk 40 kg', 'supplier', party('PT Rasa Nusantara'), 'paid', 40, 'kg', 96_000, 2 * 1440),
    txn('trx-d2e8', 'Karung goni 500 pcs', 'buyer', party('UD Makmur Jaya'), 'invoiced', 500, 'pcs', 8_500, 1440),
  ]
  base.notifications = [
    { id: newId('ntf'), type: 'outbid', title: 'Kamu tersalip di auction box karton', body: 'Harga terbaik sekarang Rp 2.050/unit. Bid lagi sebelum auction ditutup.', href: '/auctions/auc-karton-100k', at: ago(12), read: false },
    { id: newId('ntf'), type: 'payment', title: 'Pembayaran masuk escrow', body: 'PT Rasa Nusantara membayar Rp 3.840.000 untuk kopi bubuk 40 kg. Kirim barangnya.', href: '/app/transactions/trx-c9d4', at: ago(180), read: false },
    { id: newId('ntf'), type: 'opportunity_detected', title: 'Opportunity baru cocok untukmu', body: 'Kopi Arabika Garut untuk kafe Jabodetabek: gap 22 ton/bulan.', href: '/opportunities/opp-4822', at: ago(600), read: true },
    { id: newId('ntf'), type: 'delivery', title: 'Pupuk organik sedang dikirim', body: 'Koperasi Mitra Tani mengirim 1.500 kg, estimasi tiba 2 hari lagi.', href: '/app/transactions/trx-b7c2', at: ago(1440), read: true },
    { id: newId('ntf'), type: 'reputation_update', title: 'Reputasi naik ke 94', body: 'Transaksi dengan Kedai Kopi Senja selesai tepat waktu.', href: '/app/reputation', at: ago(3 * 1440), read: true },
  ]
  return base
}

export function personal(userId: string): PersonalData {
  if (!store[userId]) {
    store[userId] = seed(userId)
    savePersonal()
  }
  const p = store[userId]
  p.identity.completeness = completeness(p.identity)
  return p
}

/** Turns onboarding answers into a starting identity + first listing. */
export function applyOnboarding(userId: string, input: OnboardingInput) {
  const p = personal(userId)
  p.identity.profile.location = input.location
  p.identity.preferences = {
    locations: input.location ? [input.location] : [], categories: input.categories, minPriceIdr: input.minPriceIdr,
    maxBudgetIdr: input.maxBudgetIdr, deliveryRadiusKm: input.radiusKm,
  }
  const l = input.firstListing
  if (l) {
    const common = {
      id: newId('lst'), item: l.item, categoryId: input.categories[0] ?? 'agri', quantity: l.quantity, location: input.location,
      spec: '', delivery: 'both' as const, attachments: [], createdAt: now(), updatedAt: now(),
    }
    p.listings.unshift(
      listing(
        l.kind === 'supply'
          ? { ...common, kind: 'supply', code: `SUP-${common.id.slice(-3).toUpperCase()}`, status: 'available', priceIdr: input.minPriceIdr ?? 0, availableFrom: now() }
          : { ...common, kind: 'demand', code: `DEM-${common.id.slice(-3).toUpperCase()}`, status: 'open', budgetIdr: input.maxBudgetIdr ?? 0, deadline: new Date(Date.now() + 30 * 864e5).toISOString() },
        'Dibuat saat onboarding',
      ),
    )
  }
  savePersonal()
}

/** Stores an in-app notification and pushes it on `user:{id}` (PRD §12.2). */
export function notify(userId: string, n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  const p = personal(userId)
  if (!p.prefs[n.type].inApp) return
  const full: AppNotification = { ...n, id: newId('ntf'), at: now(), read: false }
  p.notifications.unshift(full)
  p.notifications.length = Math.min(p.notifications.length, 100)
  savePersonal()
  publish({ channel: `user:${userId}`, type: 'notification.created', payload: full, ts: full.at })
}

export const allPersonal = () => Object.entries(store)
