import { delay, http, HttpResponse } from 'msw'
import type { CategoryId, Conversation, PaymentTerms, Quote, Rfq, TradeParty } from '@/domain/types'
import { botCounterReply, dealPrice, quoteTransition, type QuoteAction } from '@/domain/rfq'
import { CATEGORIES } from '@/domain/catalog'
import { formatIdr } from '@/domain/format'
import { audit } from './audit'
import { db } from './db'
import { economy } from './economy'
import { newId, notify, personal } from './personal'
import { createTrade } from './trade'
import { commitGuard } from './kyc'

// RFQ, quotes, and conversations (PRD F6 direct trade). Fictional suppliers quote and negotiate on timers.

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) => HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()

interface Store {
  rfqs: Rfq[]
  conversations: Conversation[]
}
const KEY = 'ecp-mock-rfq'
const store: Store = (() => {
  try {
    return { rfqs: [], conversations: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { rfqs: [], conversations: [] }
  }
})()
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // per-tab only
  }
}

const userParty = (userId: string): TradeParty => {
  const u = db.users.find((x) => x.id === userId)
  return { name: u?.name ?? 'Pengguna', kind: 'person', verified: !!u?.emailVerified, userId }
}

const BOT_SUPPLIERS: Record<CategoryId, string[]> = {
  agri: ['Koperasi Mitra Tani', 'CV Tani Lestari', 'PT Agro Priangan'],
  food: ['CV Sumber Pangan', 'PT Rasa Nusantara', 'UD Makmur Jaya'],
  packaging: ['PT Kemas Prima', 'CV Plastik Jaya', 'UD Sinar Pack'],
  manufacturing: ['PT Polimer Jaya', 'CV Logam Mandiri', 'PT Karya Teknik'],
  logistics: ['PT Logistik Andalan', 'CV Angkut Cepat', 'PT Dingin Nusantara'],
  it: ['Jogja Digital Hub', 'CV Kode Kreatif', 'PT Solusi Teknologi'],
  energy: ['PT Surya Bali', 'CV Energi Hijau', 'PT Daya Mandiri'],
}

/** Reference unit price: buyer's target, else the median of active markets in the category. */
function refPrice(r: Rfq) {
  if (r.targetPriceIdr) return r.targetPriceIdr
  const m = economy.markets.find((x) => x.categoryId === r.categoryId)
  return m ? Math.round((m.priceRange.minIdr + m.priceRange.maxIdr) / 2) : 10_000
}

// ── Conversations ────────────────────────────────────────────────

export function createConversation(subject: string, participants: TradeParty[], link?: Conversation['link'], opening?: { by: TradeParty; text: string }) {
  const c: Conversation = {
    id: newId('cnv'), subject, participants, link, updatedAt: now(),
    messages: opening ? [{ id: newId('msg'), by: opening.by.name, userId: opening.by.userId, text: opening.text, at: now() }] : [],
  }
  store.conversations.unshift(c)
  save()
  return c
}

function post(c: Conversation, by: TradeParty, text: string) {
  c.messages.push({ id: newId('msg'), by: by.name, userId: by.userId, text, at: now() })
  c.updatedAt = now()
  save()
  for (const p of c.participants) {
    if (p.userId && p.userId !== by.userId) notify(p.userId, { type: 'transaction_update', title: `Pesan dari ${by.name}`, body: text.slice(0, 120), href: `/app/messages/${c.id}` })
  }
}

const BOT_REPLIES = [
  'Baik, kami cek ketersediaan stok dan jadwal kirimnya dulu.',
  'Bisa. Untuk kuantitas segitu kami siap kirim bertahap.',
  'Terima kasih, spesifikasinya sudah kami catat. Harga sudah termasuk ongkos muat.',
]

/** Fictional participants answer the latest human message once. */
export function botReply(c: Conversation) {
  const last = c.messages.at(-1)
  const bot = c.participants.find((p) => !p.userId)
  if (!last || !last.userId || !bot) return
  setTimeout(() => {
    if (c.messages.at(-1)?.id !== last.id) return
    post(c, bot, BOT_REPLIES[c.messages.length % BOT_REPLIES.length])
  }, 5_000)
}

