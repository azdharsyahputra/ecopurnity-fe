import type { Auction, AuditEntry, Capability, LabeledValue, Market, PartyRef, Transaction, TransactionDetail } from '@/domain/types'
import type { DisputeStatus } from '@/domain/status'
import type { Resolution } from '@/domain/dispute'




export type AccountStatus = 'active' | 'restricted' | 'suspended'

export interface AdminUser {
  id: string
  name: string
  username: string
  email: string
  location?: string
  kind: 'person' | 'business'
  capabilities: Capability[]

  verified: boolean
  status: AccountStatus
  joinedAt: string
  reputation: number
  transactions: number
  reportCount: number
}

export interface UserReport {
  id: string
  reporter: string
  reason: string
  at: string
  context?: string
}

export interface AdminUserDetail extends AdminUser {
  appeal?: Appeal
  reports: UserReport[]
  history: Transaction[]
  orgs: string[]
  audit: AuditEntry[]
}

export type UserAction = 'verify' | 'suspend' | 'restrict' | 'restore' | 'deny_appeal'

export interface Appeal {
  reason: string
  at: string
  status: 'pending' | 'granted' | 'denied'
  decision?: { at: string; by: string; note: string }
}



export type DocKind = 'nib' | 'npwp' | 'akta' | 'ktp' | 'selfie'
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'reupload'

export interface VerificationRequest {
  id: string

  kind?: 'business' | 'personal'
  business: string
  owner: string
  submittedAt: string
  status: VerificationStatus

  form: LabeledValue[]


  documents: { kind: DocKind; fileName: string; fields: LabeledValue[]; url?: string }[]

  nik?: string
  decision?: { at: string; by: string; note: string }
}

export type VerificationAction = 'approve' | 'reject' | 'reupload'



export interface MarketFlag {
  id: string
  by: string
  label: string
  at: string
}

export interface AdminMarket extends Market {
  flags: MarketFlag[]
  reports: UserReport[]
  disputes: number
  reviewedAt?: string
}

export type MarketAction = 'review' | 'flag' | 'suspend' | 'restore'



export interface Finding {
  id: string
  rule: string
  severity: 'low' | 'medium' | 'high'
  detail: string
}

export interface AdminBid {
  id: string

  bidder: string
  masked: string
  priceIdr: number
  at: string
}

export interface AdminAuction extends Auction {
  findings: Finding[]
}

export interface AdminAuctionDetail extends AdminAuction {
  minStepIdr: number

  bids: AdminBid[] | null
  caseId?: string
  audit: AuditEntry[]
}

export type AuctionAction = 'freeze' | 'unfreeze' | 'open_case'



export interface DisputeParty extends PartyRef {
  role: 'buyer' | 'supplier'
  userId?: string
}

export interface Evidence {
  id: string
  side: 'buyer' | 'supplier' | 'admin'
  by: string
  text: string
  file?: string

  url?: string
  at: string
}

export interface DisputeCase {
  id: string
  code: string
  status: DisputeStatus
  reason: string
  openedAt: string
  openedBy: string
  parties: DisputeParty[]
  transaction: TransactionDetail
  marketId?: string
  evidence: Evidence[]
  timeline: { at: string; by: string; label: string }[]
  resolution?: Resolution & { refundIdr: number; releaseIdr: number; reason: string; at: string; by: string }
}

export type DisputeSummary = Omit<DisputeCase, 'evidence' | 'timeline' | 'transaction'> & { totalIdr: number; title: string }

export type DisputeActionInput =
  | { action: 'request_evidence'; from: 'buyer' | 'supplier' | 'both'; reason: string }
  | { action: 'start_review'; reason?: string }
  | { action: 'resolve'; resolution: Resolution; reason: string }



export type AlertType =
  | 'bid_manipulation'
  | 'collusion'
  | 'fake_accounts'
  | 'abnormal_bidding'
  | 'wash_trading'
  | 'price_manipulation'
  | 'transaction_network'

export type AlertStatus = 'new' | 'investigating' | 'escalated' | 'dismissed' | 'closed'

export interface Subject {
  type: 'user' | 'auction' | 'market'
  id: string
  label: string
}

export interface FraudAlert {
  id: string
  code: string
  type: AlertType

  source: 'system' | 'manual'
  title: string

  score: number

  confidence: number
  status: AlertStatus
  detectedAt: string
  subjects: Subject[]
  evidence: string[]

  graph?: { nodes: { id: string; label: string; kind: 'person' | 'business' | 'auction' | 'device'; flagged?: boolean }[]; edges: { source: string; target: string; label?: string }[] }
  investigation?: { openedAt: string; by: string; notes: { at: string; by: string; text: string }[] }
  resolution?: { at: string; by: string; outcome: string; reason: string }
}

export type EscalationAction = 'suspend_user' | 'restrict_user' | 'freeze_auction' | 'suspend_market'

export type AlertActionInput =
  | { action: 'investigate' }
  | { action: 'note'; text: string }
  | { action: 'dismiss' | 'close'; reason: string }
  | { action: 'escalate'; subjectId: string; escalation: EscalationAction; reason: string }





export type WithdrawalStatus = 'processing' | 'paid' | 'rejected'


export interface AdminWithdrawal {
  id: string

  code: string
  status: WithdrawalStatus
  amountIdr: number
  requestedAt: string

  dueAt: string
  requester: { id: string; name: string; email: string }
  party: { id: string; name: string }
  bank: string
  holder: string
  accountLast4: string
  transferRef?: string
  paidAt?: string
  note?: string
  reason?: string
  decidedAt?: string
  decidedBy?: string
}

export interface AdminWithdrawalDetail extends AdminWithdrawal {

  accountNo?: string

  identityName?: string
  nameMismatch: boolean

  recent: AdminWithdrawal[]
}

export type WithdrawalActionInput =
  | { action: 'mark_paid'; transferRef: string; paidAt?: string; note?: string }
  | { action: 'reject'; reason: string }

export interface AdminOverview {
  queues: { users: number; verification: number; markets: number; auctions: number; disputes: number; fraud: number; withdrawals: number }
  newAlerts: FraudAlert[]
  openDisputes: DisputeSummary[]

  sla: { module: 'verification' | 'disputes' | 'withdrawals'; label: string; slaHours: number; total: number; breached: number; oldestAt?: string }[]
}
