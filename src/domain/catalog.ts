import type { AuctionType, CategoryId, MarketMechanism, MarketObjective, OpportunityKind, SearchType } from './types'
import type { Tone } from './status'



export const CATEGORIES: Record<CategoryId, { label: string; tone: Tone }> = {
  agri: { label: 'Pertanian', tone: 'green' },
  food: { label: 'Pangan', tone: 'orange' },
  packaging: { label: 'Kemasan', tone: 'yellow' },
  manufacturing: { label: 'Manufaktur', tone: 'gray' },
  logistics: { label: 'Logistik', tone: 'blue' },
  it: { label: 'Jasa IT', tone: 'purple' },
  energy: { label: 'Energi', tone: 'teal' },
}

export const REGIONS = ['DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Sumatera Utara']

export const MECHANISMS: Record<MarketMechanism, { label: string; hint: string }> = {
  forward_auction: { label: 'Forward auction', hint: 'Satu penjual, banyak pembeli; harga naik.' },
  reverse_auction: { label: 'Reverse auction', hint: 'Satu pembeli, banyak supplier; harga turun.' },
  sealed_bid: { label: 'Sealed bid', hint: 'Bid tertutup, dibuka saat penutupan.' },
  dutch_auction: { label: 'Dutch auction', hint: 'Harga turun bertahap; yang pertama menerima menang.' },
  direct_market: { label: 'Direct market', hint: 'Order langsung dengan harga terpasang.' },
  collective_procurement: { label: 'Collective procurement', hint: 'Banyak pembeli menggabungkan demand untuk harga skala.' },
}

export const OBJECTIVES: Record<MarketObjective, string> = {
  procurement: 'Procurement',
  selling: 'Selling',
  resource_exchange: 'Resource exchange',
  service_exchange: 'Service exchange',
}

export const OPPORTUNITY_KINDS: Record<OpportunityKind, { label: string; tone: Tone }> = {
  collective_demand: { label: 'Collective demand', tone: 'blue' },
  supply_gap: { label: 'Supply gap', tone: 'orange' },
  market_gap: { label: 'Market gap', tone: 'purple' },
  capacity_match: { label: 'Capacity match', tone: 'teal' },
}

export const AUCTION_TYPES: Record<AuctionType, { label: string; best: string }> = {
  reverse: { label: 'Reverse', best: 'Harga terendah' },
  forward: { label: 'Forward', best: 'Harga tertinggi' },
  sealed: { label: 'Sealed bid', best: 'Disembunyikan sampai tutup' },
  dutch: { label: 'Dutch', best: 'Harga saat ini' },
}

export const SEARCH_TYPES: Record<SearchType, string> = {
  product: 'Products',
  service: 'Services',
  business: 'Businesses',
  market: 'Markets',
  opportunity: 'Opportunities',
  auction: 'Auctions',
}