// ── RFQ helpers ──────────────────────────────────────────────────

function botQuote(r: Rfq, name: string, i: number) {
  if (r.status !== 'open' || r.quotes.some((q) => q.supplier.name === name)) return
  const ref = refPrice(r)
  const q: Quote = {
    id: newId('qt'), supplier: { name, kind: 'business', verified: i !== 2 }, priceIdr: Math.round(ref * (0.94 + i * 0.05)),
    quantity: r.quantity.value, leadTimeDays: 3 + i * 2, terms: (['escrow', 'net14', 'net30'] as PaymentTerms[])[i % 3],
    note: ['Stok siap, bisa kirim minggu ini.', 'Termasuk ongkos kirim ke lokasi.', 'Bisa bertahap sesuai jadwal.'][i % 3],
    status: 'submitted', at: now(), history: [{ at: now(), by: name, text: 'Penawaran dikirim' }],
  }
  r.quotes.push(q)
  const c = store.conversations.find((x) => x.id === r.conversationId)
  if (c && !c.participants.some((p) => p.name === name)) c.participants.push(q.supplier)
  save()
  if (r.buyer.userId) notify(r.buyer.userId, { type: 'transaction_update', title: `Penawaran baru untuk ${r.code}`, body: `${name}: ${formatIdr(q.priceIdr)}/${r.quantity.unit}`, href: `/app/rfq/${r.id}` })
}

/** Platform suppliers who should see an RFQ: invited, or holding supply in its category. */
function relevantSupplier(r: Rfq, userId: string) {
  if (r.buyer.userId === userId) return false
  if (r.invited.some((p) => p.userId === userId) || r.quotes.some((q) => q.supplier.userId === userId)) return true
  return personal(userId).listings.some((l) => l.listing.kind === 'supply' && l.listing.categoryId === r.categoryId)
}

function accept(r: Rfq, q: Quote, priceIdr: number, actorName: string) {
  q.status = 'accepted'
  for (const other of r.quotes) if (other.id !== q.id && ['submitted', 'countered'].includes(other.status)) other.status = 'declined'
  r.status = 'awarded'
  const { buyer, supplier } = createTrade({
    title: `${r.item} · ${r.quantity.value.toLocaleString('id-ID')} ${r.quantity.unit}`,
    buyer: r.buyer.userId ? { userId: r.buyer.userId } : { party: r.buyer },
    supplier: q.supplier.userId ? { userId: q.supplier.userId } : { party: q.supplier },
    quantity: { value: q.quantity, unit: r.quantity.unit }, unitPriceIdr: priceIdr, terms: q.terms, address: r.location,
  })
  r.transactionId = buyer?.id ?? supplier?.id
  save()
  audit({ actor: actorName, action: `Terima penawaran ${q.supplier.name}`, entity: { type: 'procurement', id: r.id, label: `${r.code} · ${r.item}` }, changes: [{ field: 'Harga', after: `${formatIdr(priceIdr)}/${r.quantity.unit}` }] })
  if (q.supplier.userId && supplier) notify(q.supplier.userId, { type: 'winning_bid', title: `Penawaranmu diterima: ${r.code}`, body: `${r.buyer.name} · ${formatIdr(priceIdr)}/${r.quantity.unit}. Setujui agreement-nya.`, href: `/app/transactions/${supplier.id}` })
  if (r.buyer.userId && buyer && actorName !== r.buyer.name) notify(r.buyer.userId, { type: 'transaction_update', title: `${q.supplier.name} menerima tawaran balikmu`, body: `${r.code} · ${formatIdr(priceIdr)}/${r.quantity.unit}`, href: `/app/transactions/${buyer.id}` })
}

