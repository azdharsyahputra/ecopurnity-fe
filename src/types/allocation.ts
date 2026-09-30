export interface SupplierAllocation {
  supplierId: string
  supplierName: string
  allocatedQuantity: number
  unitPriceIdr: number
  totalCostIdr: number
  sharePercentage: number
  reliabilityScore: number
}

export interface ExecutionPlan {
  id: string
  auctionTitle: string
  totalDemandQuantity: number
  unit: string
  totalValueIdr: number
  weightedAveragePriceIdr: number
  totalSavingsIdr: number
  allocations: SupplierAllocation[]
  status: 'OPTIMIZED' | 'ESCROW_LOCKED' | 'IN_FULFILLMENT' | 'COMPLETED'
  createdAt: string
}