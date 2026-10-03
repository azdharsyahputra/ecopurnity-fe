import type {
  ActivityEvent, Auction, AuctionType, CategoryId, Market, MarketDetail, MarketMechanism, MarketObjective, Opportunity, PartyRef,
} from './types'
import type { DisputeStatus, Tone } from './status'
import type { MarketRules, RuleVersion } from './marketRules'

// Market Maker workspace contract (PRD §10). Kept apart from types.ts so F4 owns its own shapes.

// ── Opportunity pipeline ─────────────────────────────────────────

export type PipelineStage = 'detected' | 'evaluating' | 'forming' | 'market_live' | 'dismissed'

export const PIPELINE_STAGES: Record<PipelineStage, { label: string; tone: Tone }> = {
  detected: { label: 'Detected', tone: 'lime' },
  evaluating: { label: 'Evaluating', tone: 'blue' },
  forming: { label: 'Forming', tone: 'yellow' },
  market_live: { label: 'Market Live', tone: 'teal' },
  dismissed: { label: 'Dismissed', tone: 'gray' },
}

/** Manual moves. Market Live is only reached by publishing a market; dismissing needs a reason. */
export const PIPELINE_MOVES: Record<PipelineStage, PipelineStage[]> = {
  detected: ['evaluating', 'forming', 'dismissed'],
  evaluating: ['detected', 'forming', 'dismissed'],
  forming: ['evaluating', 'dismissed'],
  market_live: [],
  dismissed: ['detected'],
}

export const canMove = (from: PipelineStage, to: PipelineStage) => PIPELINE_MOVES[from].includes(to)

export interface PipelineCard extends Opportunity {
  stage: PipelineStage
  mechanismReason: string
  dismissReason?: string
  marketId?: string
}

// ── Operations ───────────────────────────────────────────────────

export type MmAlertKind = 'low_liquidity' | 'disputes' | 'approvals'

export interface MmAlert {
  kind: MmAlertKind
  label: string
}

export const ALERT_TONE: Record<MmAlertKind, Tone> = { low_liquidity: 'orange', disputes: 'red', approvals: 'blue' }

export interface MmMarketRow extends Market {
  liveRounds: number
  alerts: MmAlert[]
}

export interface MmOverview {
  stats: { activeMarkets: number; participants: number; activeAuctions: number; volumeIdr: number; matchedDemand: number }
  markets: MmMarketRow[]
  events: ActivityEvent[]
  /** Subscribe to `auction:{id}` for these to keep the feed live. */
  liveAuctions: { id: string; title: string }[]
}

export type ParticipantStatus = 'pending' | 'active' | 'rejected' | 'suspended'

export const PARTICIPANT_STATUS: Record<ParticipantStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Menunggu approval', tone: 'yellow' },
  active: { label: 'Aktif', tone: 'green' },
  rejected: { label: 'Ditolak', tone: 'gray' },
  suspended: { label: 'Disuspend', tone: 'red' },
}

export interface MmParticipant extends PartyRef {
  id: string
  role: 'buyer' | 'supplier'
  status: ParticipantStatus
  reputation: number
  joinedAt: string
  /** Set when the participant is a platform account we can notify. */
  userId?: string
  note?: string
}

export interface MmDispute {
  id: string
  title: string
  parties: string
  status: DisputeStatus
  openedAt: string
  resolution?: string
}

export type ParticipantAction = 'approve' | 'reject' | 'verify' | 'suspend'
export type DisputeAction = 'review' | 'resolve'
export type MarketStatusAction = 'pause' | 'resume' | 'close'

/** A round's recorded prices. Closed rounds are history: read-only everywhere. */
export interface RoundResult {
  round: number
  auctionId?: string
  title: string
  status: 'live' | 'closed'
  at: string
  openingIdr: number
  currentIdr?: number
  medianIdr?: number
  clearingIdr?: number
}

export interface MmMarketOps {
  market: MarketDetail
  participants: MmParticipant[]
  disputes: MmDispute[]
  ruleVersions: RuleVersion[]
  /** Rounds started so far; the next round is `currentRound + 1`. */
  currentRound: number
  rounds: Auction[]
  results: RoundResult[]
  settings: { approval: 'auto' | 'manual'; supplierVerification: SupplierVerification }
  alerts: MmAlert[]
}

export interface CreateRoundInput {
  title: string
  quantity: number
  openingPriceIdr: number
  durationMinutes: number
}

// ── Analytics ────────────────────────────────────────────────────

export interface MmAnalytics {
  liquidity: { buyers: number; suppliers: number; activeOrders: number; ratio: number }
  byMarket: { id: string; name: string; buyers: number; suppliers: number }[]
  efficiency: { week: string; matched: number; unmatched: number; utilization: number }[]
  growth: { week: string; participants: number; transactions: number; connections: number; repeat: number }[]
  priceDiscovery: { marketId: string; name: string; unit: string; rounds: RoundResult[] }[]
}

