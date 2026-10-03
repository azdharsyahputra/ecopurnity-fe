import type { Auction, AuditEntry, Capability, LabeledValue, Market, PartyRef, Transaction, TransactionDetail } from '@/domain/types'
import type { DisputeStatus } from '@/domain/status'
import type { Resolution } from '@/domain/dispute'

// Admin governance API contract (PRD §11). Admins inspect, freeze and decide; they never edit
// transaction or bid data directly. Every action below is recorded in the audit trail.

export type AccountStatus = 'active' | 'restricted' | 'suspended'

export interface AdminUser {
  id: string
  name: string
  username: string
  email: string
  location?: string
  kind: 'person' | 'business'
  capabilities: Capability[]
  /** Identity verified by an admin. */
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
  reports: UserReport[]
  history: Transaction[]
  orgs: string[]
  audit: AuditEntry[]
}

export type UserAction = 'verify' | 'suspend' | 'restrict' | 'restore'

// ── Business verification ──

export type DocKind = 'nib' | 'npwp' | 'akta'
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'reupload'

export interface VerificationRequest {
  id: string
  business: string
  owner: string
  submittedAt: string
  status: VerificationStatus
  /** What the applicant typed into the form. */
  form: LabeledValue[]
  /** What the uploaded documents say (OCR in the real BE). Labels that also appear in `form` are compared. */
  documents: { kind: DocKind; fileName: string; fields: LabeledValue[] }[]
  decision?: { at: string; by: string; note: string }
}

export type VerificationAction = 'approve' | 'reject' | 'reupload'

// ── Markets ──

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

// ── Auctions ──

export interface Finding {
  id: string
  rule: string
  severity: 'low' | 'medium' | 'high'
  detail: string
}

export interface AdminBid {
  id: string
  /** Real identity; participants only ever see the masked label. */
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
  /** Null while a sealed auction is still open: bids are only unsealed after close. */
  bids: AdminBid[] | null
  caseId?: string
  audit: AuditEntry[]
}

export type AuctionAction = 'freeze' | 'unfreeze' | 'open_case'

// ── Disputes ──

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

// ── Fraud ──

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
  /** 'system' = engine recommendation; 'manual' = case opened by an admin. */
  source: 'system' | 'manual'
  title: string
  /** Risk score 0–100. */
  score: number
  /** Engine confidence 0–1. */
  confidence: number
  status: AlertStatus
  detectedAt: string
  subjects: Subject[]
  evidence: string[]
  /** Relation graph for network-type alerts. */
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

// ── Overview ──

export interface AdminOverview {
  queues: { users: number; verification: number; markets: number; auctions: number; disputes: number; fraud: number }
  newAlerts: FraudAlert[]
  openDisputes: DisputeSummary[]
  /** Items waiting longer than their review SLA. */
  sla: { module: 'verification' | 'disputes'; label: string; slaHours: number; total: number; breached: number; oldestAt?: string }[]
}