/** Pre-fill hints for "Pesan lagi" (repeat order) and "Minta penawaran" (listing). */
export function createRfq(userId: string, input: Pick<Rfq, 'item' | 'categoryId' | 'quantity' | 'targetPriceIdr' | 'deadline' | 'location' | 'spec' | 'source'> & { invite?: TradeParty[] }) {
  const id = newId('rfq')
  const buyer = userParty(userId)
  const conv = createConversation(`RFQ ${input.item}`, [buyer, ...(input.invite ?? [])], { type: 'rfq', id, href: `/app/rfq/${id}` })
  const r: Rfq = {
    ...input, id, code: `RFQ-${id.slice(-4).toUpperCase()}`, buyer, status: 'open', invited: input.invite ?? [], quotes: [], createdAt: now(), conversationId: conv.id,
  }
  store.rfqs.unshift(r)
  save()
  // Fictional suppliers in the category answer within seconds; invited fictional parties answer first.
  const bots = [...(input.invite ?? []).filter((p) => !p.userId).map((p) => p.name), ...BOT_SUPPLIERS[input.categoryId]].slice(0, 3)
  bots.forEach((name, i) => setTimeout(() => botQuote(r, name, i), 6_000 + i * 5_000))
  for (const u of db.users) if (relevantSupplier(r, u.id)) notify(u.id, { type: 'auction_invitation', title: `RFQ baru: ${r.item}`, body: `${buyer.name} butuh ${r.quantity.value.toLocaleString('id-ID')} ${r.quantity.unit} · ${CATEGORIES[r.categoryId].label}`, href: `/app/rfq/${r.id}` })
  return r
}

const withSide = (r: Rfq, userId: string) => ({ ...r, side: r.buyer.userId === userId ? ('buyer' as const) : ('supplier' as const) })

type Ctx = { userId: string; params: Record<string, string | readonly string[] | undefined>; request: Request }
const authed = (fn: (c: Ctx) => Response | Promise<Response>) => async ({ params, request }: { params: Ctx['params']; request: Request }) => {
  await delay(200)
  const userId = db.sessionUserId
  if (!userId || !db.users.some((u) => u.id === userId)) return fail(401, 'unauthenticated', 'Belum login')
  return fn({ userId, params, request })
}

