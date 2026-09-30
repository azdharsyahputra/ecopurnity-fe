import type { EconomicProfile } from '@/types/economic'
import type { OpportunityItem } from '@/types/opportunity'
import type { MarketAuctionItem } from '@/types/auction'
import type { ExecutionPlan } from '@/types/allocation'
import type { Transaction } from '@/types/transaction'
import type { ReputationProfile } from '@/types/reputation'
import type { SupplyEntry, DemandEntry } from '@/types/registry'
import type { Coalition } from '@/types/market'

// Economic Identity
export const mockProfile: EconomicProfile = {
  id: 'usr-001',
  name: 'Ajar (PT Solusi Teknologi)',
  entityType: 'BUSINESS',
  headline: 'Digital Services & Infrastructure Provider',
  capacities: [
    { id: 'c1', name: 'Backend Development', category: 'Skill', amount: '12 hrs/week' },
    { id: 'c2', name: 'Packaging Production', category: 'Production', amount: '5,000 units/day' },
  ],
  assets: [
    { id: 'a1', name: 'MacBook Pro M2', category: 'Hardware', details: 'Development Workstation' },
    { id: 'a2', name: 'Cloud Infrastructure', category: 'Infrastructure', details: 'AWS / GCP Credits' },
  ],
  demands: [
    { id: 'd1', name: 'GPU Compute', quantity: '2 hrs/day', urgency: 'HIGH' },
    { id: 'd2', name: 'Packaging Box A', quantity: '10,000 pcs/month', urgency: 'MEDIUM' },
  ],
  stats: {
    totalTransactions: 14,
    reliabilityScore: 97,
    fulfillmentRate: 98,
    onTimeDelivery: 96,
    disputeRate: 1.2,
  },
}

// Opportunity Feed
export const mockOpportunities: OpportunityItem[] = [
  {
    id: 'opp-101',
    title: 'Packaging Box A Aggregation',
    type: 'COLLECTIVE_DEMAND',
    category: 'Manufacturing',
    description: '37 local businesses require high-volume corrugated packaging boxes.',
    buyersCount: 37,
    aggregatedDemandAmount: 840000,
    unit: 'units/month',
    currentSupplyAmount: 520000,
    potentialValueIdr: 'Rp 1.3B/month',
    locationRadiusKm: 25,
    status: 'DISCOVERY',
  },
  {
    id: 'opp-102',
    title: 'Backend Development Supply Gap',
    type: 'SUPPLY_GAP',
    category: 'IT Services',
    description: 'High demand for Senior Golang/React developers exceeding available regional capacity.',
    buyersCount: 12,
    aggregatedDemandAmount: 1240,
    unit: 'hours/month',
    currentSupplyAmount: 730,
    potentialValueIdr: 'Rp 450M/month',
    locationRadiusKm: 50,
    status: 'DISCOVERY',
  },
  {
    id: 'opp-103',
    title: 'Bulk Cooking Oil Coalition',
    type: 'COLLECTIVE_DEMAND',
    category: 'Food & Beverage',
    description: '14 restaurants pooling demand for direct factory pricing.',
    buyersCount: 14,
    aggregatedDemandAmount: 3200,
    unit: 'Liters/month',
    currentSupplyAmount: 0,
    potentialValueIdr: 'Rp 54M/month',
    locationRadiusKm: 15,
    status: 'DISCOVERY',
  },
]

