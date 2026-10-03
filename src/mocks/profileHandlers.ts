import { delay, http, HttpResponse } from 'msw'
import type { CategoryId, SupplyListing } from '@/domain/types'
import { estimateMatchValue, itemCategory, scoreMatch } from '@/domain/matching'
import { reputationReport, reputationScore, type ReputationTx } from '@/domain/reputation'
import type { BusinessProfile, Match, MatchAction, MatchState, PublicProfile } from '@/features/reputation/types'
import { slugify } from '@/features/reputation/slug'
import { db } from './db'
import { economy, toAuction } from './economy'
import { notify, personal, savePersonal } from './personal'
import { admin } from './admin'
import { botReply, createConversation } from './rfq'

// Smart Matching, reputation and public profiles (PRD §8.6, §8.10).

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString()

// ── Reputation input ─────────────────────────────────────────────

const PAST_PARTNERS = ['Kedai Kopi Senja', 'PT Rasa Nusantara', 'Koperasi Mitra Tani', 'UD Makmur Jaya', 'CV Sumber Pangan']

/**
 * Demo accounts get a year of finished transactions behind their live ones so the trend has shape.
 * ponytail: deterministic per key; real history arrives with the BE.
 */
function pastTransactions(key: string): ReputationTx[] {
  if (key.startsWith('usr-new-')) return []
  const h = hash(key)
  return Array.from({ length: 10 + (h % 6) }, (_, i) => {
    const day = 360 - i * 24 - (h % 9)
    const status = i === 3 + (h % 3) ? 'cancelled' : 'completed'
    const created = ago(day)
    const done = ago(day - 6)
    return {
      id: `past-${key}-${i}`, title: `Order #${1000 + i}`, status, totalIdr: 2_000_000 + ((h >> i) % 40) * 250_000,
      counterparty: { name: PAST_PARTNERS[(h + i * (i % 2 ? 1 : 3)) % PAST_PARTNERS.length], kind: 'business', verified: true },
      createdAt: created, updatedAt: done, dueAt: ago(day - (i === 7 ? 4 : 10)),
      timeline: [{ status: 'agreement', at: created }, { status: 'invoiced', at: new Date(new Date(created).getTime() + (3 + (h % 5)) * 3_600_000).toISOString() }, { status: 'completed', at: status === 'completed' ? done : undefined }],
      dispute: i === 8 ? { status: 'resolved', reason: 'Selisih kuantitas', openedAt: ago(day - 3) } : undefined,
    } satisfies ReputationTx
  })
}

const isDbUser = (id: string) => db.users.some((u) => u.id === id)

/** Live transactions (demo + workspace users) plus the seeded past year. Shared with the admin user list. */
export function reputationTxs(userId: string): ReputationTx[] {
  const joined = admin.accounts.find((a) => a.id === userId)?.joinedAt ?? ''
  return [...(isDbUser(userId) ? personal(userId).transactions : []), ...pastTransactions(userId).filter((t) => t.createdAt >= joined)]
}

// ── Smart Matching ───────────────────────────────────────────────

const MATCH_KEY = 'ecp-mock-matches'
const matchStore: Record<string, Record<string, { state: MatchState; reason?: string; conversationId?: string }>> = (() => {
  try {
    return JSON.parse(localStorage.getItem(MATCH_KEY) ?? '{}')
  } catch {
    return {}
  }
})()
const saveMatches = () => {
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify(matchStore))
  } catch {
    // per-tab only
  }
}

