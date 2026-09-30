export type ReputationTier = 'TRUSTED_ELITE' | 'VERIFIED' | 'BUILDING' | 'NEW'

export interface ReputationBadge {
  id: string
  label: string
  description: string
  color: 'emerald' | 'blue' | 'amber' | 'indigo'
  earnedAt: string
}

export interface ReputationHistoryEntry {
  id: string
  transactionId: string
  title: string
  role: 'BUYER' | 'SUPPLIER'
  outcome: 'FULFILLED' | 'LATE' | 'DISPUTED' | 'CANCELLED'
  date: string
  impactScore: number // positive or negative delta
}

export interface ReputationProfile {
  userId: string
  tier: ReputationTier
  overallScore: number // 0-100
  fulfillmentRate: number
  onTimeDelivery: number
  disputeRate: number
  repeatContracts: number
  totalTransactions: number
  badges: ReputationBadge[]
  history: ReputationHistoryEntry[]
}