// Opportunity Graph (per opportunity ID)
const graphByOpportunity: Record<string, { nodes: object[]; edges: object[] }> = {
  'opp-101': {
    nodes: [
      { id: 'b1', position: { x: 50, y: 50 }, data: { label: 'PT ABC (Buyer)', role: 'BUYER', detail: 'Needs 10,000 units/month' }, type: 'default' },
      { id: 'b2', position: { x: 50, y: 180 }, data: { label: 'Kopi Makmur (Buyer)', role: 'BUYER', detail: 'Needs 5,000 units/month' }, type: 'default' },
      { id: 'b3', position: { x: 50, y: 310 }, data: { label: 'Resto Gurih (Buyer)', role: 'BUYER', detail: 'Needs 2,000 units/month' }, type: 'default' },
      { id: 'm1', position: { x: 250, y: 180 }, data: { label: 'Ecopurnity MM', role: 'MARKET_MAKER', detail: 'Pooling 37 buyers → 840k units' }, type: 'default' },
      { id: 'd1', position: { x: 450, y: 180 }, data: { label: '⚡ PACKAGING DEMAND', role: 'DEMAND', detail: 'Combined: 840,000 units/month' }, type: 'default' },
      { id: 's1', position: { x: 700, y: 80 }, data: { label: 'CV Box Utama', role: 'SUPPLIER', detail: 'Cap: 500k units — Rp 1,450/unit' }, type: 'default' },
      { id: 's2', position: { x: 700, y: 280 }, data: { label: 'PT Packaging Nusantara', role: 'SUPPLIER', detail: 'Cap: 600k units — Rp 1,500/unit' }, type: 'default' },
    ],
    edges: [
      { id: 'e-b1-m1', source: 'b1', target: 'm1', animated: true, label: '10k units' },
      { id: 'e-b2-m1', source: 'b2', target: 'm1', animated: true, label: '5k units' },
      { id: 'e-b3-m1', source: 'b3', target: 'm1', animated: true, label: '2k units' },
      { id: 'e-m1-d1', source: 'm1', target: 'd1', animated: true, label: 'Aggregate 840k' },
      { id: 'e-d1-s1', source: 'd1', target: 's1', label: 'Allocated 59.5%' },
      { id: 'e-d1-s2', source: 'd1', target: 's2', label: 'Allocated 40.5%' },
    ],
  },
  'opp-102': {
    nodes: [
      { id: 'c1', position: { x: 50, y: 50 }, data: { label: 'PT Digital Maju (Buyer)', role: 'BUYER', detail: 'Needs 200 hrs/month backend dev' }, type: 'default' },
      { id: 'c2', position: { x: 50, y: 200 }, data: { label: 'Startup Fintech X (Buyer)', role: 'BUYER', detail: 'Needs 150 hrs/month Golang' }, type: 'default' },
      { id: 'c3', position: { x: 50, y: 350 }, data: { label: 'CV Inovasi (Buyer)', role: 'BUYER', detail: 'Needs 100 hrs/month React' }, type: 'default' },
      { id: 'gap', position: { x: 380, y: 200 }, data: { label: '⚡ SUPPLY GAP', role: 'DEMAND', detail: 'Gap: 510 hrs/month — Rp 450M potential' }, type: 'default' },
      { id: 'dev1', position: { x: 680, y: 50 }, data: { label: 'Ajar (PT Solusi Tek.)', role: 'SUPPLIER', detail: 'Cap: 12 hrs/week Golang+React' }, type: 'default' },
      { id: 'dev2', position: { x: 680, y: 200 }, data: { label: 'IndieDevs Collective', role: 'SUPPLIER', detail: 'Cap: 40 hrs/week various stack' }, type: 'default' },
      { id: 'dev3', position: { x: 680, y: 350 }, data: { label: 'Tech Innovators Ltd.', role: 'SUPPLIER', detail: 'Cap: 120 hrs/week DevOps+BE' }, type: 'default' },
    ],
    edges: [
      { id: 'e-c1-gap', source: 'c1', target: 'gap', animated: true, label: '200 hrs' },
      { id: 'e-c2-gap', source: 'c2', target: 'gap', animated: true, label: '150 hrs' },
      { id: 'e-c3-gap', source: 'c3', target: 'gap', animated: true, label: '100 hrs' },
      { id: 'e-gap-dev1', source: 'gap', target: 'dev1', label: 'Partial Match' },
      { id: 'e-gap-dev2', source: 'gap', target: 'dev2', label: 'Partial Match' },
      { id: 'e-gap-dev3', source: 'gap', target: 'dev3', label: 'Partial Match' },
    ],
  },
  'opp-103': {
    nodes: [
      { id: 'r1', position: { x: 30, y: 30 }, data: { label: 'Warung Padang Jaya', role: 'BUYER', detail: 'Needs 300 L/month cooking oil' }, type: 'default' },
      { id: 'r2', position: { x: 30, y: 160 }, data: { label: 'Resto Gurih Sejati', role: 'BUYER', detail: 'Needs 250 L/month cooking oil' }, type: 'default' },
      { id: 'r3', position: { x: 30, y: 290 }, data: { label: 'Catering Berkah', role: 'BUYER', detail: 'Needs 500 L/month cooking oil' }, type: 'default' },
      { id: 'r4', position: { x: 30, y: 420 }, data: { label: '+ 11 Restaurants', role: 'BUYER', detail: '~2,150 L/month combined' }, type: 'default' },
      { id: 'pool', position: { x: 340, y: 220 }, data: { label: '⚡ OIL COALITION', role: 'DEMAND', detail: 'Combined: 3,200 L/month — No supplier yet' }, type: 'default' },
      { id: 'action', position: { x: 620, y: 220 }, data: { label: '🔔 FORM MARKET', role: 'MARKET_MAKER', detail: 'Open auction to attract oil suppliers' }, type: 'default' },
    ],
    edges: [
      { id: 'e-r1', source: 'r1', target: 'pool', animated: true, label: '300 L' },
      { id: 'e-r2', source: 'r2', target: 'pool', animated: true, label: '250 L' },
      { id: 'e-r3', source: 'r3', target: 'pool', animated: true, label: '500 L' },
      { id: 'e-r4', source: 'r4', target: 'pool', animated: true, label: '2,150 L' },
      { id: 'e-pool-action', source: 'pool', target: 'action', animated: true, label: 'Form Market →' },
    ],
  },
}

