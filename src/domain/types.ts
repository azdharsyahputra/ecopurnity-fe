// API contract types (PRD §13). camelCase JSON, ISO 8601 UTC times, money as integer Rupiah.
// Feature-specific entities are added here as each feature is built.

import type { AuctionStatus, MarketStatus, OpportunityStatus } from './status'

export interface Quantity {
  value: number
  unit: string
}

export interface Page<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number }
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}

// ── Identity & access ────────────────────────────────────────────

/** Capabilities on top of the base Participant account (PRD §3). */
export type Capability = 'market_maker' | 'admin'

export type OrgRole = 'owner' | 'procurement' | 'finance' | 'operations' | 'sales'

export interface OrgMembership {
  orgId: string
  orgName: string
  role: OrgRole
  verified: boolean
}

export interface User {
  id: string
  name: string
  username: string
  email: string
  emailVerified: boolean
  location?: string
  avatarUrl?: string
  capabilities: Capability[]
  orgs: OrgMembership[]
  onboarded: boolean
}

// ── Public economy ───────────────────────────────────────────────

export interface PublicStats {
  activeParticipants: number
  activeMarkets: number
  opportunitiesDetected: number
  transactionVolumeIdr: number
}

export type ActivityType =
  | 'opportunity_detected'
  | 'market_formed'
  | 'auction_started'
  | 'bid_placed'
  | 'auction_closed'
  | 'transaction_completed'

export interface ActivityEvent {
  id: string
  type: ActivityType
  title: string
  amountIdr?: number
  at: string
}

// ── Real-time (PRD §12.2) ────────────────────────────────────────

export interface RealtimeMessage<T = unknown> {
  channel: string
  type: string
  payload: T
  ts: string
}

// ── Catalog ──────────────────────────────────────────────────────

export type CategoryId = 'agri' | 'food' | 'packaging' | 'manufacturing' | 'logistics' | 'it' | 'energy'

export type MarketMechanism =
  | 'forward_auction'
  | 'reverse_auction'
  | 'sealed_bid'
  | 'dutch_auction'
  | 'direct_market'
  | 'collective_procurement'

export type MarketObjective = 'procurement' | 'selling' | 'resource_exchange' | 'service_exchange'

export interface LabeledValue {
  label: string
  value: string
}

export interface PartyRef {
  name: string
  kind: 'person' | 'business'
  verified: boolean
}

// ── Opportunities (PRD §6.3) ─────────────────────────────────────

export type OpportunityKind = 'collective_demand' | 'supply_gap' | 'market_gap' | 'capacity_match'

export interface Opportunity {
  id: string
  code: string
  title: string
  kind: OpportunityKind
  categoryId: CategoryId
  region: string
  status: OpportunityStatus
  /** Potential demand per month. */
  demand: Quantity
  /** Current supply per month, same unit as demand. */
  supply: Quantity
  participants: number
  potentialValueIdr: number
  suggestedMechanism: MarketMechanism
  /** Engine confidence, 0–1. */
  confidence: number
  detectedAt: string
}

export interface OpportunityDetail extends Opportunity {
  description: string
  requiredContribution: string
  mechanismReason: string
  /** Monthly demand vs supply, oldest first. */
  history: { month: string; demand: number; supply: number }[]
  /** Visitors see a masked list; members see names (PRD §6.3). */
  participantsPreview: (PartyRef & { role: 'buyer' | 'supplier' })[]
  markets: Market[]
}

// ── Markets (PRD §6.4) ───────────────────────────────────────────

export interface Market {
  id: string
  code: string
  name: string
  categoryId: CategoryId
  region: string
  objective: MarketObjective
  mechanism: MarketMechanism
  status: MarketStatus
  maker: PartyRef
  demand: Quantity
  supply: Quantity
  buyers: number
  suppliers: number
  /** Rupiah per unit over the last 30 days. */
  priceRange: { minIdr: number; maxIdr: number; unit: string }
  volume30dIdr: number
  activeAuctions: number
}

export interface MarketDetail extends Market {
  description: string
  rules: LabeledValue[]
  /** Weekly median price with its low–high band, oldest first. */
  priceHistory: { week: string; medianIdr: number; lowIdr: number; highIdr: number }[]
  activity: ActivityEvent[]
  auctions: Auction[]
}

// ── Auctions (PRD §6.5) ──────────────────────────────────────────

export type AuctionType = 'forward' | 'reverse' | 'sealed' | 'dutch'
export type BidVisibility = 'full' | 'rank_only' | 'sealed'

export interface Auction {
  id: string
  code: string
  title: string
  marketId: string
  marketName: string
  categoryId: CategoryId
  type: AuctionType
  status: AuctionStatus
  lot: { item: string; quantity: Quantity; spec: string }
  startsAt: string
  endsAt: string
  participants: number
  bidCount: number
  visibility: BidVisibility
  openingPriceIdr: number
  /** Best bid per unit so far (lowest for reverse, highest for forward); absent for sealed. Current ask for Dutch. */
  currentPriceIdr?: number
}

export interface PublicBid {
  id: string
  /** Masked per visibility rule, e.g. "Supplier 3". */
  bidder: string
  priceIdr: number
  at: string
}

export interface AuctionDetail extends Auction {
  rules: LabeledValue[]
  minStepIdr: number
  extension: { windowMinutes: number; extendMinutes: number }
  /** Newest first; empty for sealed auctions. */
  bids: PublicBid[]
}

/** Payloads on the `auction:{id}` channel. */
export type AuctionEvent =
  | { kind: 'bid'; bid: PublicBid; currentPriceIdr?: number; bidCount: number; participants: number }
  | { kind: 'extended'; endsAt: string }
  | { kind: 'price'; currentPriceIdr: number }
  | { kind: 'closed'; status: AuctionStatus }

// ── Explorer (PRD §6.2) ──────────────────────────────────────────

export type ExplorerRange = '7d' | '30d' | '90d'

export interface ExplorerOverview {
  stats: PublicStats
  /** Change vs the previous period of the same length, as fractions. */
  deltas: { participants: number; markets: number; opportunities: number; volume: number }
  volume: { date: string; volumeIdr: number }[]
  /** Price index (start of range = 100) per category. */
  priceIndex: ({ date: string } & Partial<Record<CategoryId, number>>)[]
  demandSupply: { categoryId: CategoryId; demandIdr: number; supplyIdr: number }[]
}

export interface AggregateRow {
  categoryId: CategoryId
  item: string
  region: string
  quantity: Quantity
  listings: number
  /** 30-day change, fraction. */
  trend: number
}

// ── Search (PRD §6.6) ────────────────────────────────────────────

export type SearchType = 'product' | 'service' | 'business' | 'market' | 'opportunity' | 'auction'

export interface SearchHit {
  type: SearchType
  id: string
  title: string
  subtitle: string
  /** In-app path. */
  href: string
}

// ── Onboarding (PRD §7) ──────────────────────────────────────────

export type OnboardingGoal = 'sell' | 'buy' | 'business' | 'market_maker'

export interface OnboardingInput {
  goals: OnboardingGoal[]
  location: string
  radiusKm: number
  categories: CategoryId[]
  firstListing?: { kind: 'supply' | 'demand'; item: string; quantity: Quantity }
  minPriceIdr?: number
  maxBudgetIdr?: number
  organization?: { name: string; industry: string; location: string }
  marketMakerApplication?: { organization: string; reason: string }
}
