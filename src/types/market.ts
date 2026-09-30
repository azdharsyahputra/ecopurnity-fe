export type MarketType = 'DIRECT_TRADE' | 'COLLECTIVE_PROCUREMENT' | 'REVERSE_AUCTION' | 'FORWARD_AUCTION' | 'SEALED_BID' | 'DUTCH_AUCTION'

export type MarketStatus = 'DRAFT' | 'FORMATION' | 'ACTIVE' | 'CLOSED'

export interface MarketFormationRequest {
  id: string
  opportunityId: string
  type: MarketType
  targetQuantity: number
  unit: string
  deadline: string // ISO date
  minSuppliers: number
  maxSuppliers?: number
  targetUnitPriceIdr: number
  status: MarketStatus
  createdBy: string // user id or business id
}

export interface Coalition {
  id: string
  name: string
  description: string
  membersCount: number
  totalCapacity: number
  unit: string
  status: 'FORMING' | 'READY'
}
