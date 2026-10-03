import type { Auction, CategoryId, Identity, Market, Quantity } from '@/domain/types'
import type { MatchParts } from '@/domain/matching'
import type { ReputationCounts } from '@/domain/reputation'

// Smart Matching inbox + public profiles API contract (PRD §8.6, public profiles).

export type MatchState = 'new' | 'saved' | 'connected' | 'dismissed'

export interface Match {
  id: string
  /** What the user brings: a supply listing or an identity item. */
  have: { source: 'supply' | 'identity'; id: string; label: string; detail: string }
  /** What the opportunity is short of. */
  need: { opportunityId: string; title: string; region: string; categoryId: CategoryId; gap: Quantity; detail: string }
  distanceKm: number
  estimatedValueIdr: number
  score: number
  parts: MatchParts
  state: MatchState
}

export type MatchAction = 'connect' | 'save' | 'dismiss' | 'reset'

export interface ProfileReputation {
  score: number
  counts: ReputationCounts
}

export interface ProfileActivity {
  id: string
  title: string
  at: string
}

export interface PublicProfile {
  name: string
  username: string
  location: string
  bio: string
  joinedAt?: string
  status: 'active' | 'restricted' | 'suspended'
  verification: Identity['profile']['verification']
  reputation: ProfileReputation
  supply: { id: string; item: string; categoryId: CategoryId; quantity: Quantity; priceIdr: number }[]
  markets: Pick<Market, 'id' | 'code' | 'name' | 'categoryId' | 'region'>[]
  orgs: { name: string; slug: string }[]
  activity: ProfileActivity[]
}

export interface BusinessProfile {
  name: string
  slug: string
  region: string
  description: string
  verified: boolean
  documents: string[]
  reputation: ProfileReputation
  markets: Market[]
  auctions: Auction[]
  activity: ProfileActivity[]
}
