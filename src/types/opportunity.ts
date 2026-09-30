export interface OpportunityItem {
  id: string
  title: string
  type: 'COLLECTIVE_DEMAND' | 'SUPPLY_GAP' | 'CAPACITY_MATCH'
  category: string
  description: string
  buyersCount: number
  aggregatedDemandAmount: number
  unit: string
  currentSupplyAmount: number
  potentialValueIdr: string // Contoh: "Rp 1.3B/month"
  locationRadiusKm: number
  status: 'DISCOVERY' | 'MARKET_FORMED'
}

// Format khusus node untuk React Flow
export interface GraphNodeData {
  label: string
  role: 'BUYER' | 'DEMAND' | 'SUPPLIER'
  detail?: string
  amount?: string
}