import type { ActivityEvent, AppNotification, AuctionDetail, LabeledValue, MarketDetail } from '@/domain/types'
import type { MarketStatus } from '@/domain/status'
import type { MmDispute, MmParticipant, PipelineStage, SupplierVerification } from '@/domain/mm'
import { activeVersion, defaultRules, rulesToLabeled, type RuleVersion } from '@/domain/marketRules'
import { publish } from '@/lib/realtime'
import { db } from './db'
import { economy } from './economy'
import { allPersonal, notify } from './personal'

// Market Maker store (PRD §10). Persisted like personal.ts; seeded markets keep their F4 state as patches.
// ponytail: one JSON blob in localStorage, same ceiling as the personal store.

export interface MarketOps {
  participants: MmParticipant[]
  disputes: MmDispute[]
  ruleVersions: RuleVersion[]
  /** Synthetic rounds that ran before this demo started (recorded, read-only). */
  pastRounds: number
  settings: { approval: 'auto' | 'manual'; supplierVerification: SupplierVerification }
  opportunityId?: string
}

interface Store {
  /** userId → extra market ids this maker operates (on top of org-name matches). */
  operated: Record<string, string[]>
  createdMarkets: MarketDetail[]
  rounds: AuctionDetail[]
  pipeline: Record<string, { stage: PipelineStage; reason?: string; marketId?: string }>
  ops: Record<string, MarketOps>
  patches: Record<string, { status: MarketStatus; buyers: number; suppliers: number; rules: LabeledValue[] }>
  /** userId → recent operations events, newest first. */
  events: Record<string, ActivityEvent[]>
}

const KEY = 'ecp-mock-mm'
const SEED: Store = {
  operated: { 'usr-dimas': ['mkt-pupuk-jateng', 'mkt-coldchain-sby', 'mkt-karton-jkt'] },
  createdMarkets: [], rounds: [], pipeline: { 'opp-4823': { stage: 'evaluating' } }, ops: {}, patches: {}, events: {},
}

export const mm: Store = (() => {
  try {
    return { ...SEED, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return SEED
  }
})()

/** Snapshot operated markets' live fields so seeded markets come back paused/closed/etc. after a reload. */
export function saveMm() {
  for (const id of Object.keys(mm.ops)) {
    const m = economy.markets.find((x) => x.id === id)
    if (m) mm.patches[id] = { status: m.status, buyers: m.buyers, suppliers: m.suppliers, rules: m.rules }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(mm))
  } catch {
    // per-tab only
  }
}

const now = () => new Date().toISOString()
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
let seq = 0
export const mmId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

// ── Who operates what ────────────────────────────────────────────

export const isMaker = (userId: string) => !!db.users.find((u) => u.id === userId)?.capabilities.includes('market_maker')

export function operatedIds(userId: string) {
  const orgs = new Set(db.users.find((u) => u.id === userId)?.orgs.map((o) => o.orgName))
  const ids = new Set([...economy.markets.filter((m) => orgs.has(m.maker.name)).map((m) => m.id), ...(mm.operated[userId] ?? [])])
  return economy.markets.filter((m) => ids.has(m.id)).map((m) => m.id)
}

export function actor(userId: string) {
  return `${db.users.find((u) => u.id === userId)?.name ?? 'Market maker'} (Market Maker)`
}

// ── Per-market operations state ──────────────────────────────────

const BUSINESSES = ['CV Sumber Pangan', 'PT Rasa Nusantara', 'Kedai Kopi Senja', 'UD Makmur Jaya', 'PT Kemas Prima', 'Koperasi Mitra Tani', 'Toko Berkah', 'PT Logistik Andalan', 'CV Tani Lestari', 'PT Agro Priangan']
const PEOPLE = ['Bagus Santoso', 'Dewi Lestari', 'Andi Pratama', 'Siti Rahma', 'Yoga Aditya']
const STATUS_CYCLE: MmParticipant['status'][] = ['active', 'active', 'pending', 'active', 'pending', 'active', 'suspended', 'active', 'active', 'pending']
const DISPUTES = ['Kualitas barang tidak sesuai spesifikasi', 'Keterlambatan pengiriman', 'Selisih kuantitas saat serah terima']

/** Demo accounts that appear as participants, so approvals and suspensions reach a real inbox. */
const DEMO_PARTICIPANTS: Record<string, Omit<MmParticipant, 'id' | 'joinedAt'>> = {
  'mkt-kopi-garut': { name: 'Rina Wulandari', kind: 'person', verified: true, role: 'supplier', status: 'active', reputation: 94, userId: 'usr-rina' },
  'mkt-karton-jkt': { name: 'PT Solusi Kemasan Nusantara', kind: 'business', verified: false, role: 'supplier', status: 'pending', reputation: 88, userId: 'usr-ajar' },
}

