import { delay, http, HttpResponse } from 'msw'
import type { TradeParty } from '@/domain/types'
import { contractActions, contractTransition, EVERY, nextRun, type Contract, type ContractAction, type ContractEvery } from '@/domain/contract'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { newId, notify, personal } from './personal'
import { userParty } from './rfq'
import { createTrade } from './trade'



const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()

const KEY = 'ecp-mock-contracts'
const store: Contract[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
})()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // per-tab only
  }
}

const sideOf = (c: Contract, userId: string) => (c.buyer.userId === userId ? 'buyer' : c.supplier.userId === userId ? 'supplier' : null)
const other = (side: 'buyer' | 'supplier') => (side === 'buyer' ? 'supplier' : 'buyer')
const view = (c: Contract, userId: string) => {
  const side = sideOf(c, userId)!
  return { ...c, side, actions: contractActions(c, side) }
}
const asSide = (p: TradeParty) => (p.userId ? { userId: p.userId } : { party: { name: p.name, kind: p.kind, verified: p.verified } })

function placeOrder(c: Contract) {
  const n = c.orders.length + 1
  const res = createTrade({
    title: `${c.item} · order ${n}/${c.runs} (${c.code})`, buyer: asSide(c.buyer), supplier: asSide(c.supplier),
    quantity: c.quantity, unitPriceIdr: c.unitPriceIdr, terms: c.terms,
  })
  c.orders.push({ at: now(), buyerTxId: res.buyer?.id, supplierTxId: res.supplier?.id })
  c.nextAt = nextRun(now(), c.every)
  if (c.orders.length >= c.runs) c.status = 'ended'
  for (const [p, tx] of [[c.buyer, res.buyer], [c.supplier, res.supplier]] as const) {
    if (p.userId && tx) notify(p.userId, { type: 'transaction_update', title: `Order kontrak ${c.code} dibuat`, body: `${c.item} · order ${n} dari ${c.runs}`, href: `/app/transactions/${tx.id}` })
  }
}


export function contractTick() {
  let changed = false
  for (const c of store) {
    const pending = c[other(c.proposedBy)]
    if (c.status === 'proposed' && !pending.userId && Date.now() - new Date(c.createdAt).getTime() > 8_000) {
      c.status = 'active'
      const proposer = c[c.proposedBy]
      if (proposer.userId) notify(proposer.userId, { type: 'transaction_update', title: `${pending.name} menyetujui kontrak ${c.code}`, body: `${EVERY[c.every]}, ${c.runs} order`, href: `/app/contracts/${c.id}` })
      changed = true
    }
    if (c.status === 'active' && c.nextAt <= now()) {
      placeOrder(c)
      changed = true
    }
  }
  if (changed) save()
}

const authed = (fn: (ctx: { userId: string; params: Record<string, string | readonly string[] | undefined>; request: Request }) => Response | Promise<Response>) =>
  async ({ params, request }: { params: Record<string, string | readonly string[] | undefined>; request: Request }) => {
    await delay(250)
    const userId = db.sessionUserId
    if (!userId || !db.users.some((u) => u.id === userId)) return fail(401, 'unauthenticated', 'Belum login')
    return fn({ userId, params, request })
  }

export const contractHandlers = [
  http.get(api('/me/contracts'), authed(({ userId }) => HttpResponse.json(store.filter((c) => sideOf(c, userId)).map((c) => view(c, userId))))),

  http.get(api('/me/contracts/:id'), authed(({ userId, params }) => {
    const c = store.find((x) => x.id === params.id && sideOf(x, userId))
    return c ? HttpResponse.json(view(c, userId)) : fail(404, 'not_found', 'Kontrak tidak ditemukan')
  })),

  http.post(api('/me/contracts'), authed(async ({ userId, request }) => {
    const b = (await request.json()) as { fromTx?: string; every?: ContractEvery; runs?: number; startAt?: string }
    const t = personal(userId).transactions.find((x) => x.id === b.fromTx)
    if (!t) return fail(404, 'not_found', 'Transaksi tidak ditemukan')
    if (t.status !== 'completed') return fail(409, 'not_completed', 'Kontrak rutin dibuat dari transaksi yang sudah selesai')
    const fields: Record<string, string> = {}
    if (!b.every || !EVERY[b.every]) fields.every = 'Pilih frekuensi'
    if (!(Number(b.runs) >= 2 && Number(b.runs) <= 52)) fields.runs = 'Antara 2 dan 52 order'
    if (!b.startAt || b.startAt < now().slice(0, 10)) fields.startAt = 'Mulai hari ini atau nanti'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa isian kontrak', fields)
    const me = userParty(userId)
    const them: TradeParty = { ...t.counterparty, userId: t.peer?.userId }
    const id = newId('ctr')
    const c: Contract = {
      id, code: `CTR-${id.slice(-4).toUpperCase()}`, item: t.title.split(' · ')[0], buyer: t.role === 'buyer' ? me : them, supplier: t.role === 'buyer' ? them : me,
      quantity: t.quantity, unitPriceIdr: t.unitPriceIdr, terms: t.terms ?? 'escrow', every: b.every!, runs: Number(b.runs),
      nextAt: new Date(`${b.startAt}T08:00:00`).toISOString(), status: 'proposed', proposedBy: t.role, sourceTxId: t.id, orders: [], createdAt: now(),
    }
    store.unshift(c)
    save()
    audit({ actor: me.name, action: `Usulkan kontrak rutin ${c.code}`, entity: { type: 'transaction', id: t.id, label: t.title }, changes: [{ field: 'Kontrak', after: `${EVERY[c.every]} × ${c.runs}, ${formatIdr(c.unitPriceIdr)}/${c.quantity.unit}` }] })
    if (them.userId) notify(them.userId, { type: 'transaction_update', title: `${me.name} mengusulkan kontrak rutin`, body: `${c.item} · ${EVERY[c.every]}, ${c.runs} order`, href: `/app/contracts/${c.id}` })
    return HttpResponse.json(view(c, userId), { status: 201 })
  })),

  http.post(api('/me/contracts/:id/actions'), authed(async ({ userId, params, request }) => {
    const c = store.find((x) => x.id === params.id)
    const side = c && sideOf(c, userId)
    if (!c || !side) return fail(404, 'not_found', 'Kontrak tidak ditemukan')
    const { action } = (await request.json()) as { action: ContractAction }
    const to = contractActions(c, side).includes(action) ? contractTransition(c.status, action) : null
    if (!to) return fail(409, 'invalid_transition', 'Aksi ini tidak tersedia sekarang')
    const before = c.status
    c.status = to
    if (action === 'run_now') placeOrder(c)
    if (action === 'resume' && c.nextAt < now()) c.nextAt = now()
    save()
    const me = c[side]
    audit({ actor: me.name, action: `Kontrak ${c.code}: ${action}`, entity: { type: 'transaction', id: c.id, label: c.item }, changes: [{ field: 'status', before, after: c.status }] })
    const peer = c[other(side)]
    if (peer.userId && action !== 'run_now') notify(peer.userId, { type: 'transaction_update', title: `Kontrak ${c.code}: ${{ accept: 'disetujui', decline: 'ditolak', pause: 'dijeda', resume: 'dilanjutkan', end: 'diakhiri' }[action]}`, body: `oleh ${me.name}`, href: `/app/contracts/${c.id}` })
    return HttpResponse.json(view(c, userId))
  })),
]
