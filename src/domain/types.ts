// API contract types (PRD §13). camelCase JSON, ISO 8601 UTC times, money as integer Rupiah.
// Feature-specific entities are added here as each feature is built.

import type {
  AuctionStatus, BidStatus, DemandStatus, DisputeStatus, MarketStatus, OpportunityStatus, QualificationStatus, SupplyStatus,
  TransactionStatus,
} from './status'

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
  /** Only ever true for the signed-in user's own bids. */
  mine?: boolean
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

// ── Personal workspace: identity (PRD §8.2) ──────────────────────

export type CapacityKind = 'skill' | 'asset' | 'capacity' | 'resource'

export interface CapacityItem {
  id: string
  kind: CapacityKind
  name: string
  /** Level, quantity per period, condition… e.g. "500 unit/bulan". */
  detail: string
  /** What Smart Matching pairs it with; older items fall back to a keyword guess. */
  categoryId?: CategoryId
}

export interface Identity {
  profile: {
    name: string
    username: string
    location: string
    bio: string
    verification: { email: boolean; phone: boolean; identity: 'none' | 'pending' | 'verified' }
  }
  items: CapacityItem[]
  /** Days 0 = Senin … 6 = Minggu; hours as HH:mm. */
  availability: { days: number[]; from: string; to: string }
  preferences: {
    locations: string[]
    categories: CategoryId[]
    minPriceIdr?: number
    maxBudgetIdr?: number
    deliveryRadiusKm: number
  }
  /** 0–1, drives the "lengkapi profil" prompt. */
  completeness: number
}

// ── Supply & demand (PRD §8.3–8.4) ───────────────────────────────

export type DeliveryMode = 'pickup' | 'deliver' | 'both'

interface ListingBase {
  id: string
  code: string
  item: string
  categoryId: CategoryId
  quantity: Quantity
  location: string
  spec: string
  delivery: DeliveryMode
  /** File names; real uploads arrive with the BE. */
  attachments: string[]
  marketId?: string
  createdAt: string
  updatedAt: string
}

export interface SupplyListing extends ListingBase {
  kind: 'supply'
  status: SupplyStatus
  /** Expected price per unit. */
  priceIdr: number
  availableFrom: string
  expiresAt?: string
}

export interface DemandListing extends ListingBase {
  kind: 'demand'
  status: DemandStatus
  /** Total budget for the whole quantity. */
  budgetIdr: number
  deadline: string
  auctionId?: string
}

export type Listing = SupplyListing | DemandListing

export type ListingInput =
  | Omit<SupplyListing, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt' | 'marketId'>
  | Omit<DemandListing, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt' | 'marketId' | 'auctionId'>

export type ListingDetail = Listing & {
  history: { at: string; status: string; note: string }[]
  matches: Opportunity[]
  markets: Market[]
}

// ── Personal opportunities & markets (PRD §8.5–8.7) ──────────────

export interface MatchReason {
  label: string
  detail: string
}

export interface PersonalOpportunity extends Opportunity {
  reasons: MatchReason[]
  distanceKm: number
  /** Estimated monthly value for this user if they take part. */
  personalValueIdr: number
  relation: 'none' | 'following' | 'joined'
  contribution?: { kind: 'supply' | 'demand'; listingId: string; quantity: Quantity }
}

export interface MyMarket extends Market {
  joined: boolean
  /** Membership state in markets that require the market maker's approval. */
  approval?: 'pending' | 'active' | 'rejected' | 'suspended'
  /** Alert when the median price crosses this value. */
  watchPriceIdr?: number
  myListings: number
}

// ── Auctions as participant (PRD §8.8) ───────────────────────────

export interface Qualification {
  auctionId: string
  status: QualificationStatus
  checks: { id: string; label: string; done: boolean; detail?: string }[]
}

export interface MyBid {
  auction: Auction
  priceIdr: number
  status: BidStatus
  /** 1 = best. Absent for sealed auctions until they close. */
  rank?: number
  submittedAt: string
  updatedAt: string
  canWithdraw: boolean
}

export interface Offer {
  id: string
  supplier: PartyRef & { reputation: number }
  priceIdr: number
  /** Most this supplier can deliver. */
  capacity: Quantity
  submittedAt: string
}

export interface AllocationLine {
  offerId: string
  supplier: string
  quantity: number
  priceIdr: number
}

export interface AuctionEvaluation {
  auction: AuctionDetail
  demand?: DemandListing
  offers: Offer[]
  /** Smart Allocation: cheapest reliable split that covers the lot. */
  suggestion: { lines: AllocationLine[]; totalIdr: number; savingsIdr: number; reason: string }
}

