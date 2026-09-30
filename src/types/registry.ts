export type SupplyCategory =
  | 'PRODUCT'
  | 'SERVICE'
  | 'SKILL'
  | 'CAPACITY'
  | 'ASSET'
  | 'LOGISTICS'

export type DemandCategory =
  | 'PRODUCT'
  | 'SERVICE'
  | 'CAPACITY'
  | 'RESOURCE'
  | 'LOGISTICS'

export type UrgencyLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export interface SupplyEntry {
  id: string
  name: string
  category: SupplyCategory
  description: string
  quantity: string
  unit: string
  pricePerUnit?: number
  locationCity: string
  isActive: boolean
  createdAt: string
}

export interface DemandEntry {
  id: string
  name: string
  category: DemandCategory
  description: string
  quantity: string
  unit: string
  maxBudgetPerUnit?: number
  locationCity: string
  urgency: UrgencyLevel
  isActive: boolean
  createdAt: string
}
