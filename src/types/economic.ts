export interface CapacityItem {
  id: string
  name: string
  category: 'Skill' | 'Production' | 'Logistics' | 'Service'
  amount: string // Contoh: "12 hrs/week" atau "5,000 units/day"
}

export interface AssetItem {
  id: string
  name: string
  category: 'Hardware' | 'Infrastructure' | 'Vehicle' | 'Raw Material'
  details: string
}

export interface DemandItem {
  id: string
  name: string
  quantity: string // Contoh: "2 hrs/day" atau "10,000 packaging/month"
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
}
    
export interface EconomicProfile {
  id: string
  name: string
  entityType: 'PARTICIPANT' | 'BUSINESS' | 'MARKET_MAKER' | 'ADMIN'
  headline: string
  capacities: CapacityItem[]
  assets: AssetItem[]
  demands: DemandItem[]
  stats: {
    totalTransactions: number
    reliabilityScore: number
    fulfillmentRate: number
    onTimeDelivery: number
    disputeRate: number
  }
}