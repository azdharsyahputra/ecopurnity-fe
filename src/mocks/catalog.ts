import { delay, http, HttpResponse } from 'msw'
import type { CategoryId, Listing, Page, PublicListing } from '@/domain/types'
import { priceSuggestion } from '@/domain/pricing'
import { admin } from './admin'
import { db } from './db'
import { economy } from './economy'
import { allPersonal } from './personal'
import { ops, hash } from './mm'

// Public listing catalog + price suggestion (PRD F6).

const api = (path: string) => `/api/v1${path}`
const PUBLIC_STATUS = ['available', 'in_market', 'open', 'matched']
const unitPrice = (l: Listing) => (l.kind === 'supply' ? l.priceIdr : Math.round(l.budgetIdr / Math.max(1, l.quantity.value)))

function userListings(): PublicListing[] {
  return allPersonal().flatMap(([userId, p]) => {
    const u = db.users.find((x) => x.id === userId)
    if (!u || ['restricted', 'suspended'].includes(admin.users[userId]?.status ?? 'active')) return []
    const verified = p.identity.profile.verification.identity === 'verified' || !!admin.users[userId]?.verified
    return p.listings
      .map((s) => s.listing)
      .filter((l) => PUBLIC_STATUS.includes(l.status))
      .map(({ id, code, kind, item, categoryId, quantity, location, spec, delivery, marketId, createdAt, ...rest }) => ({
        id, code, kind, item, categoryId, quantity, location, spec, delivery, marketId, createdAt,
        unitPriceIdr: unitPrice({ kind, quantity, ...rest } as Listing), owner: { name: u.name, username: u.username, userId, verified },
      }))
  })
}

// ponytail: fictional listings derived from markets so the catalog isn't empty in demos.
let seeded: PublicListing[] | null = null
function marketListings(): PublicListing[] {
  return (seeded ??= economy.markets.flatMap((m) => {
    const ref = m.priceHistory[m.priceHistory.length - 1]?.medianIdr ?? m.priceRange.minIdr
    const people = ops(m.id).participants.filter((x) => !x.userId)
    return [0, 1, 2].flatMap((i) => {
      const who = people[(hash(m.id) + i) % Math.max(1, people.length)]
      if (!who) return []
      const kind = who.role === 'supplier' ? 'supply' : 'demand'
      const h = hash(`${m.id}${i}`)
      const qty = Math.max(1, Math.round((m.demand.value / 20) * (0.5 + (h % 100) / 100)))
      return [{
        id: `pl-${m.id}-${i}`, code: `${kind === 'supply' ? 'SUP' : 'DEM'}-${(h % 9000) + 1000}`, kind, item: m.name.replace(/\s+Q\d.*$/, ''),
        categoryId: m.categoryId, quantity: { value: qty, unit: m.priceRange.unit }, location: m.region, spec: 'Sesuai standar market',
        delivery: 'both', createdAt: new Date(Date.now() - (h % 20) * 864e5).toISOString(),
        unitPriceIdr: Math.round((ref * (0.9 + (h % 20) / 100)) / 50) * 50, owner: { name: who.name, verified: who.status === 'active' },
      } satisfies PublicListing]
    })
  }))
}

const catalog = () => [...userListings(), ...marketListings()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

export const catalogHandlers = [
  http.get(api('/listings'), async ({ request }) => {
    await delay(250)
    const p = new URL(request.url).searchParams
    const term = p.get('q')?.toLowerCase()
    const list = catalog().filter((l) =>
      (!term || `${l.item} ${l.code} ${l.owner.name}`.toLowerCase().includes(term)) && (!p.get('category') || l.categoryId === p.get('category')) &&
      (!p.get('region') || l.location.includes(p.get('region')!)) && (!p.get('kind') || l.kind === p.get('kind')),
    )
    const page = Math.max(1, Number(p.get('page') ?? 1))
    const pageSize = Math.min(50, Number(p.get('pageSize') ?? 12))
    return HttpResponse.json({ data: list.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: list.length } } satisfies Page<PublicListing>)
  }),

  http.get(api('/listings/price-suggestion'), async ({ request }) => {
    await delay(200)
    const p = new URL(request.url).searchParams
    const category = p.get('category') as CategoryId | null
    const unit = p.get('unit')?.trim().toLowerCase()
    // Same category and unit; narrowed to items sharing a word with `item` when that leaves enough data.
    const words = (p.get('item') ?? '').toLowerCase().split(/\W+/).filter((w) => w.length >= 4)
    const like = (text: string) => words.some((w) => text.toLowerCase().includes(w))
    const allMarkets = economy.markets.filter((m) => m.categoryId === category && m.priceRange.unit.toLowerCase() === unit)
    const allListings = catalog().filter((l) => l.categoryId === category && l.quantity.unit.toLowerCase() === unit && l.id !== p.get('exclude'))
    const pick = (narrow: boolean) => {
      const markets = narrow ? allMarkets.filter((m) => like(m.name)) : allMarkets
      const samples = [...markets.flatMap((m) => m.priceHistory.slice(-8).map((x) => x.medianIdr)), ...(narrow ? allListings.filter((l) => like(l.item)) : allListings).map((l) => l.unitPriceIdr)]
      return { markets, s: priceSuggestion(samples) }
    }
    const narrowed = words.length ? pick(true) : null
    const { markets, s } = narrowed?.s ? narrowed : pick(false)
    return HttpResponse.json(s && { ...s, unit, markets: markets.map((m) => ({ id: m.id, name: m.name })) })
  }),
]