/** Returns graph data for a specific opportunity ID. Falls back to opp-101. */
export const mockGraphData = (oppId?: string) =>
  graphByOpportunity[oppId ?? 'opp-101'] ?? graphByOpportunity['opp-101']

// Market & Auctions
export const mockAuctions: MarketAuctionItem[] = [
  {
    id: 'auc-201',
    title: 'Consortium: Corrugated Packaging Box A',
    category: 'Manufacturing',
    status: 'BIDDING_OPEN',
    targetQuantity: 1000000,
    currentPooledQuantity: 840000,
    unit: 'units',
    baselineUnitPriceIdr: 2500,
    targetUnitPriceIdr: 1500,
    deadline: '2026-10-15T23:59:59Z',
    buyersCount: 37,
    bids: [
      {
        id: 'bid-1',
        supplierId: 'sup-88',
        supplierName: 'CV Box Utama',
        supplierReliability: 98,
        offeredPricePerUnitIdr: 1450,
        capacityOffered: 500000,
        submittedAt: '2 jam yang lalu',
      },
      {
        id: 'bid-2',
        supplierId: 'sup-99',
        supplierName: 'PT Packaging Nusantara',
        supplierReliability: 94,
        offeredPricePerUnitIdr: 1500,
        capacityOffered: 600000,
        submittedAt: '5 jam yang lalu',
      },
    ],
  },
  {
    id: 'auc-202',
    title: 'Pool Order: High-Grade Robusta Coffee Beans',
    category: 'Agriculture',
    status: 'OPEN_POOLING',
    targetQuantity: 5000,
    currentPooledQuantity: 3200,
    unit: 'Kg',
    baselineUnitPriceIdr: 95000,
    targetUnitPriceIdr: 72000,
    deadline: '2026-10-20T18:00:00Z',
    buyersCount: 14,
    bids: [],
  },
]

// Smart Allocation
export const mockExecutionPlan: ExecutionPlan = {
  id: 'exec-901',
  auctionTitle: 'Consortium: Corrugated Packaging Box A',
  totalDemandQuantity: 840000,
  unit: 'units',
  totalValueIdr: 1228000000,
  weightedAveragePriceIdr: 1461.9,
  totalSavingsIdr: 872000000,
  status: 'OPTIMIZED',
  createdAt: '2026-09-28T10:00:00Z',
  allocations: [
    {
      supplierId: 'sup-88',
      supplierName: 'CV Box Utama',
      allocatedQuantity: 500000,
      unitPriceIdr: 1450,
      totalCostIdr: 725000000,
      sharePercentage: 59.5,
      reliabilityScore: 98,
    },
    {
      supplierId: 'sup-99',
      supplierName: 'PT Packaging Nusantara',
      allocatedQuantity: 340000,
      unitPriceIdr: 1479,
      totalCostIdr: 503000000,
      sharePercentage: 40.5,
      reliabilityScore: 94,
    },
  ],
}

