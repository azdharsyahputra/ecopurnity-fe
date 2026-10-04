


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



export interface RealtimeMessage<T = unknown> {
  channel: string
  type: string
  payload: T
  ts: string
}



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



export type OpportunityKind = 'collective_demand' | 'supply_gap' | 'market_gap' | 'capacity_match'

export interface Opportunity {
  id: string
  code: string
  title: string
  kind: OpportunityKind
  categoryId: CategoryId
  region: string
  status: OpportunityStatus

  demand: Quantity

  supply: Quantity
  participants: number
  potentialValueIdr: number
  suggestedMechanism: MarketMechanism

  confidence: number
  detectedAt: string
}

export interface OpportunityDetail extends Opportunity {
  description: string
  requiredContribution: string
  mechanismReason: string

  history: { month: string; demand: number; supply: number }[]

  participantsPreview: (PartyRef & { role: 'buyer' | 'supplier' })[]
  markets: Market[]
}



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

  priceRange: { minIdr: number; maxIdr: number; unit: string }
  volume30dIdr: number
  activeAuctions: number
}

export interface MarketDetail extends Market {
  description: string
  rules: LabeledValue[]

  priceHistory: { week: string; medianIdr: number; lowIdr: number; highIdr: number }[]
  activity: ActivityEvent[]
  auctions: Auction[]
}



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

  currentPriceIdr?: number
}

export interface PublicBid {
  id: string

  bidder: string
  priceIdr: number
  at: string

  mine?: boolean
}

export interface AuctionDetail extends Auction {
  rules: LabeledValue[]
  minStepIdr: number
  extension: { windowMinutes: number; extendMinutes: number }

  bids: PublicBid[]
}


export type AuctionEvent =
  | { kind: 'bid'; bid: PublicBid; currentPriceIdr?: number; bidCount: number; participants: number }
  | { kind: 'extended'; endsAt: string }
  | { kind: 'price'; currentPriceIdr: number }
  | { kind: 'closed'; status: AuctionStatus }



export type ExplorerRange = '7d' | '30d' | '90d'

export interface ExplorerOverview {
  stats: PublicStats

  deltas: { participants: number; markets: number; opportunities: number; volume: number }
  volume: { date: string; volumeIdr: number }[]

  priceIndex: ({ date: string } & Partial<Record<CategoryId, number>>)[]
  demandSupply: { categoryId: CategoryId; demandIdr: number; supplyIdr: number }[]
}

export interface AggregateRow {
  categoryId: CategoryId
  item: string
  region: string
  quantity: Quantity
  listings: number

  trend: number
}



export type SearchType = 'product' | 'service' | 'business' | 'market' | 'opportunity' | 'auction'

export interface SearchHit {
  type: SearchType
  id: string
  title: string
  subtitle: string

  href: string
}



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



export type CapacityKind = 'skill' | 'asset' | 'capacity' | 'resource'

export interface CapacityItem {
  id: string
  kind: CapacityKind
  name: string

  detail: string

  categoryId?: CategoryId
}

export interface Identity {
  profile: {
    name: string
    username: string
    location: string
    bio: string
    verification: { email: boolean; identity: 'none' | 'pending' | 'verified' }
  }
  items: CapacityItem[]

  availability: { days: number[]; from: string; to: string }
  preferences: {
    locations: string[]
    categories: CategoryId[]
    minPriceIdr?: number
    maxBudgetIdr?: number
    deliveryRadiusKm: number
  }

  completeness: number
}



export type DeliveryMode = 'pickup' | 'deliver' | 'both'


export interface ListingAttachment {
  id: string
  fileName: string

  contentType: string
  sizeBytes?: number

  url?: string
}


export type ListingAttachmentInput = { uploadId: string; id?: never } | { id: string; uploadId?: never }

interface ListingBase {
  id: string
  code: string
  item: string
  categoryId: CategoryId
  quantity: Quantity
  location: string
  spec: string
  delivery: DeliveryMode

  attachments: ListingAttachment[]
  marketId?: string
  createdAt: string
  updatedAt: string
}

export interface SupplyListing extends ListingBase {
  kind: 'supply'
  status: SupplyStatus

  priceIdr: number
  availableFrom: string
  expiresAt?: string
}

export interface DemandListing extends ListingBase {
  kind: 'demand'
  status: DemandStatus

  budgetIdr: number
  deadline: string
  auctionId?: string
}

export type Listing = SupplyListing | DemandListing


