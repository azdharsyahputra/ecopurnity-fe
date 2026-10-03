// API contract types (PRD §13). camelCase JSON, ISO 8601 UTC times, money as integer Rupiah.
// Feature-specific entities are added here as each feature is built.

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