// Transactions
export const mockTransactions: Transaction[] = [
  {
    id: 'tx-001',
    title: 'Consortium: Corrugated Packaging Box A',
    category: 'Manufacturing',
    role: 'BUYER',
    status: 'IN_FULFILLMENT',
    totalValueIdr: 1228000000,
    totalQuantity: 840000,
    unit: 'units',
    counterpartyName: 'Multi-Supplier Consortium',
    counterpartyCount: 2,
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-09-29T08:00:00Z',
    deadline: '2026-10-30T23:59:59Z',
    savingsIdr: 872000000,
    invoiceItems: [
      { supplierId: 'sup-88', supplierName: 'CV Box Utama', quantity: 500000, unit: 'units', unitPriceIdr: 1450, subtotalIdr: 725000000 },
      { supplierId: 'sup-99', supplierName: 'PT Packaging Nusantara', quantity: 340000, unit: 'units', unitPriceIdr: 1479, subtotalIdr: 503000000 },
    ],
  },
  {
    id: 'tx-002',
    title: 'Pool Order: High-Grade Robusta Coffee Beans',
    category: 'Agriculture',
    role: 'SUPPLIER',
    status: 'AGREEMENT',
    totalValueIdr: 230400000,
    totalQuantity: 3200,
    unit: 'Kg',
    counterpartyName: 'Bulk Cooking Oil Coalition',
    counterpartyCount: 14,
    createdAt: '2026-09-25T14:00:00Z',
    updatedAt: '2026-09-25T14:00:00Z',
    deadline: '2026-10-20T18:00:00Z',
    invoiceItems: [
      { supplierId: 'usr-001', supplierName: 'PT Solusi Teknologi', quantity: 3200, unit: 'Kg', unitPriceIdr: 72000, subtotalIdr: 230400000 },
    ],
  },
  {
    id: 'tx-003',
    title: 'Backend Development Services — Sprint Contract',
    category: 'IT Services',
    role: 'SUPPLIER',
    status: 'COMPLETED',
    totalValueIdr: 48000000,
    totalQuantity: 80,
    unit: 'hours',
    counterpartyName: 'PT Digital Maju',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-30T17:00:00Z',
    deadline: '2026-09-30T23:59:59Z',
    invoiceItems: [
      { supplierId: 'usr-001', supplierName: 'PT Solusi Teknologi', quantity: 80, unit: 'hours', unitPriceIdr: 600000, subtotalIdr: 48000000 },
    ],
    proofUrl: '/proof/tx-003-delivery.pdf',
  },
]

// Reputation
export const mockReputation: ReputationProfile = {
  userId: 'usr-001',
  tier: 'TRUSTED_ELITE',
  overallScore: 97,
  fulfillmentRate: 98,
  onTimeDelivery: 96,
  disputeRate: 1.2,
  repeatContracts: 43,
  totalTransactions: 14,
  badges: [
    { id: 'b1', label: 'Trusted Supplier', description: 'Fulfilled 10+ orders with 95%+ rate', color: 'emerald', earnedAt: '2026-07-01' },
    { id: 'b2', label: 'Reliable Buyer', description: 'Zero payment defaults across all transactions', color: 'blue', earnedAt: '2026-08-15' },
    { id: 'b3', label: 'Coalition Leader', description: 'Initiated 3+ collective procurements', color: 'indigo', earnedAt: '2026-09-01' },
  ],
  history: [
    { id: 'h1', transactionId: 'tx-003', title: 'Backend Development Contract', role: 'SUPPLIER', outcome: 'FULFILLED', date: '2026-09-30', impactScore: +2.1 },
    { id: 'h2', transactionId: 'tx-002', title: 'Coffee Beans Pool Order', role: 'SUPPLIER', outcome: 'FULFILLED', date: '2026-09-10', impactScore: +1.8 },
    { id: 'h3', transactionId: 'tx-old-1', title: 'Logistics Capacity Rental', role: 'BUYER', outcome: 'LATE', date: '2026-08-20', impactScore: -0.5 },
    { id: 'h4', transactionId: 'tx-old-2', title: 'Packaging Supply A', role: 'BUYER', outcome: 'FULFILLED', date: '2026-08-01', impactScore: +1.5 },
  ],
}