export type PublicListing = Pick<Listing, 'id' | 'code' | 'kind' | 'item' | 'categoryId' | 'quantity' | 'location' | 'spec' | 'delivery' | 'marketId' | 'createdAt'> & {

  unitPriceIdr: number
  owner: { name: string; username?: string; userId?: string; verified: boolean }

  attachments: ListingAttachment[]
}


export type ListingInput =
  | (Omit<SupplyListing, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt' | 'marketId' | 'attachments'> & { attachments: ListingAttachmentInput[] })
  | (Omit<DemandListing, 'id' | 'code' | 'status' | 'createdAt' | 'updatedAt' | 'marketId' | 'auctionId' | 'attachments'> & { attachments: ListingAttachmentInput[] })

export type ListingDetail = Listing & {
  history: { at: string; status: string; note: string }[]
  matches: Opportunity[]
  markets: Market[]
}



export interface MatchReason {
  label: string
  detail: string
}

export interface PersonalOpportunity extends Opportunity {
  reasons: MatchReason[]
  distanceKm: number

  personalValueIdr: number
  relation: 'none' | 'following' | 'joined'
  contribution?: { kind: 'supply' | 'demand'; listingId: string; quantity: Quantity }
}

export interface MyMarket extends Market {
  joined: boolean

  approval?: 'pending' | 'active' | 'rejected' | 'suspended'

  watchPriceIdr?: number
  myListings: number
}



export interface Qualification {
  auctionId: string
  status: QualificationStatus
  checks: { id: string; label: string; done: boolean; detail?: string }[]
}

export interface MyBid {
  auction: Auction
  priceIdr: number
  status: BidStatus

  rank?: number
  submittedAt: string
  updatedAt: string
  canWithdraw: boolean

  capacity?: Quantity
}

export interface Offer {
  id: string
  supplier: PartyRef & { reputation: number }
  priceIdr: number

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

  peer?: { userId: string; txId: string }
}

export interface TransactionDetail extends Transaction {
  timeline: { status: TransactionStatus; at?: string; note?: string }[]

  documents: { id: string; kind: 'order' | 'agreement' | 'invoice' | 'proof'; name: string; url?: string; at: string }[]
  payment: { status: 'unpaid' | 'escrow' | 'released' | 'refunded'; paidAt?: string }
  delivery: { address: string; eta?: string; proof?: string }
  dispute?: {
    status: DisputeStatus
    reason: string
    openedAt: string

    evidence?: { id: string; by: 'buyer' | 'supplier'; name: string; text: string; file?: string; url?: string; at: string }[]
  }

  agreement?: { buyerAcceptedAt?: string; supplierAcceptedAt?: string }

  makerFeeRate?: number
  invoice?: { number: string; issuedAt: string; dueAt: string }
  shipments?: Shipment[]
  qc?: { outcome: 'accepted' | 'partial' | 'rejected'; acceptedQty: number; note?: string; at: string }
  reviews?: Partial<Record<'buyer' | 'supplier', Review>>

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

  proofUrl?: string
}

export interface Review {

  rating: number
  quality: number
  timeliness: number
  communication: number
  text: string
  by: string
  at: string
}



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



export interface AuditEntry {
  id: string

  actor: string

  action: string
  entity: { type: 'user' | 'business' | 'opportunity' | 'market' | 'auction' | 'alert' | 'transaction' | 'dispute' | 'rule' | 'procurement' | 'supplier'; id: string; label: string }
  at: string

  reason?: string

  changes?: { field: string; before?: string; after?: string }[]
}



export type TradeParty = PartyRef & { userId?: string }

export type QuoteStatus = 'submitted' | 'countered' | 'accepted' | 'declined' | 'withdrawn'

export interface Quote {
  id: string
  supplier: TradeParty
  priceIdr: number
  quantity: number
  leadTimeDays: number
  terms: PaymentTerms
  note: string
  status: QuoteStatus

  counterPriceIdr?: number
  at: string
  history: { at: string; by: string; text: string }[]
}

export interface Rfq {
  id: string
  code: string
  buyer: TradeParty
  item: string
  categoryId: CategoryId
  quantity: Quantity

  targetPriceIdr?: number
  deadline: string
  location: string
  spec: string
  status: 'open' | 'awarded' | 'closed'
  invited: TradeParty[]
  quotes: Quote[]
  createdAt: string
  conversationId: string
  transactionId?: string
  source?: { kind: 'repeat' | 'listing' | 'match' | 'logistics'; id: string }
}

export interface Conversation {
  id: string
  subject: string
  participants: TradeParty[]
  link?: { type: 'rfq' | 'match' | 'transaction'; id: string; href: string }
  messages: { id: string; by: string; userId?: string; text: string; at: string }[]
  updatedAt: string
}
