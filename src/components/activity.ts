import { CircleCheck, Gavel, Hammer, Sparkles, Store, TrendingDown, type LucideIcon } from 'lucide-react'
import type { ActivityType } from '@/domain/types'
import type { Tone } from '@/domain/status'

export const ACTIVITY_META: Record<ActivityType, [LucideIcon, Tone]> = {
  opportunity_detected: [Sparkles, 'lime'],
  market_formed: [Store, 'teal'],
  auction_started: [Gavel, 'blue'],
  bid_placed: [TrendingDown, 'orange'],
  auction_closed: [Hammer, 'purple'],
  transaction_completed: [CircleCheck, 'green'],
}
