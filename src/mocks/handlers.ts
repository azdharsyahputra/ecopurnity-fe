import { delay, http, HttpResponse } from 'msw'
import { db, toUser } from './db'
import { legacyHandlers } from './legacy'

const api = (path: string) => `/api/v1${path}`

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

export const handlers = [
  // ── Auth ──
  http.get(api('/auth/me'), async () => {
    await delay(150)
    const user = db.users.find((u) => u.id === db.sessionUserId)
    return user ? HttpResponse.json(toUser(user)) : fail(401, 'unauthenticated', 'Belum login')
  }),

  http.post(api('/auth/login'), async ({ request }) => {
    await delay(400)
    const { email, password } = (await request.json()) as { email: string; password: string }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase() && u.password === password)
    // Same message for unknown email and wrong password (PRD §7).
    if (!user) return fail(401, 'invalid_credentials', 'Email atau password salah')
    db.setSession(user.id)
    return HttpResponse.json(toUser(user))
  }),

  http.post(api('/auth/logout'), async () => {
    db.setSession(null)
    return new HttpResponse(null, { status: 204 })
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

  ...legacyHandlers,
]
