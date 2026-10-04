


export type Tone = 'gray' | 'teal' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'pink' | 'lime'

type Meta = readonly [label: string, tone: Tone, live?: true]

export const STATUS = {
  supply: {
    available: ['Available', 'blue'],
    reserved: ['Reserved', 'yellow'],
    in_market: ['In Market', 'teal'],
    sold: ['Sold', 'green'],
    expired: ['Expired', 'gray'],
  },
  demand: {
    open: ['Open', 'blue'],
    matched: ['Matched', 'purple'],
    in_market: ['In Market', 'teal'],
    fulfilled: ['Fulfilled', 'green'],
    expired: ['Expired', 'gray'],
    cancelled: ['Cancelled', 'gray'],
  },
  opportunity: {
    detected: ['Detected', 'lime'],
    forming: ['Forming', 'yellow'],
    market_live: ['Market Live', 'teal'],
    dismissed: ['Dismissed', 'gray'],
    closed: ['Closed', 'gray'],
  },
  market: {
    draft: ['Draft', 'gray'],
    formation: ['Formation', 'yellow'],
    active: ['Active', 'green'],
    paused: ['Paused', 'orange'],
    closed: ['Closed', 'gray'],
    suspended: ['Suspended', 'red'],
  },
  auction: {
    scheduled: ['Scheduled', 'gray'],
    qualification: ['Qualification', 'blue'],
    live: ['Live', 'lime', true],
    extended: ['Extended', 'lime', true],
    closed: ['Closed', 'gray'],
    awarded: ['Awarded', 'green'],
    cancelled: ['Cancelled', 'gray'],
    frozen: ['Frozen', 'red'],
  },
  bid: {
    draft: ['Draft', 'gray'],
    submitted: ['Submitted', 'blue'],
    leading: ['Leading', 'green'],
    outbid: ['Outbid', 'orange'],
    won: ['Won', 'green'],
    lost: ['Lost', 'gray'],
    withdrawn: ['Withdrawn', 'gray'],
  },
  transaction: {
    agreement: ['Agreement', 'blue'],
    invoiced: ['Invoiced', 'blue'],
    paid: ['Paid', 'teal'],
    fulfilling: ['Fulfilling', 'purple'],
    delivered: ['Delivered', 'teal'],
    accepted: ['Accepted', 'teal'],
    completed: ['Completed', 'green'],
    cancelled: ['Cancelled', 'gray'],
    disputed: ['Disputed', 'red'],
  },
  qualification: {
    not_started: ['Belum kualifikasi', 'gray'],
    pending: ['Menunggu review', 'yellow'],
    qualified: ['Terkualifikasi', 'green'],
    rejected: ['Ditolak', 'red'],
  },
  dispute: {
    open: ['Open', 'orange'],
    evidence: ['Evidence', 'yellow'],
    review: ['Review', 'blue'],
    resolved: ['Resolved', 'green'],
  },
} as const satisfies Record<string, Record<string, Meta>>

export type Entity = keyof typeof STATUS
export type StatusOf<E extends Entity> = keyof (typeof STATUS)[E] & string

export type SupplyStatus = StatusOf<'supply'>
export type DemandStatus = StatusOf<'demand'>
export type OpportunityStatus = StatusOf<'opportunity'>
export type MarketStatus = StatusOf<'market'>
export type AuctionStatus = StatusOf<'auction'>
export type BidStatus = StatusOf<'bid'>
export type TransactionStatus = StatusOf<'transaction'>
export type DisputeStatus = StatusOf<'dispute'>
export type QualificationStatus = StatusOf<'qualification'>

export function statusMeta<E extends Entity>(entity: E, status: StatusOf<E>) {
  const [label, tone, live] = (STATUS[entity] as Record<string, Meta>)[status]
  return { label, tone, live: live === true }
}