// ── Market formation ─────────────────────────────────────────────

export type SupplierVerification = 'none' | 'documents' | 'verified_business'

export const SUPPLIER_VERIFICATION: Record<SupplierVerification, string> = {
  none: 'Tidak wajib',
  documents: 'Dokumen legal usaha',
  verified_business: 'Bisnis terverifikasi Ecopurnity',
}

export interface CreateMarketInput {
  opportunityId?: string
  name: string
  objective: MarketObjective
  mechanism: MarketMechanism
  categoryId: CategoryId
  unit: string
  /** Expected monthly quantities, same unit. Prefilled from the opportunity. */
  demand: number
  supply: number
  referencePriceIdr: number
  rules: MarketRules
  autoInvite: boolean
  approval: 'auto' | 'manual'
  supplierVerification: SupplierVerification
}

/** Longer guidance than MECHANISMS.hint: when each mechanism fits. */
export const MECHANISM_GUIDE: Record<MarketMechanism, string> = {
  forward_auction: 'Cocok saat supply terbatas dan banyak pembeli bersaing, misalnya hasil panen premium.',
  reverse_auction: 'Cocok untuk pengadaan: satu kebutuhan jelas, supplier menurunkan harga sampai titik terbaik.',
  sealed_bid: 'Cocok untuk paket bernilai besar atau spesifikasi kompleks; mencegah peserta saling membaca harga.',
  dutch_auction: 'Cocok untuk stok yang harus cepat terserap; harga turun sampai ada yang menerima.',
  direct_market: 'Cocok untuk jasa atau barang standar dengan harga relatif stabil; order langsung tanpa lelang.',
  collective_procurement: 'Cocok saat banyak pembeli kecil membutuhkan barang yang sama; volume digabung untuk harga skala.',
}

/** Auction type a market's rounds run as. */
export const ROUND_TYPE: Record<MarketMechanism, AuctionType> = {
  forward_auction: 'forward', reverse_auction: 'reverse', sealed_bid: 'sealed', dutch_auction: 'dutch',
  direct_market: 'reverse', collective_procurement: 'reverse',
}

/**
 * Rough pre-launch estimate shown on the wizard's review step.
 * ponytail: linear heuristics, not a model; replace with the engine's simulation endpoint when BE has one.
 */
export function simulateMarket(input: {
  invited: number
  demand: number
  supply: number
  referencePriceIdr: number
  mechanism: MarketMechanism
  rules: Pick<MarketRules, 'eligibility' | 'radiusKm'>
  approval: 'auto' | 'manual'
  supplierVerification: SupplierVerification
}) {
  const reach = Math.min(1.5, 0.6 + input.rules.radiusKm / 200)
  const friction =
    (input.rules.eligibility === 'open' ? 1 : input.rules.eligibility === 'verified' ? 0.9 : 0.8) *
    (input.approval === 'manual' ? 0.9 : 1) *
    (input.supplierVerification === 'none' ? 1 : input.supplierVerification === 'documents' ? 0.92 : 0.85)
  const participants = Math.max(2, Math.round((input.invited || 10) * reach * friction))
  const coverage = input.demand > 0 ? Math.min(1, input.supply / input.demand) : 0
  const suppliers = Math.max(1, Math.round(participants * (0.15 + 0.25 * coverage)))
  const buyers = Math.max(1, participants - suppliers)
  // Scarce supply pushes forward/collective prices up; reverse/dutch competition pushes them down.
  const down = ['reverse_auction', 'dutch_auction', 'collective_procurement', 'sealed_bid'].includes(input.mechanism)
  const pressure = down ? -(0.04 + 0.06 * Math.min(1, suppliers / 8)) : 0.03 + 0.08 * (1 - coverage)
  const mid = Math.round(input.referencePriceIdr * (1 + pressure))
  return {
    participants,
    buyers,
    suppliers,
    /** Buyers per supplier. */
    ratio: buyers / suppliers,
    liquidity: (suppliers >= 5 && buyers / suppliers <= 8 ? 'baik' : suppliers >= 3 ? 'cukup' : 'rendah') as 'baik' | 'cukup' | 'rendah',
    priceLowIdr: Math.round(mid * 0.96),
    priceHighIdr: Math.round(mid * 1.04),
  }
}

/** Liquidity alert threshold shared by the overview and detail views. */
export const lowLiquidity = (m: Pick<Market, 'buyers' | 'suppliers'>) => m.suppliers < 8 || m.buyers / Math.max(1, m.suppliers) > 10