export interface CreateAuctionInput {
  demandId: string
  type: 'reverse' | 'sealed'
  durationMinutes: number
  openingPriceIdr: number
  minStepIdr: number
  visibility: BidVisibility
  invite: string[]
}

// ── Transactions (PRD §8.9) ──────────────────────────────────────

export interface Transaction {
  id: string
  code: string
  title: string
  role: 'buyer' | 'supplier'
  counterparty: PartyRef
  status: TransactionStatus
  quantity: Quantity
  unitPriceIdr: number
  totalIdr: number
  createdAt: string
  updatedAt: string
  dueAt: string
  auctionId?: string
  terms?: PaymentTerms
  /** The same trade as seen by the other party, when they are a platform account. */
  peer?: { userId: string; txId: string }
}

export interface TransactionDetail extends Transaction {
  timeline: { status: TransactionStatus; at?: string; note?: string }[]
  documents: { id: string; kind: 'order' | 'agreement' | 'invoice' | 'proof'; name: string; at: string }[]
  payment: { status: 'unpaid' | 'escrow' | 'released' | 'refunded'; paidAt?: string }
  delivery: { address: string; eta?: string; proof?: string }
  dispute?: {
    status: DisputeStatus
    reason: string
    openedAt: string
    /** Evidence from either party (F6); the opening reason is the first entry. */
    evidence?: { id: string; by: 'buyer' | 'supplier'; name: string; text: string; file?: string; at: string }[]
  }
  // ── F6 settlement fields; optional so records from before F6 still read ──
  agreement?: { buyerAcceptedAt?: string; supplierAcceptedAt?: string }
  /** Market maker commission rate for trades formed inside a market (0 otherwise). */
  makerFeeRate?: number
  invoice?: { number: string; issuedAt: string; dueAt: string }
  shipments?: Shipment[]
  qc?: { outcome: 'accepted' | 'partial' | 'rejected'; acceptedQty: number; note?: string; at: string }
  reviews?: Partial<Record<'buyer' | 'supplier', Review>>
  /** Part of an aggregated (collective) settlement. */
  group?: { id: string; label: string; share: number }
}

export type PaymentTerms = 'escrow' | 'net14' | 'net30'

export interface Shipment {
  id: string
  quantity: number
  dropPoint: string
  carrier: string
  scheduledAt: string
  status: 'scheduled' | 'in_transit' | 'delivered'
  deliveredAt?: string
  proof?: string
}

export interface Review {
  /** 1–5 */
  rating: number
  quality: number
  timeliness: number
  communication: number
  text: string
  by: string
  at: string
}

// ── Notifications (PRD §8.11) ────────────────────────────────────

export type NotificationType =
  | 'opportunity_detected'
  | 'new_market'
  | 'auction_invitation'
  | 'outbid'
  | 'winning_bid'
  | 'auction_ending'
  | 'transaction_update'
  | 'payment'
  | 'delivery'
  | 'reputation_update'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string
  at: string
  read: boolean
}

export type NotificationPrefs = Record<NotificationType, { inApp: boolean; email: boolean }>

// ── Dashboard (PRD §8.1) ─────────────────────────────────────────

export interface DashboardSummary {
  stats: {
    activeOpportunities: number
    activeBids: number
    openDemands: number
    currentOffers: number
    runningTransactions: number
    earnings30dIdr: number
    savings30dIdr: number
    reputation: number
  }
  actions: { id: string; tone: 'red' | 'orange' | 'blue' | 'lime'; title: string; detail: string; href: string }[]
  topMatches: PersonalOpportunity[]
  liveBids: MyBid[]
  activity: ActivityEvent[]
  connections: { count: number; sample: PartyRef[] }
}

// ── Audit trail (PRD §12.6) ──────────────────────────────────────

export interface AuditEntry {
  id: string
  /** Who did it, e.g. "Sari Kusuma (Admin)" or "Sistem". */
  actor: string
  /** Verb phrase, e.g. "Suspend market". */
  action: string
  entity: { type: 'user' | 'business' | 'opportunity' | 'market' | 'auction' | 'alert' | 'transaction' | 'dispute' | 'rule' | 'procurement' | 'supplier'; id: string; label: string }
  at: string
  /** Required for punitive actions (suspend, freeze, reject…). */
  reason?: string
  /** Field-level diff: what changed, before → after. */
  changes?: { field: string; before?: string; after?: string }[]
}