export const rfqHandlers = [
  http.get(api('/me/rfqs'), authed(({ userId, request }) => {
    const side = new URL(request.url).searchParams.get('side') ?? 'buyer'
    const list = side === 'buyer' ? store.rfqs.filter((r) => r.buyer.userId === userId) : store.rfqs.filter((r) => relevantSupplier(r, userId) && (r.status === 'open' || r.quotes.some((q) => q.supplier.userId === userId)))
    return HttpResponse.json(list.map((r) => withSide(r, userId)))
  })),

  http.post(api('/me/rfqs'), authed(async ({ userId, request }) => {
    const b = (await request.json()) as Parameters<typeof createRfq>[1] & { inviteUserIds?: string[]; inviteNames?: string[] }
    const fields: Record<string, string> = {}
    if (!b.item?.trim()) fields.item = 'Isi barang/jasa yang dicari'
    if (!(b.quantity?.value > 0)) fields.quantity = 'Kuantitas harus lebih dari 0'
    if (!b.deadline) fields.deadline = 'Isi batas waktu'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Lengkapi RFQ', fields)
    const invite: TradeParty[] = [
      ...(b.inviteUserIds ?? []).filter((id) => id !== userId && db.users.some((u) => u.id === id)).map(userParty),
      ...(b.inviteNames ?? []).filter(Boolean).map((name) => ({ name, kind: 'business' as const, verified: true })),
    ]
    const r = createRfq(userId, { ...b, item: b.item.trim(), invite })
    audit({ actor: userParty(userId).name, action: 'Buat RFQ', entity: { type: 'procurement', id: r.id, label: `${r.code} · ${r.item}` } })
    return HttpResponse.json(withSide(r, userId), { status: 201 })
  })),

  http.get(api('/me/rfqs/:id'), authed(({ userId, params }) => {
    const r = store.rfqs.find((x) => x.id === params.id)
    if (!r || (r.buyer.userId !== userId && !relevantSupplier(r, userId))) return fail(404, 'not_found', 'RFQ tidak ditemukan')
    // Suppliers only see their own quote, never competitors'.
    return HttpResponse.json(withSide(r.buyer.userId === userId ? r : { ...r, quotes: r.quotes.filter((q) => q.supplier.userId === userId) }, userId))
  })),

  http.post(api('/me/rfqs/:id/quotes'), authed(async ({ userId, params, request }) => {
    const r = store.rfqs.find((x) => x.id === params.id)
    if (!r || !relevantSupplier(r, userId)) return fail(404, 'not_found', 'RFQ tidak ditemukan')
    if (r.status !== 'open') return fail(409, 'closed', 'RFQ sudah ditutup')
    if (r.quotes.some((q) => q.supplier.userId === userId && ['submitted', 'countered'].includes(q.status))) return fail(409, 'duplicate', 'Kamu sudah punya penawaran aktif; revisi saja')
    const b = (await request.json()) as Pick<Quote, 'priceIdr' | 'quantity' | 'leadTimeDays' | 'terms' | 'note'>
    if (!(b.priceIdr > 0)) return fail(422, 'validation', 'Isi harga', { priceIdr: 'Isi harga per unit' })
    if (!(b.quantity > 0)) return fail(422, 'validation', 'Isi kuantitas', { quantity: 'Isi kuantitas' })
    const me = userParty(userId)
    const q: Quote = { ...b, id: newId('qt'), supplier: me, status: 'submitted', at: now(), history: [{ at: now(), by: me.name, text: `Penawaran ${formatIdr(b.priceIdr)}/${r.quantity.unit}` }] }
    r.quotes.push(q)
    const c = store.conversations.find((x) => x.id === r.conversationId)
    if (c && !c.participants.some((p) => p.userId === userId)) c.participants.push(me)
    save()
    if (r.buyer.userId) notify(r.buyer.userId, { type: 'transaction_update', title: `Penawaran baru untuk ${r.code}`, body: `${me.name}: ${formatIdr(q.priceIdr)}/${r.quantity.unit}`, href: `/app/rfq/${r.id}` })
    return HttpResponse.json(withSide({ ...r, quotes: [q] }, userId), { status: 201 })
  })),

  http.post(api('/me/rfqs/:id/quotes/:qid/actions'), authed(async ({ userId, params, request }) => {
    const r = store.rfqs.find((x) => x.id === params.id)
    const q = r?.quotes.find((x) => x.id === params.qid)
    if (!r || !q) return fail(404, 'not_found', 'Penawaran tidak ditemukan')
    const side = r.buyer.userId === userId ? 'buyer' : q.supplier.userId === userId ? 'supplier' : null
    if (!side) return fail(403, 'forbidden', 'Bukan penawaranmu')
    const { action, priceIdr, note } = (await request.json()) as { action: QuoteAction; priceIdr?: number; note?: string }
    const next = quoteTransition(q.status, side, action, r.status === 'open')
    if (!next) return fail(409, 'invalid_transition', 'Aksi ini tidak tersedia sekarang')
    const me = userParty(userId)
    if ((action === 'counter' || action === 'revise') && !(Number(priceIdr) > 0)) return fail(422, 'validation', 'Isi harga', { priceIdr: 'Isi harga per unit' })
    if (action === 'accept' || action === 'accept_counter') {
      const blocked = commitGuard(userId, dealPrice(q, action) * q.quantity)
      if (blocked) return blocked
      accept(r, q, dealPrice(q, action), me.name)
    } else {
      q.status = next
      if (action === 'counter') q.counterPriceIdr = Number(priceIdr)
      if (action === 'revise') Object.assign(q, { priceIdr: Number(priceIdr), counterPriceIdr: undefined })
      q.history.push({ at: now(), by: me.name, text: `${{ counter: 'Tawar balik', revise: 'Revisi', decline: 'Tolak', withdraw: 'Tarik' }[action as 'counter']}${priceIdr ? ` ${formatIdr(Number(priceIdr))}` : ''}${note ? ` · ${note}` : ''}` })
      save()
      const other = side === 'buyer' ? q.supplier : r.buyer
      if (other.userId) notify(other.userId, { type: 'transaction_update', title: `${r.code}: ${me.name} ${action === 'counter' ? 'menawar balik' : action === 'revise' ? 'merevisi harga' : action === 'decline' ? 'menolak' : 'menarik penawaran'}`, body: priceIdr ? `${formatIdr(Number(priceIdr))}/${r.quantity.unit}` : r.item, href: `/app/rfq/${r.id}` })
      // A fictional supplier answers the counter after a short pause.
      if (action === 'counter' && !q.supplier.userId) {
        setTimeout(() => {
          if (q.status !== 'countered' || r.status !== 'open') return
          const reply = botCounterReply(q.priceIdr, q.counterPriceIdr!)
          if (reply.action === 'accept_counter') accept(r, q, q.counterPriceIdr!, q.supplier.name)
          else {
            Object.assign(q, { status: 'submitted', priceIdr: reply.priceIdr, counterPriceIdr: undefined })
            q.history.push({ at: now(), by: q.supplier.name, text: `Revisi ${formatIdr(reply.priceIdr)}` })
            save()
            if (r.buyer.userId) notify(r.buyer.userId, { type: 'transaction_update', title: `${q.supplier.name} merevisi harga`, body: `${r.code} · ${formatIdr(reply.priceIdr)}/${r.quantity.unit}`, href: `/app/rfq/${r.id}` })
          }
        }, 6_000)
      }
    }
    return HttpResponse.json(withSide(r, userId))
  })),

  http.post(api('/me/rfqs/:id/close'), authed(({ userId, params }) => {
    const r = store.rfqs.find((x) => x.id === params.id)
    if (!r || r.buyer.userId !== userId) return fail(404, 'not_found', 'RFQ tidak ditemukan')
    if (r.status !== 'open') return fail(409, 'closed', 'RFQ sudah ditutup')
    r.status = 'closed'
    for (const q of r.quotes) if (['submitted', 'countered'].includes(q.status)) q.status = 'declined'
    save()
    return HttpResponse.json(withSide(r, userId))
  })),

  // Conversations
  http.get(api('/me/conversations'), authed(({ userId }) =>
    HttpResponse.json(store.conversations.filter((c) => c.participants.some((p) => p.userId === userId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
  )),
  http.get(api('/me/conversations/:id'), authed(({ userId, params }) => {
    const c = store.conversations.find((x) => x.id === params.id && x.participants.some((p) => p.userId === userId))
    return c ? HttpResponse.json(c) : fail(404, 'not_found', 'Percakapan tidak ditemukan')
  })),
  http.post(api('/me/conversations'), authed(async ({ userId, request }) => {
    const b = (await request.json()) as { subject: string; with: TradeParty; link?: Conversation['link']; text?: string }
    if (!b.subject?.trim() || !b.with?.name) return fail(422, 'validation', 'Percakapan tidak lengkap')
    const existing = store.conversations.find((c) => c.link && b.link && c.link.type === b.link.type && c.link.id === b.link.id && c.participants.some((p) => p.userId === userId))
    if (existing) return HttpResponse.json(existing)
    const me = userParty(userId)
    const c = createConversation(b.subject.trim(), [me, b.with], b.link, b.text ? { by: me, text: b.text } : undefined)
    botReply(c)
    return HttpResponse.json(c, { status: 201 })
  })),
  http.post(api('/me/conversations/:id/messages'), authed(async ({ userId, params, request }) => {
    const c = store.conversations.find((x) => x.id === params.id && x.participants.some((p) => p.userId === userId))
    if (!c) return fail(404, 'not_found', 'Percakapan tidak ditemukan')
    const { text } = (await request.json()) as { text: string }
    if (!text?.trim()) return fail(422, 'validation', 'Tulis pesan', { text: 'Tulis pesan' })
    post(c, userParty(userId), text.trim())
    botReply(c)
    return HttpResponse.json(c, { status: 201 })
  })),
]