function matchesFor(userId: string): Match[] {
  const p = personal(userId)
  const prefs = p.identity.preferences
  const haves = [
    ...p.listings
      .map((s) => s.listing)
      .filter((l): l is SupplyListing => l.kind === 'supply' && ['available', 'in_market', 'reserved'].includes(l.status))
      .map((l) => ({ source: 'supply' as const, id: l.id, label: l.item, detail: `${l.quantity.value.toLocaleString('id-ID')} ${l.quantity.unit} · Rp ${l.priceIdr.toLocaleString('id-ID')}/${l.quantity.unit}`, categoryId: l.categoryId as CategoryId | undefined, listing: l })),
    ...p.identity.items.map((i) => ({ source: 'identity' as const, id: i.id, label: i.name, detail: i.detail, categoryId: itemCategory(i), listing: undefined })),
  ]
  const open = economy.opportunities.filter((o) => !['dismissed', 'closed'].includes(o.status) && o.demand.value > o.supply.value)
  const states = matchStore[userId] ?? {}
  const out: Match[] = []
  for (const have of haves) {
    if (!have.categoryId) continue
    const candidates = open.filter((o) => o.categoryId === have.categoryId).map((o) => {
      const gap = o.demand.value - o.supply.value
      const near = prefs.locations.some((l) => l === o.region || l.includes(o.region))
      const distanceKm = near ? 3 + (hash(o.id + have.id) % 45) : 120 + (hash(o.id) % 780)
      const sameUnit = have.listing?.quantity.unit === o.demand.unit
      const { score, parts } = scoreMatch({ categoryMatch: true, distanceKm, radiusKm: prefs.deliveryRadiusKm, coverage: sameUnit ? have.listing!.quantity.value / gap : null, confidence: o.confidence })
      const id = `${have.id}--${o.id}`
      return {
        id, distanceKm, score, parts, state: states[id]?.state ?? 'new', conversationId: states[id]?.conversationId,
        have: { source: have.source, id: have.id, label: have.label, detail: have.detail },
        need: { opportunityId: o.id, title: o.title, region: o.region, categoryId: o.categoryId, gap: { value: gap, unit: o.demand.unit }, detail: o.requiredContribution },
        estimatedValueIdr: sameUnit ? estimateMatchValue(have.listing!.quantity.value, gap, have.listing!.priceIdr) : Math.round(o.potentialValueIdr / Math.max(1, o.participants)),
      } satisfies Match
    })
    out.push(...candidates.sort((a, b) => b.score - a.score).slice(0, 2))
  }
  // Keep the inbox varied: at most two "haves" per opportunity.
  const perOpp = new Map<string, number>()
  return out
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    .filter((m) => {
      const n = perOpp.get(m.need.opportunityId) ?? 0
      perOpp.set(m.need.opportunityId, n + 1)
      return n < 2 || m.state !== 'new'
    })
}

// ── Public profiles ──────────────────────────────────────────────

function businesses() {
  const list = new Map<string, { name: string; verified: boolean; region?: string }>()
  const add = (name: string, verified: boolean, region?: string) => {
    const prev = list.get(slugify(name))
    list.set(slugify(name), { name, verified: verified || !!prev?.verified, region: prev?.region ?? region })
  }
  for (const m of economy.markets) add(m.maker.name, m.maker.verified, m.region)
  for (const u of db.users) for (const o of u.orgs) add(o.orgName, o.verified, u.location)
  for (const a of admin.accounts) if (a.kind === 'business') add(a.name, !!admin.users[a.id]?.verified, a.location)
  for (const v of admin.verifications) add(v.business, v.status === 'approved')
  return list
}

