export interface BidItem {
  id: string
  supplierId: string
  supplierName: string
  supplierReliability: number // 0 - 100%
  offeredPricePerUnitIdr: number
  capacityOffered: number
  submittedAt: string
}

export interface MarketAuctionItem {
  id: string
  title: string
  category: string
  status: 'OPEN_POOLING' | 'BIDDING_OPEN' | 'MATCHED' | 'EXECUTED'
  targetQuantity: number
  currentPooledQuantity: number
  unit: string
  baselineUnitPriceIdr: number // Harga eceran normal
  targetUnitPriceIdr: number // Target harga grosir kolektif
  deadline: string
  buyersCount: number
  bids: BidItem[]
}