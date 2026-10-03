import { delay, http, HttpResponse } from 'msw'
import type { CategoryId, ExplorerRange, OnboardingInput, Page, SearchType } from '@/domain/types'
import { db, saveUsers, toUser, type MockUser } from './db'
import { aggregates, economy, explorerOverview, marketDetail, search, toAuction, toOpportunity } from './economy'
import { legacyHandlers } from './legacy'
import { admin } from './admin'
import { applyOnboarding, personal } from './personal'
import { personalHandlers } from './personalHandlers'
import { mmHandlers } from './mmHandlers'
import { adminHandlers } from './adminHandlers'
import { profileHandlers } from './profileHandlers'

const api = (path: string) => `/api/v1${path}`

const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })

const SUSPENDED = 'Akun ini disuspend oleh tim governance. Hubungi dukungan untuk banding.'

const noContent = () => new HttpResponse(null, { status: 204 })

const sessionUser = () => db.users.find((u) => u.id === db.sessionUserId)

const token = () => Math.random().toString(36).slice(2, 12)

/** `?page=&pageSize=` over an already filtered list (PRD §13 list contract). */
function paginate<T>(items: T[], url: URL): Page<T> {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(50, Number(url.searchParams.get('pageSize') ?? 12))
  return { data: items.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: items.length } }
}

function matches(url: URL, item: { categoryId: CategoryId; region: string; status: string }, text: string) {
  const p = url.searchParams
  const term = p.get('q')?.toLowerCase()
  return (
    (!p.get('category') || item.categoryId === p.get('category')) &&
    (!p.get('region') || item.region === p.get('region')) &&
    (!p.get('status') || p.get('status')!.split(',').includes(item.status)) &&
    (!term || text.toLowerCase().includes(term))
  )
}

