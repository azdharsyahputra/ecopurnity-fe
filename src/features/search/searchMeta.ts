import { Briefcase, Building2, Gavel, Package, Sparkles, Store, type LucideIcon } from 'lucide-react'
import type { SearchType } from '@/domain/types'
import type { Tone } from '@/domain/status'

export const SEARCH_META: Record<SearchType, [LucideIcon, Tone]> = {
  product: [Package, 'yellow'],
  service: [Briefcase, 'purple'],
  business: [Building2, 'blue'],
  market: [Store, 'teal'],
  opportunity: [Sparkles, 'lime'],
  auction: [Gavel, 'orange'],
}

/** Display order of result groups (PRD §6.6). */
export const SEARCH_ORDER: SearchType[] = ['product', 'service', 'business', 'market', 'opportunity', 'auction']