// Supply & Demand Registry
export const mockMySupply: SupplyEntry[] = [
  { id: 'sp-1', name: 'Backend Development', category: 'SKILL', description: 'Golang, Node.js, React — senior level', quantity: '12', unit: 'hrs/week', pricePerUnit: 600000, locationCity: 'Jakarta', isActive: true, createdAt: '2026-08-01' },
  { id: 'sp-2', name: 'Packaging Production (Box A)', category: 'CAPACITY', description: 'Corrugated Box A capacity per day', quantity: '5000', unit: 'units/day', pricePerUnit: 1450, locationCity: 'Bekasi', isActive: true, createdAt: '2026-08-15' },
]

export const mockMyDemand: DemandEntry[] = [
  { id: 'dm-1', name: 'GPU Compute', category: 'RESOURCE', description: 'High-end GPU for ML training workloads', quantity: '2', unit: 'hrs/day', maxBudgetPerUnit: 150000, locationCity: 'Jakarta', urgency: 'HIGH', isActive: true, createdAt: '2026-09-01' },
  { id: 'dm-2', name: 'Packaging Box A', category: 'PRODUCT', description: 'Corrugated packaging boxes, standard size', quantity: '10000', unit: 'pcs/month', maxBudgetPerUnit: 2000, locationCity: 'Jakarta', urgency: 'MEDIUM', isActive: true, createdAt: '2026-09-10' },
]

// Market Maker Coalitions
export const mockCoalitions: Coalition[] = [
  {
    id: 'c-001',
    name: 'Packaging Procurement Syndicate',
    description: 'Pool demand for eco-friendly packaging boxes.',
    membersCount: 4,
    totalCapacity: 50000,
    unit: 'pcs',
    status: 'FORMING',
  },
  {
    id: 'c-002',
    name: 'Local Logistics Hub',
    description: 'Shared delivery fleet for last-mile routes.',
    membersCount: 12,
    totalCapacity: 1500,
    unit: 'km/day',
    status: 'READY',
  },
]

// Market Intelligence
export const mockMarketIntelligence = {
  stats: {
    aggregatedDemandIdr: 14500000000,
    aggregatedDemandChange: 12.5,
    unusedCapacityUnits: 42500,
    unusedCapacityNote: 'Across 12 top manufacturers',
    criticalSupplyGapIdr: 3200000000,
    criticalSupplyGapNote: 'Highest in Eco Packaging',
    marketLiquidity: 'High',
    activeAuctions: 34,
  },
  demandTrends: [
    { category: 'Recycled Packaging', growth: 45, volumeIdr: 4500000000 },
    { category: 'Last-Mile Logistics', growth: 28, volumeIdr: 2100000000 },
    { category: 'Solar Panel Maintenance', growth: 15, volumeIdr: 900000000 },
    { category: 'Raw Organic Materials', growth: -5, volumeIdr: 1200000000 },
  ],
  unusedCapacity: [
    { supplierName: 'PT Surya Printing', resource: 'Offset Printing Press', amount: '12,000 hrs', utilizationPercent: 45 },
    { supplierName: 'EcoFleet Logistics', resource: 'Electric Delivery Vans', amount: '800 trips', utilizationPercent: 60 },
    { supplierName: 'CV Makmur Sentosa', resource: 'Warehouse Space', amount: '4,500 m²', utilizationPercent: 30 },
    { supplierName: 'Tech Innovators', resource: 'Developer Hours', amount: '120 hrs/week', utilizationPercent: 85 },
  ],
  topOpportunities: [
    { title: 'Corporate Eco-Packaging', gapLabel: '500,000 units', valueIdr: 1500000000, demanders: 12 },
    { title: 'EV Fleet Leasing', gapLabel: '50 vehicles', valueIdr: 800000000, demanders: 4 },
    { title: 'Solar Installation', gapLabel: '200 kWp', valueIdr: 1200000000, demanders: 8 },
  ],
}