export const handlers = [
  // ── Auth (PRD §7) ──
  http.get(api('/auth/me'), async () => {
    await delay(150)
    const user = sessionUser()
    if (user && admin.users[user.id]?.status === 'suspended') return fail(403, 'account_suspended', SUSPENDED)
    return user ? HttpResponse.json(toUser(user)) : fail(401, 'unauthenticated', 'Belum login')
  }),

  http.post(api('/auth/login'), async ({ request }) => {
    await delay(400)
    const { email, password } = (await request.json()) as { email: string; password: string }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase() && u.password === password)
    // Same message for unknown email and wrong password.
    if (!user) return fail(401, 'invalid_credentials', 'Email atau password salah')
    if (admin.users[user.id]?.status === 'suspended') return fail(403, 'account_suspended', SUSPENDED)
    db.setSession(user.id)
    return HttpResponse.json(toUser(user))
  }),

  http.post(api('/auth/register'), async ({ request }) => {
    await delay(500)
    const { name, email, password } = (await request.json()) as { name: string; email: string; password: string }
    const normalized = email.trim().toLowerCase()
    if (db.users.some((u) => u.email === normalized))
      return fail(409, 'email_taken', 'Email sudah terdaftar', { email: 'Email ini sudah punya akun. Masuk saja.' })
    if (password.length < 8) return fail(422, 'validation', 'Password terlalu pendek', { password: 'Minimal 8 karakter' })
    const user: MockUser = {
      id: `usr-new-${token()}`, name: name.trim(), username: normalized.split('@')[0], email: normalized,
      emailVerified: false, capabilities: [], orgs: [], onboarded: false, password,
    }
    db.users.push(user)
    saveUsers()
    db.verifyTokens.set(normalized, token())
    db.setSession(user.id)
    return HttpResponse.json(toUser(user), { status: 201 })
  }),

  // Mock OAuth: the "provider" always returns the same Google account.
  http.post(api('/auth/google'), async () => {
    await delay(600)
    const email = 'tamu.google@gmail.com'
    let user = db.users.find((u) => u.email === email)
    if (!user) {
      user = {
        id: `usr-new-google`, name: 'Tamu Google', username: 'tamu', email, emailVerified: true,
        capabilities: [], orgs: [], onboarded: false, password: token(),
      }
      db.users.push(user)
      saveUsers()
    }
    db.setSession(user.id)
    return HttpResponse.json(toUser(user))
  }),

  http.post(api('/auth/logout'), async () => {
    db.setSession(null)
    return noContent()
  }),

  http.post(api('/auth/verify-email'), async ({ request }) => {
    await delay(400)
    const { token: t } = (await request.json()) as { token: string }
    const email = [...db.verifyTokens].find(([, v]) => v === t)?.[0]
    const user = db.users.find((u) => u.email === email)
    if (!user) return fail(400, 'invalid_token', 'Link verifikasi tidak valid atau sudah kedaluwarsa')
    user.emailVerified = true
    db.verifyTokens.delete(user.email)
    saveUsers()
    return HttpResponse.json(toUser(user))
  }),

  http.post(api('/auth/resend-verification'), async () => {
    await delay(300)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    db.verifyTokens.set(user.email, token())
    return noContent()
  }),

  // Always 204 so the response never reveals whether an email is registered.
  http.post(api('/auth/forgot-password'), async ({ request }) => {
    await delay(400)
    const { email } = (await request.json()) as { email: string }
    const normalized = email.trim().toLowerCase()
    if (db.users.some((u) => u.email === normalized)) db.resetTokens.set(normalized, token())
    return noContent()
  }),

  http.post(api('/auth/reset-password'), async ({ request }) => {
    await delay(400)
    const { token: t, password } = (await request.json()) as { token: string; password: string }
    const email = [...db.resetTokens].find(([, v]) => v === t)?.[0]
    const user = db.users.find((u) => u.email === email)
    if (!user) return fail(400, 'invalid_token', 'Link reset tidak valid atau sudah kedaluwarsa')
    if (password.length < 8) return fail(422, 'validation', 'Password terlalu pendek', { password: 'Minimal 8 karakter' })
    user.password = password
    db.resetTokens.delete(user.email)
    saveUsers()
    return noContent()
  }),

  /** Mock-only: lets the UI show the link a real BE would have emailed. */
  http.get(api('/_mock/outbox'), ({ request }) => {
    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() ?? sessionUser()?.email ?? ''
    return HttpResponse.json({ verifyToken: db.verifyTokens.get(email) ?? null, resetToken: db.resetTokens.get(email) ?? null })
  }),

  http.patch(api('/me/onboarding'), async ({ request }) => {
    await delay(500)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    const input = (await request.json()) as OnboardingInput
    user.location = input.location
    user.onboarded = true
    applyOnboarding(user.id, input)
    if (input.organization) {
      user.orgs.push({ orgId: `org-${token()}`, orgName: input.organization.name, role: 'owner', verified: false })
    }
    saveUsers()
    return HttpResponse.json(toUser(user))
  }),

  // ── Public economy ──
  http.get(api('/public/stats'), async () => {
    await delay(200)
    return HttpResponse.json(db.stats)
  }),

  http.get(api('/public/activity'), async ({ request }) => {
    await delay(250)
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
    return HttpResponse.json(db.activity.slice(0, limit))
  }),

  http.get(api('/opportunities'), async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const list = economy.opportunities
      .filter((o) => matches(url, o, `${o.title} ${o.code} ${o.description}`))
      .sort((a, b) => b.potentialValueIdr - a.potentialValueIdr)
      .map(toOpportunity)
    return HttpResponse.json(paginate(list, url))
  }),

  http.get(api('/opportunities/:id'), async ({ params }) => {
    await delay(300)
    const o = economy.opportunities.find((x) => x.id === params.id)
    if (!o) return fail(404, 'not_found', 'Opportunity tidak ditemukan')
    // Visitors get initials only (PRD §6.3).
    const masked = sessionUser()
      ? o.participantsPreview
      : o.participantsPreview.map((p) => ({ ...p, name: p.name.replace(/\B\w+/g, '•••') }))
    return HttpResponse.json({ ...o, participantsPreview: masked })
  }),

  http.get(api('/markets'), async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const list = economy.markets
      .filter((m) => matches(url, m, `${m.name} ${m.code} ${m.maker.name}`))
      .sort((a, b) => b.volume30dIdr - a.volume30dIdr)
      .map(({ description: _d, rules: _r, priceHistory: _p, activity: _a, auctions: _u, ...m }) => m)
    return HttpResponse.json(paginate(list, url))
  }),

  http.get(api('/markets/:id'), async ({ params }) => {
    await delay(300)
    const m = marketDetail(String(params.id))
    return m ? HttpResponse.json(m) : fail(404, 'not_found', 'Market tidak ditemukan')
  }),

  http.get(api('/auctions'), async ({ request }) => {
    await delay(300)
    const url = new URL(request.url)
    const order = { live: 0, extended: 0, qualification: 1, scheduled: 2 } as Record<string, number>
    const list = economy.auctions
      .filter((a) => matches(url, { ...a, region: url.searchParams.get('region') ?? '' }, `${a.title} ${a.code} ${a.marketName}`))
      .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.endsAt.localeCompare(b.endsAt))
      .map(toAuction)
    return HttpResponse.json(paginate(list, url))
  }),

  http.get(api('/auctions/:id'), async ({ params }) => {
    await delay(250)
    const a = economy.auctions.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Auction tidak ditemukan')
    // Flag the viewer's own bids so the room can say "Kamu".
    const me = db.sessionUserId && db.users.some((u) => u.id === db.sessionUserId) ? personal(db.sessionUserId).bids[a.id] : undefined
    return HttpResponse.json(me ? { ...a, bids: a.bids.map((b) => (b.mine || (b.priceIdr === me.priceIdr && b.bidder === 'Kamu') ? { ...b, mine: true } : b)) } : a)
  }),

  http.get(api('/explorer/overview'), async ({ request }) => {
    await delay(350)
    const p = new URL(request.url).searchParams
    return HttpResponse.json(explorerOverview((p.get('range') ?? '30d') as ExplorerRange, (p.get('category') || undefined) as CategoryId))
  }),

  http.get(api('/explorer/:side'), async ({ params, request }) => {
    await delay(300)
    const side = params.side
    if (side !== 'demand' && side !== 'supply') return fail(404, 'not_found', 'Tidak ditemukan')
    const category = (new URL(request.url).searchParams.get('category') || undefined) as CategoryId
    return HttpResponse.json(aggregates(side, category))
  }),

  http.get(api('/search'), async ({ request }) => {
    await delay(200)
    const p = new URL(request.url).searchParams
    const type = p.get('type') as SearchType | null
    const limit = Number(p.get('limit') ?? 50)
    const hits = search(p.get('q') ?? '').filter((h) => !type || h.type === type)
    return HttpResponse.json(hits.slice(0, limit))
  }),

  ...mmHandlers,
  ...adminHandlers,
  ...profileHandlers,
  ...personalHandlers,
  ...legacyHandlers,
]