function seedOps(m: MarketDetail): MarketOps {
  const h = hash(m.id)
  const participants: MmParticipant[] = STATUS_CYCLE.map((status, i) => {
    const business = i % 4 !== 3
    const role = i % 3 === 1 ? 'supplier' : 'buyer'
    return {
      id: `${m.id}-p${i}`, name: business ? BUSINESSES[(h + i) % BUSINESSES.length] : PEOPLE[(h + i) % PEOPLE.length],
      kind: business ? 'business' : 'person', verified: role === 'buyer' || i % 2 === 0, role, status,
      reputation: 72 + ((h >>> i) % 27), joinedAt: ago(60 * (6 + i * 19)),
      note: status === 'suspended' ? 'Gagal kirim dua round berturut-turut' : undefined,
    }
  })
  const demo = DEMO_PARTICIPANTS[m.id]
  if (demo) participants.unshift({ ...demo, id: `${m.id}-demo`, joinedAt: ago(3 * 1440) })
  const active = participants.filter((p) => p.status === 'active')
  const buyers = active.filter((p) => p.role === 'buyer')
  const sellers = active.filter((p) => p.role === 'supplier')
  const disputes: MmDispute[] = Array.from({ length: h % 3 }, (_, i) => ({
    id: `${m.id}-d${i}`, title: DISPUTES[(h + i) % DISPUTES.length],
    parties: `${buyers[i % buyers.length]?.name ?? 'Pembeli'} vs ${sellers[i % Math.max(1, sellers.length)]?.name ?? 'Supplier'}`,
    status: i === 0 ? 'open' : 'review', openedAt: ago(60 * (5 + i * 30)),
  }))
  return {
    participants, disputes, pastRounds: 6,
    ruleVersions: [{ version: 1, rules: defaultRules(m), effectiveFromRound: 1, createdAt: ago(30 * 1440), author: 'Sistem (migrasi aturan awal)' }],
    settings: { approval: 'manual', supplierVerification: 'documents' },
  }
}

/** Rounds of a market that have started (scheduled/qualification haven't). */
export const startedRounds = (marketId: string) =>
  economy.auctions.filter((a) => a.marketId === marketId && !['scheduled', 'qualification', 'cancelled'].includes(a.status))

export const currentRound = (marketId: string, o: MarketOps) => o.pastRounds + startedRounds(marketId).length

export function ops(marketId: string): MarketOps {
  if (!mm.ops[marketId]) {
    const m = economy.markets.find((x) => x.id === marketId)!
    mm.ops[marketId] = seedOps(m)
    m.rules = rulesToLabeled(activeVersion(mm.ops[marketId].ruleVersions, currentRound(marketId, mm.ops[marketId])).rules, m.priceRange.unit)
    saveMm()
  }
  return mm.ops[marketId]
}

// ── Side effects shared by handlers ──────────────────────────────

/** Platform accounts in this market: listed participants plus anyone who joined it from their personal workspace. */
export function notifyMarket(marketId: string, n: Omit<AppNotification, 'id' | 'at' | 'read'>, onlyActive = true) {
  const ids = new Set(ops(marketId).participants.filter((p) => p.userId && (!onlyActive || p.status === 'active')).map((p) => p.userId!))
  for (const [userId, p] of allPersonal()) if (p.markets[marketId]?.joined) ids.add(userId)
  for (const id of ids) if (db.users.some((u) => u.id === id)) notify(id, n)
}

/** Operations feed item for this maker (`mm:{userId}:events`), optionally mirrored to the public activity feed. */
export function emitEvent(userId: string, e: Omit<ActivityEvent, 'id' | 'at'>, isPublic = false) {
  const full: ActivityEvent = { ...e, id: mmId('mme'), at: now() }
  const list = (mm.events[userId] ??= [])
  list.unshift(full)
  list.length = Math.min(list.length, 30)
  publish({ channel: `mm:${userId}:events`, type: 'activity.created', payload: full, ts: full.at })
  if (isPublic) {
    db.activity.unshift({ ...full, id: mmId('act') })
    db.activity.length = Math.min(db.activity.length, 50)
    publish({ channel: 'public:activity', type: 'activity.created', payload: db.activity[0], ts: full.at })
  }
}

// ── Restore persisted state into the shared economy ──────────────

for (const m of mm.createdMarkets) if (!economy.markets.some((x) => x.id === m.id)) economy.markets.unshift(m)
for (const a of mm.rounds) {
  const i = economy.auctions.findIndex((x) => x.id === a.id)
  if (i >= 0) economy.auctions[i] = a
  else economy.auctions.unshift(a)
  economy.bestPrice.set(a.id, a.currentPriceIdr ?? a.openingPriceIdr)
}
for (const [id, patch] of Object.entries(mm.patches)) {
  const m = economy.markets.find((x) => x.id === id)
  if (m) Object.assign(m, patch)
}
for (const [id, p] of Object.entries(mm.pipeline)) {
  const o = economy.opportunities.find((x) => x.id === id)
  if (!o) continue
  o.status = p.stage === 'evaluating' ? 'detected' : p.stage
  const m = p.marketId && economy.markets.find((x) => x.id === p.marketId)
  if (m && !o.markets.some((x) => x.id === m.id)) o.markets.push(m)
}
// Seeded makers' markets get their rules versioned (and mirrored to the public rule list) up front.
for (const u of db.users) if (u.capabilities.includes('market_maker')) operatedIds(u.id).forEach(ops)