// Business Dashboard
export const mockBusinessDashboard = {
  stats: {
    activeProcurement: 14,
    totalSuppliers: 124,
    spendEfficiencyPercent: 12.4,
    activeFormations: 3,
  },
  recentProcurement: [
    { id: 'p-1', name: 'Eco Packaging Supply Q3', status: 'IN_FULFILLMENT', deadlineDate: '2026-10-12', valueIdr: 120000000 },
    { id: 'p-2', name: 'Raw Material Delivery Fleet', status: 'PENDING_ALLOCATION', deadlineDate: '2026-10-15', valueIdr: 45000000 },
    { id: 'p-3', name: 'Solar Panel Maintenance', status: 'COMPLETED', deadlineDate: '2026-09-28', valueIdr: 18000000 },
  ],
  topSuppliers: [
    { id: 's-1', name: 'CV Eco Logistik', reliabilityScore: 98, tier: 'Tier 1' },
    { id: 's-2', name: 'PT Surya Packaging', reliabilityScore: 95, tier: 'Tier 1' },
    { id: 's-3', name: 'Mandiri Services', reliabilityScore: 89, tier: 'Tier 2' },
  ],
}

// Platform Admin Dashboard
export const mockAdminDashboard = {
  stats: {
    activeDisputes: 12,
    pendingVerifications: 45,
    fraudFlags: 3,
  },
  fraudLogs: [
    {
      id: 'fl-1',
      title: 'Suspicious Bid Pattern',
      description: 'Supplier CV Makmur submitted 5 bids within 1 second across different markets.',
      severity: 'HIGH',
      entityName: 'CV Makmur Sentosa',
    },
    {
      id: 'fl-2',
      title: 'Capacity Anomaly',
      description: 'PT Abadi claimed 10M units/day capacity but historical average is only 50k.',
      severity: 'MEDIUM',
      entityName: 'PT Abadi Jaya',
    },
    {
      id: 'fl-3',
      title: 'Repeated Identity Change',
      description: 'User changed registered business name 3 times in 7 days.',
      severity: 'LOW',
      entityName: 'Unknown Entity',
    },
  ],
  disputes: [
    {
      id: 'dp-1',
      txRef: 'TX-882',
      issue: 'Quality Issue',
      escrowAmount: 45000000,
      buyerClaim: 'Buyer rejected delivery citing 30% defect rate. Supplier claims perfect quality.',
      supplierResponse: 'The goods were inspected before shipping and met all quality standards. The buyer may have mishandled the products upon arrival.',
      status: 'OPEN',
      daysOpen: 2,
    },
    {
      id: 'dp-2',
      txRef: 'TX-875',
      issue: 'Late Delivery',
      escrowAmount: 22000000,
      buyerClaim: 'Goods arrived 14 days late, causing downstream production halt.',
      supplierResponse: 'The delay was caused by extreme weather conditions at the port, which is an event of Force Majeure. We communicated this immediately.',
      status: 'IN_REVIEW',
      daysOpen: 5,
    },
  ],
  auditTrail: [
    { time: '10:42 AM', event: 'New Market Formed: Coal Consortium', by: 'System Engine' },
    { time: '09:15 AM', event: 'Escrow Released: TX-879', by: 'Smart Contract' },
    { time: '08:30 AM', event: 'Supplier Verification Approved: PT Maju Bersama', by: 'Admin (System)' },
    { time: '07:55 AM', event: 'Auction Closed: Packaging Box A Consortium', by: 'Auction Engine' },
    { time: '07:00 AM', event: 'New Fraud Flag Raised: CV Makmur (bid anomaly)', by: 'AI Detector' },
  ],
}
