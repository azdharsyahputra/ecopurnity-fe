import { http, HttpResponse, delay } from 'msw'
import {
  mockProfile,
  mockOpportunities,
  mockGraphData,
  mockAuctions,
  mockExecutionPlan,
  mockTransactions,
  mockReputation,
  mockMySupply,
  mockMyDemand,
  mockCoalitions,
  mockMarketIntelligence,
  mockBusinessDashboard,
  mockAdminDashboard,
} from './mockData'

export const handlers = [

  // Economic Identity
  http.get('/api/v1/profile/me', async () => {
    await delay(300)
    return HttpResponse.json(mockProfile)
  }),

  // Opportunity Engine
  http.get('/api/v1/opportunities', async () => {
    await delay(400)
    return HttpResponse.json(mockOpportunities)
  }),

  http.get('/api/v1/opportunities/graph', async ({ request }) => {
    await delay(400)
    const url = new URL(request.url)
    const oppId = url.searchParams.get('opp') ?? undefined
    return HttpResponse.json(mockGraphData(oppId))
  }),

  // Market & Auctions
  http.get('/api/v1/auctions', async () => {
    await delay(400)
    return HttpResponse.json(mockAuctions)
  }),

  http.post('/api/v1/auctions/:id/join', async ({ request }) => {
    await delay(500)
    const body = (await request.json()) as { quantity: number }
    return HttpResponse.json({
      message: 'Successfully joined order pool',
      addedQuantity: body.quantity,
    })
  }),

  http.post('/api/v1/auctions/:id/bid', async ({ request }) => {
    await delay(500)
    const body = (await request.json()) as { price: number; capacity: number }
    return HttpResponse.json({
      message: 'Bid submitted successfully',
      bid: body,
    })
  }),

  // Smart Allocation
  http.get('/api/v1/allocation/current', async () => {
    await delay(350)
    return HttpResponse.json(mockExecutionPlan)
  }),

  http.post('/api/v1/allocation/lock-escrow', async () => {
    await delay(600)
    return HttpResponse.json({
      message: 'Escrow locked successfully and smart contract executed.',
      status: 'ESCROW_LOCKED',
    })
  }),

  // Transaction Layer
  http.get('/api/v1/transactions', async () => {
    await delay(400)
    return HttpResponse.json(mockTransactions)
  }),

  http.get('/api/v1/transactions/:id', async ({ params }) => {
    await delay(300)
    const tx = mockTransactions.find((t) => t.id === params.id)
    if (!tx) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(tx)
  }),

  http.post('/api/v1/transactions/:id/proof', async () => {
    await delay(700)
    return HttpResponse.json({
      message: 'Proof of fulfillment submitted. Under review.',
      status: 'PROOF_SUBMITTED',
    })
  }),

  // Reputation Engine
  http.get('/api/v1/reputation/me', async () => {
    await delay(350)
    return HttpResponse.json(mockReputation)
  }),

  // Supply & Demand Registry 
  http.get('/api/v1/supply/me', async () => {
    await delay(300)
    return HttpResponse.json(mockMySupply)
  }),

  http.post('/api/v1/supply', async ({ request }) => {
    await delay(600)
    const body = await request.json()
    return HttpResponse.json({ message: 'Supply registered successfully.', data: body }, { status: 201 })
  }),

  http.get('/api/v1/demand/me', async () => {
    await delay(300)
    return HttpResponse.json(mockMyDemand)
  }),

  http.post('/api/v1/demand', async ({ request }) => {
    await delay(600)
    const body = await request.json()
    return HttpResponse.json({ message: 'Demand registered successfully.', data: body }, { status: 201 })
  }),

  // Market Formation
  http.post('/api/v1/markets', async ({ request }) => {
    await delay(600)
    const body = await request.json()
    return HttpResponse.json({ message: 'Market formation request created.', data: body }, { status: 201 })
  }),

  // Market Maker Coalitions
  http.get('/api/v1/coalitions', async () => {
    await delay(400)
    return HttpResponse.json(mockCoalitions)
  }),

  // Market Intelligence
  http.get('/api/v1/market-intelligence', async () => {
    await delay(350)
    return HttpResponse.json(mockMarketIntelligence)
  }),

  // Business Dashboard
  http.get('/api/v1/business/dashboard', async () => {
    await delay(350)
    return HttpResponse.json(mockBusinessDashboard)
  }),

  // Platform Admin Dashboard 
  http.get('/api/v1/admin/dashboard', async () => {
    await delay(300)
    return HttpResponse.json(mockAdminDashboard)
  }),

  // Admin Dispute Actions
  http.post('/api/v1/admin/disputes/:id/request-proof', async ({ params }) => {
    await delay(600)
    return HttpResponse.json({
      success: true,
      disputeId: params.id,
      action: 'PROOF_REQUESTED',
      message: 'Both parties have been notified to submit supporting documents within 48 hours.',
    })
  }),

  http.post('/api/v1/admin/disputes/:id/mediate', async ({ params, request }) => {
    await delay(800)
    const body = await request.json()
    return HttpResponse.json({
      success: true,
      disputeId: params.id,
      action: 'MEDIATION_INITIATED',
      ...(body as object),
    })
  }),
]