export const profileHandlers = [
  http.get(api('/me/reputation'), async () => {
    await delay(250)
    const userId = db.sessionUserId
    if (!userId || !isDbUser(userId)) return fail(401, 'unauthenticated', 'Belum login')
    return HttpResponse.json(reputationReport(reputationTxs(userId)))
  }),

  http.get(api('/me/matches'), async () => {
    await delay(300)
    const userId = db.sessionUserId
    if (!userId || !isDbUser(userId)) return fail(401, 'unauthenticated', 'Belum login')
    return HttpResponse.json(matchesFor(userId))
  }),

  http.post(api('/me/matches/:id'), async ({ params, request }) => {
    await delay(250)
    const userId = db.sessionUserId
    if (!userId || !isDbUser(userId)) return fail(401, 'unauthenticated', 'Belum login')
    const m = matchesFor(userId).find((x) => x.id === params.id)
    if (!m) return fail(404, 'not_found', 'Match tidak ditemukan')
    const { action, reason } = (await request.json()) as { action: MatchAction; reason?: string }
    const next: Record<MatchAction, MatchState> = { connect: 'connected', save: 'saved', dismiss: 'dismissed', reset: 'new' }
    if (!next[action]) return fail(422, 'validation', 'Aksi tidak dikenal')
    let conversationId = matchStore[userId]?.[m.id]?.conversationId
    // Connecting follows the opportunity and opens a conversation with whoever coordinates it (PRD F6).
    if (action === 'connect') {
      const p = personal(userId)
      if (!p.opportunities[m.need.opportunityId]) p.opportunities[m.need.opportunityId] = { relation: 'following' }
      savePersonal()
      if (!conversationId) {
        const opp = economy.opportunities.find((o) => o.id === m.need.opportunityId)
        const maker = opp?.markets[0]?.maker.name ?? `Tim ${opp?.code ?? 'opportunity'}`
        const makerUser = db.users.find((u) => u.capabilities.includes('market_maker') && u.orgs.some((o) => o.orgName === maker))
        const me = db.users.find((u) => u.id === userId)!
        const c = createConversation(
          `Match: ${m.need.title}`,
          [{ name: me.name, kind: 'person', verified: me.emailVerified, userId }, { name: maker, kind: 'business', verified: true, userId: makerUser?.id }],
          { type: 'match', id: m.id, href: `/opportunities/${m.need.opportunityId}` },
          { by: { name: me.name, kind: 'person', verified: me.emailVerified, userId }, text: `Halo, saya punya ${m.have.label} (${m.have.detail}) dan tertarik dengan ${m.need.title}. Bisa diskusi kebutuhannya?` },
        )
        conversationId = c.id
        if (makerUser) notify(makerUser.id, { type: 'opportunity_detected', title: `${me.name} ingin terhubung`, body: m.need.title, href: `/app/messages/${c.id}` })
        else botReply(c)
      }
    }
    matchStore[userId] = { ...matchStore[userId], [m.id]: { state: next[action], reason: reason?.trim() || undefined, conversationId } }
    saveMatches()
    return HttpResponse.json({ ...m, state: next[action], conversationId })
  }),

  http.get(api('/profiles/u/:username'), async ({ params }) => {
    await delay(250)
    const user = db.users.find((u) => u.username === params.username)
    const extra = admin.accounts.find((a) => a.username === params.username && a.kind === 'person')
    if (!user && !extra) return fail(404, 'not_found', 'Profil tidak ditemukan')
    const id = user?.id ?? extra!.id
    const { score, counts } = reputationScore(reputationTxs(id))
    const status = admin.users[id]?.status ?? 'active'
    if (!user) {
      const e = extra!
      const profile: PublicProfile = {
        name: e.name, username: e.username, location: e.location, bio: e.bio, joinedAt: e.joinedAt, status,
        verification: { email: true, identity: admin.users[id]?.verified ? 'verified' : 'none' },
        reputation: { score, counts }, supply: [], markets: [], orgs: [], activity: [],
      }
      return HttpResponse.json(profile)
    }
    const p = personal(user.id)
    const supply = p.listings.map((s) => s.listing).filter((l): l is SupplyListing => l.kind === 'supply' && (l.status === 'available' || l.status === 'in_market'))
    const profile: PublicProfile = {
      name: p.identity.profile.name || user.name, username: user.username, location: p.identity.profile.location || user.location || '',
      bio: p.identity.profile.bio, status,
      verification: { ...p.identity.profile.verification, identity: admin.users[id]?.verified ? 'verified' : p.identity.profile.verification.identity },
      reputation: { score, counts },
      supply: supply.map((l) => ({ id: l.id, item: l.item, categoryId: l.categoryId, quantity: l.quantity, priceIdr: l.priceIdr })),
      markets: economy.markets.filter((m) => p.markets[m.id]?.joined).map(({ id: mid, code, name, categoryId, region }) => ({ id: mid, code, name, categoryId, region })),
      orgs: user.orgs.map((o) => ({ name: o.orgName, slug: slugify(o.orgName) })),
      // Public activity only: finished transactions (counterparty hidden) and offered supply.
      activity: [
        ...p.transactions.filter((t) => t.status === 'completed').map((t) => ({ id: t.id, title: `Menyelesaikan transaksi ${t.title}`, at: t.updatedAt })),
        ...supply.map((l) => ({ id: l.id, title: `Menawarkan ${l.item}`, at: l.createdAt })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
    }
    return HttpResponse.json(profile)
  }),

  http.get(api('/profiles/b/:slug'), async ({ params }) => {
    await delay(250)
    const slug = String(params.slug)
    const b = businesses().get(slug)
    if (!b) return fail(404, 'not_found', 'Profil bisnis tidak ditemukan')
    const markets = economy.markets.filter((m) => slugify(m.maker.name) === slug).map(({ description: _d, rules: _r, priceHistory: _p, activity: _a, auctions: _u, ...m }) => m)
    const auctions = economy.auctions.filter((a) => markets.some((m) => m.id === a.marketId) && a.status !== 'cancelled').map(toAuction)
    const { score, counts } = reputationScore(pastTransactions(slug))
    const profile: BusinessProfile = {
      name: b.name, slug, region: b.region ?? markets[0]?.region ?? 'Indonesia', verified: b.verified,
      documents: b.verified ? ['NIB', 'NPWP', 'Akta pendirian'] : [],
      description: markets.length
        ? `${b.name} mengoperasikan ${markets.length} market di Ecopurnity dan mempertemukan ${markets.reduce((s, m) => s + m.buyers + m.suppliers, 0)} peserta.`
        : `${b.name} adalah bisnis di jaringan Ecopurnity.`,
      reputation: { score, counts }, markets, auctions,
      activity: [
        ...auctions.map((a) => ({ id: a.id, title: `Membuka auction ${a.title}`, at: a.startsAt })),
        ...markets.map((m) => ({ id: m.id, title: `Mengoperasikan market ${m.name}`, at: ago(30 + (hash(m.id) % 60)) })),
      ].filter((a) => a.at <= new Date().toISOString()).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 6),
    }
    return HttpResponse.json(profile)
  }),
]
