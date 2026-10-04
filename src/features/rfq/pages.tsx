import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, MessagesSquare, Plus, Send, Inbox, FileQuestion } from 'lucide-react'
import type { CategoryId, PaymentTerms, Quote } from '@/domain/types'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { TERMS } from '@/domain/trade'
import { QUOTE_ACTION_LABEL, quoteActions, type QuoteAction } from '@/domain/rfq'
import { formatDate, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useMe } from '@/features/auth/hooks'
import { useTransaction } from '@/features/me/hooks'
import { useConversation, useConversations, useCreateRfq, useRfq, useRfqAction, useRfqs, useSendMessage } from './hooks'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, FormError, Segmented, SelectField, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const RFQ_STATUS = { open: ['Terbuka', 'blue'], awarded: ['Deal', 'green'], closed: ['Ditutup', 'gray'] } as const
const QUOTE_STATUS: Record<Quote['status'], [string, 'blue' | 'orange' | 'green' | 'gray' | 'red']> = {
  submitted: ['Masuk', 'blue'], countered: ['Ditawar balik', 'orange'], accepted: ['Diterima', 'green'], declined: ['Ditolak', 'gray'], withdrawn: ['Ditarik', 'gray'],
}
const TERM_OPTIONS = Object.entries(TERMS).map(([k, v]) => [k, v.label]) as [PaymentTerms, string][]



export function RfqListPage() {
  const [params, setParams] = useSearchParams()
  const side = params.get('side') === 'supplier' ? 'supplier' : 'buyer'
  const query = useRfqs(side)
  return (
    <>
      <PageHeader
        title="RFQ"
        description="Minta penawaran langsung tanpa auction: supplier menawar, kamu bisa tawar balik, lalu deal jadi transaksi."
        icon={FileQuestion}
        tone="blue"
        featured
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Sisi RFQ" className="inline-flex rounded-xl border bg-muted/55 p-1">
              {([['buyer', 'Dikirim'], ['supplier', 'Masuk']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={side === value} onClick={() => setParams({ side: value }, { replace: true })}
                  className={cn('inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors', side === value ? 'border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/15' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>
            <Button className="h-10 shadow-sm hover:bg-primary/90 hover:shadow-md" render={<Link to="/app/rfq/new" />}><Plus /> Buat RFQ</Button>
          </div>
        }
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        emptyFallback={false}
      >
        {(rows) => {
          const openCount = rows.filter((row) => row.status === 'open').length
          const quoteCount = rows.reduce((total, row) => total + row.quotes.length, 0)
          const emptyTitle = side === 'buyer' ? 'Belum ada RFQ terkirim' : 'Belum ada RFQ masuk'
          const emptyDescription = side === 'buyer'
            ? 'Buat permintaan penawaran agar supplier yang sesuai bisa mengirim harga dan ketersediaan.'
            : 'Permintaan dari pembeli akan muncul di sini. Lengkapi supply agar lebih mudah ditemukan.'
          return (
            <div className="grid gap-6">
              <section aria-label="Ringkasan RFQ" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Total RFQ', value: formatNumber(rows.length), note: side === 'buyer' ? 'Permintaan yang kamu kirim' : 'Permintaan yang ditujukan kepadamu', icon: FileQuestion, tone: 'blue' },
                  { label: 'Masih terbuka', value: formatNumber(openCount), note: 'Masih menerima penawaran', icon: Inbox, tone: 'teal' },
                  { label: 'Penawaran', value: formatNumber(quoteCount), note: 'Dari seluruh RFQ', icon: MessagesSquare, tone: 'violet' },
                ].map(({ label, value, note, icon: Icon, tone }) => (
                  <article key={label} className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] transition-colors hover:bg-muted/20 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
                        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                      </div>
                      <span className={cn('grid size-10 place-items-center rounded-xl', tone === 'blue' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300' : tone === 'teal' ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'bg-violet-500/10 text-violet-700 dark:text-violet-300')}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                    </div>
                  </article>
                ))}
              </section>
              <section className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{side === 'buyer' ? 'RFQ yang dikirim' : 'RFQ yang masuk'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{side === 'buyer' ? 'Pantau respons supplier dan kelola permintaanmu.' : 'Tinjau kebutuhan pembeli dan siapkan penawaran yang sesuai.'}</p>
                  </div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} RFQ</span>
                </div>
                {rows.length > 0 ? (
                  <DataTable
                    caption="RFQ"
                    rows={rows}
                    rowKey={(r) => r.id}
                    rowHref={(r) => `/app/rfq/${r.id}`}
                    initialSort={{ key: 'created', dir: 'desc' }}
                    columns={[
                      { key: 'item', header: 'Kebutuhan', primary: true, cell: (r) => <span>{r.item} <span className="ml-1 text-xs font-normal text-muted-foreground">{r.code}</span></span> },
                      { key: 'cat', header: 'Kategori', cell: (r) => <CategoryTag id={r.categoryId} /> },
                      { key: 'qty', header: 'Kuantitas', align: 'right', cell: (r) => formatQty(r.quantity, { compact: true }) },
                      ...(side === 'buyer'
                        ? [{ key: 'quotes', header: 'Penawaran', align: 'right' as const, cell: (r: (typeof rows)[number]) => formatNumber(r.quotes.length), sortValue: (r: (typeof rows)[number]) => r.quotes.length }]
                        : [{ key: 'buyer', header: 'Pembeli', cell: (r: (typeof rows)[number]) => r.buyer.name }]),
                      { key: 'status', header: 'Status', cell: (r) => <Tag tone={RFQ_STATUS[r.status][1]}>{RFQ_STATUS[r.status][0]}</Tag> },
                      { key: 'created', header: 'Dibuat', cell: (r) => <span className="text-muted-foreground">{formatRelative(r.createdAt)}</span>, sortValue: (r) => r.createdAt },
                    ]}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7">
                    <EmptyState
                      icon={side === 'buyer' ? FileQuestion : Inbox}
                      tone="blue"
                      title={emptyTitle}
                      description={emptyDescription}
                      action={side === 'buyer' ? <Button render={<Link to="/app/rfq/new" />}>Buat RFQ</Button> : <Button variant="outline" render={<Link to="/app/supply/new" />}>Tambah supply</Button>}
                    />
                  </div>
                )}
              </section>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}



function RfqForm({ initial }: { initial: { item: string; categoryId: CategoryId; qty: string; unit: string; target: string; inviteName?: string; inviteUserId?: string; spec: string; source?: { kind: 'repeat' | 'listing' | 'logistics'; id: string } } }) {
  const navigate = useNavigate()
  const create = useCreateRfq()
  const [f, setF] = useState(() => ({ ...initial, deadline: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), location: REGIONS[1] }))
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  function submit(e: FormEvent) {
    e.preventDefault()
    create.mutate(
      {
        item: f.item, categoryId: f.categoryId, quantity: { value: Number(f.qty), unit: f.unit }, targetPriceIdr: Number(f.target) || undefined,
        deadline: new Date(`${f.deadline}T17:00:00`).toISOString(), location: f.location, spec: f.spec, source: f.source,
        inviteUserIds: f.inviteUserId ? [f.inviteUserId] : undefined, inviteNames: f.inviteName && !f.inviteUserId ? [f.inviteName] : undefined,
      },
      { onSuccess: (r) => { toast({ title: 'RFQ terkirim', body: 'Supplier di kategori ini mulai menawar.', tone: 'green' }); navigate(`/app/rfq/${r.id}`, { replace: true }) } },
    )
  }

  return (
    <form onSubmit={submit} className="grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="grid gap-5">
        {f.inviteName && <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed sm:col-span-2">Diundang langsung: <b>{f.inviteName}</b>. Supplier lain di kategori ini tetap bisa menawar.</p>}
        <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
          <div className="mb-4"><h2 className="font-semibold">Detail kebutuhan</h2><p className="mt-1 text-sm text-muted-foreground">Jelaskan barang atau jasa yang ingin dicari supplier.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Barang / jasa" value={f.item} onChange={(e) => set('item', e.target.value)} error={fieldError(create.error, 'item')} /></div>
            <SelectField label="Kategori" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
              {Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
            </SelectField>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <Field label="Kuantitas" type="number" min={0} value={f.qty} onChange={(e) => set('qty', e.target.value)} error={fieldError(create.error, 'quantity')} />
              <Field label="Satuan" value={f.unit} onChange={(e) => set('unit', e.target.value)} />
            </div>
            <div className="sm:col-span-2"><TextareaField label="Spesifikasi" rows={4} value={f.spec} onChange={(e) => set('spec', e.target.value)} hint="Tambahkan mutu, ukuran, kemasan, atau detail penting lainnya." /></div>
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
          <div className="mb-4"><h2 className="font-semibold">Penawaran & pengiriman</h2><p className="mt-1 text-sm text-muted-foreground">Atur batas waktu dan tujuan penawaran.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Target harga per ${f.unit || 'unit'} (opsional)`} type="number" min={0} value={f.target} onChange={(e) => set('target', e.target.value)} />
            <Field label="Butuh penawaran sebelum" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} error={fieldError(create.error, 'deadline')} />
            <div className="sm:col-span-2"><SelectField label="Lokasi pengiriman" value={f.location} onChange={(e) => set('location', e.target.value)}>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </SelectField></div>
          </div>
        </section>
        <FormError error={create.error} />
        <div className="flex justify-end"><Button type="submit" className="h-10 px-5" disabled={create.isPending}>{create.isPending ? 'Mengirim…' : 'Kirim RFQ'}</Button></div>
      </div>
      <aside className="rounded-2xl border bg-muted/25 p-4 sm:p-5 lg:sticky lg:top-20">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pratinjau kebutuhan</p>
        <p className="mt-3 break-words font-semibold">{f.item || 'Nama barang / jasa'}</p>
        <dl className="mt-2 divide-y divide-border/60 text-sm">
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Kategori</dt><dd className="text-right font-medium">{CATEGORIES[f.categoryId]?.label}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Kuantitas</dt><dd className="text-right font-medium">{f.qty || '—'} {f.unit}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Lokasi</dt><dd className="text-right font-medium">{f.location}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Batas waktu</dt><dd className="text-right font-medium">{f.deadline || '—'}</dd></div>
        </dl>
      </aside>
    </form>
  )
}

function RepeatForm({ txId }: { txId: string }) {
  const tx = useTransaction(txId)
  return (
    <AsyncView query={tx} skeleton={<Skeleton className="h-64 rounded-xl" />}>
      {(t) => (
        <RfqForm
          initial={{
            item: t.title.split(' · ')[0], categoryId: 'agri', qty: String(t.quantity.value), unit: t.quantity.unit, target: String(t.unitPriceIdr), spec: `Pesan ulang dari ${t.code}`,
            inviteName: t.counterparty.name, inviteUserId: t.peer?.userId, source: { kind: 'repeat', id: t.id },
          }}
        />
      )}
    </AsyncView>
  )
}

export function RfqNewPage() {
  const [p] = useSearchParams()
  const from = p.get('from')
  return (
    <>
      <PageHeader title={from ? 'Pesan lagi' : 'Buat RFQ'} description="Supplier yang cocok akan mengirim penawaran; kamu bandingkan, tawar balik, lalu terima yang terbaik." icon={FileQuestion} tone="blue" featured />
      {from ? (
        <RepeatForm txId={from} />
      ) : (
        <RfqForm
          initial={{
            item: p.get('item') ?? '', categoryId: (p.get('category') as CategoryId) || 'agri', qty: p.get('qty') ?? '', unit: p.get('unit') ?? 'kg', target: p.get('target') ?? '', spec: p.get('spec') ?? '',
            inviteName: p.get('inviteName') ?? undefined, inviteUserId: p.get('inviteUserId') ?? undefined,
            source: p.get('listing') ? { kind: 'listing', id: p.get('listing')! } : p.get('category') === 'logistics' ? { kind: 'logistics', id: p.get('item') ?? '' } : undefined,
          }}
        />
      )}
    </>
  )
}



export function Thread({ id, className }: { id: string; className?: string }) {
  const { data: me } = useMe()
  const conv = useConversation(id)
  const send = useSendMessage(id)
  const [text, setText] = useState('')
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card', className)}>
      <AsyncView query={conv} skeleton={<Skeleton className="m-4 h-40" />}>
        {(c) => (
          <>
            <header className="border-b p-4">
              <h2 className="font-medium">{c.subject}</h2>
              <p className="text-xs text-muted-foreground">{c.participants.map((p) => p.name).join(', ')}</p>
            </header>
            <ol className="flex max-h-[420px] min-h-40 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
              {c.messages.length === 0 && <li className="text-sm text-muted-foreground">Belum ada pesan. Mulai percakapan.</li>}
              {c.messages.map((m) => (
                <li key={m.id} className={cn('max-w-[85%] rounded-xl px-3 py-2 text-sm', m.userId === me?.id ? 'self-end bg-primary/10' : 'self-start bg-muted')}>
                  <p className="text-xs text-muted-foreground">{m.by} · {formatRelative(m.at)}</p>
                  <p className="mt-0.5">{m.text}</p>
                </li>
              ))}
            </ol>
            <form
              className="flex gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (text.trim()) send.mutate(text, { onSuccess: () => setText('') })
              }}
            >
              <label className="sr-only" htmlFor={`msg-${id}`}>Pesan</label>
              <input id={`msg-${id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan…" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
              <Button type="submit" size="icon" className="size-9" aria-label="Kirim" disabled={!text.trim() || send.isPending}><Send /></Button>
            </form>
          </>
        )}
      </AsyncView>
    </section>
  )
}



function PriceDialog({ title, description, label, onSubmit, onClose, pending, error }: { title: string; description: string; label: string; onSubmit: (price: number, note: string) => void; onClose: () => void; pending: boolean; error: unknown }) {
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label={label} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} error={fieldError(error, 'priceIdr')} />
        <Field label="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!(Number(price) > 0) || pending} onClick={() => onSubmit(Number(price), note)}>Kirim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuoteActions({ rfqId, q, side, open, unit }: { rfqId: string; q: Quote; side: 'buyer' | 'supplier'; open: boolean; unit: string }) {
  const act = useRfqAction(rfqId)
  const navigate = useNavigate()
  const [priceFor, setPriceFor] = useState<QuoteAction | null>(null)
  const actions = quoteActions(q.status, side, open)
  const run = (action: QuoteAction, priceIdr?: number, note?: string) =>
    act.mutateAsync({ type: 'action', quoteId: q.id, action, priceIdr, note }).then((r) => {
      setPriceFor(null)
      toast({ title: QUOTE_ACTION_LABEL[action], tone: action === 'decline' || action === 'withdraw' ? 'gray' : 'green' })
      if ((action === 'accept' || action === 'accept_counter') && r.transactionId) navigate(`/app/transactions/${r.transactionId}`)
    })
  return (
    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      {actions.map((a) =>
        a === 'counter' || a === 'revise' ? (
          <Button key={a} size="xs" variant="outline" onClick={() => setPriceFor(a)}>{QUOTE_ACTION_LABEL[a]}</Button>
        ) : a === 'accept' || a === 'accept_counter' ? (
          <ConfirmDialog
            key={a}
            trigger={<Button size="xs">{QUOTE_ACTION_LABEL[a]}</Button>}
            title={`${QUOTE_ACTION_LABEL[a]}?`}
            impact={`Deal ${formatNumber(q.quantity)} ${unit} × ${formatIdr(a === 'accept_counter' ? q.counterPriceIdr! : q.priceIdr)} dengan termin ${TERMS[q.terms].label}. Transaksi dibuat dan penawaran lain ditutup.`}
            confirmLabel="Deal"
            onConfirm={() => run(a)}
          />
        ) : (
          <Button key={a} size="xs" variant="ghost" onClick={() => run(a)}>{QUOTE_ACTION_LABEL[a]}</Button>
        ),
      )}
      {priceFor && (
        <PriceDialog
          title={QUOTE_ACTION_LABEL[priceFor]}
          description={priceFor === 'counter' ? `${q.supplier.name} menawarkan ${formatIdr(q.priceIdr)}/${unit}.` : `Tawaran balik pembeli: ${formatIdr(q.counterPriceIdr ?? 0)}/${unit}.`}
          label={`Harga per ${unit} (Rp)`}
          pending={act.isPending}
          error={act.error}
          onClose={() => setPriceFor(null)}
          onSubmit={(price, note) => run(priceFor, price, note)}
        />
      )}
    </div>
  )
}

function SupplierQuoteForm({ rfqId, qty, unit }: { rfqId: string; qty: number; unit: string }) {
  const act = useRfqAction(rfqId)
  const [f, setF] = useState({ priceIdr: '', quantity: String(qty), leadTimeDays: '3', terms: 'escrow' as PaymentTerms, note: '' })
  return (
    <form
      className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5"
      onSubmit={(e) => {
        e.preventDefault()
        act.mutate({ type: 'quote', quote: { priceIdr: Number(f.priceIdr), quantity: Number(f.quantity), leadTimeDays: Number(f.leadTimeDays), terms: f.terms, note: f.note } }, { onSuccess: () => toast({ title: 'Penawaran terkirim', tone: 'green' }) })
      }}
    >
      <div><h3 className="font-semibold">Buat penawaran</h3><p className="mt-1 text-sm text-muted-foreground">Isi harga dan kesiapan pasok untuk permintaan ini.</p></div>
      <Field label={`Harga per ${unit} (Rp)`} type="number" min={0} value={f.priceIdr} onChange={(e) => setF({ ...f, priceIdr: e.target.value })} error={fieldError(act.error, 'priceIdr')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Kuantitas (${unit})`} type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={fieldError(act.error, 'quantity')} />
        <Field label="Waktu siap (hari)" type="number" min={0} value={f.leadTimeDays} onChange={(e) => setF({ ...f, leadTimeDays: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl bg-muted/35 p-3">
        <span className="text-sm font-medium">Termin bayar</span>
        <Segmented label="Termin bayar" value={f.terms} options={TERM_OPTIONS} onChange={(v) => setF({ ...f, terms: v })} />
      </div>
      <Field label="Catatan" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <FormError error={act.error} />
      <Button type="submit" className="h-10" disabled={act.isPending}>Kirim penawaran</Button>
    </form>
  )
}

export function RfqDetailPage() {
  const { id = '' } = useParams()
  const query = useRfq(id)
  const close = useRfqAction(id)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(r) => {
        const open = r.status === 'open'
        const mine = r.side === 'supplier' ? r.quotes[0] : undefined
        return (
          <>
            <PageHeader
              title={r.item}
              description={<span className="flex flex-wrap items-center gap-1.5">{r.code} <Tag tone={RFQ_STATUS[r.status][1]}>{RFQ_STATUS[r.status][0]}</Tag> <CategoryTag id={r.categoryId} /> {r.side === 'supplier' && <span>dari {r.buyer.name}</span>}</span>}
              icon={FileQuestion}
              tone="blue"
              featured
              actions={
                <>
                  {r.transactionId && <Button className="h-9" render={<Link to={`/app/transactions/${r.transactionId}`} />}>Lihat transaksi <ArrowRight /></Button>}
                  {r.side === 'buyer' && open && (
                    <ConfirmDialog trigger={<Button variant="outline" className="h-9">Tutup RFQ</Button>} title="Tutup RFQ tanpa deal?" impact="Semua penawaran yang masih terbuka ditolak." confirmLabel="Tutup" destructive onConfirm={() => close.mutateAsync({ type: 'close' })} />
                  )}
                </>
              }
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section className="rounded-xl border bg-card p-4 md:p-5">
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    {[
                      ['Kuantitas', formatQty(r.quantity)],
                      ['Target harga', r.targetPriceIdr ? `${formatIdr(r.targetPriceIdr)}/${r.quantity.unit}` : '—'],
                      ['Penawaran sebelum', formatDate(r.deadline)],
                      ['Lokasi', r.location],
                      ['Spesifikasi', r.spec || '—'],
                    ].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
                  </dl>
                </section>

                {r.side === 'buyer' ? (
                  <section>
                    <h2 className="mb-3 font-medium">Penawaran ({r.quotes.length})</h2>
                    {r.quotes.length ? (
                      <DataTable
                        caption="Penawaran"
                        rows={r.quotes}
                        rowKey={(q) => q.id}
                        initialSort={{ key: 'price', dir: 'asc' }}
                        columns={[
                          { key: 'supplier', header: 'Supplier', primary: true, cell: (q) => <span className="inline-flex items-center gap-1.5"><EntityAvatar name={q.supplier.name} kind={q.supplier.kind} verified={q.supplier.verified} size={18} /> {q.supplier.name}</span> },
                          { key: 'price', header: `Harga/${r.quantity.unit}`, align: 'right', cell: (q) => <span>{formatIdr(q.priceIdr)}{q.counterPriceIdr && <span className="block text-xs text-muted-foreground">balik {formatIdr(q.counterPriceIdr)}</span>}</span>, sortValue: (q) => q.priceIdr },
                          { key: 'total', header: 'Total', align: 'right', cell: (q) => formatIdr(q.priceIdr * q.quantity, { compact: true }), sortValue: (q) => q.priceIdr * q.quantity },
                          { key: 'lead', header: 'Siap', align: 'right', cell: (q) => `${q.leadTimeDays} hari`, sortValue: (q) => q.leadTimeDays },
                          { key: 'terms', header: 'Termin', cell: (q) => TERMS[q.terms].label },
                          { key: 'status', header: 'Status', cell: (q) => <Tag tone={QUOTE_STATUS[q.status][1]}>{QUOTE_STATUS[q.status][0]}</Tag> },
                          { key: 'act', header: 'Aksi', cell: (q) => <QuoteActions rfqId={r.id} q={q} side="buyer" open={open} unit={r.quantity.unit} /> },
                        ]}
                      />
                    ) : (
                      <EmptyState title="Menunggu penawaran" description="Supplier di kategori ini sudah diberi tahu. Halaman ini memperbarui sendiri." />
                    )}
                  </section>
                ) : (
                  <section className="rounded-xl border bg-card p-4 md:p-5">
                    <h2 className="mb-3 font-medium">Penawaranmu</h2>
                    {mine ? (
                      <div className="flex flex-col gap-3 text-sm">
                        <p className="flex flex-wrap items-center gap-2"><Tag tone={QUOTE_STATUS[mine.status][1]}>{QUOTE_STATUS[mine.status][0]}</Tag> <span className="num font-medium">{formatIdr(mine.priceIdr)}/{r.quantity.unit}</span> · {formatNumber(mine.quantity)} {r.quantity.unit} · {TERMS[mine.terms].label}</p>
                        {mine.counterPriceIdr && mine.status === 'countered' && <p className="rounded-lg bg-muted p-2.5">Pembeli menawar balik <b>{formatIdr(mine.counterPriceIdr)}/{r.quantity.unit}</b>.</p>}
                        <ul className="text-xs text-muted-foreground">{mine.history.map((h, i) => <li key={i}>{formatRelative(h.at)} · {h.by}: {h.text}</li>)}</ul>
                        <QuoteActions rfqId={r.id} q={mine} side="supplier" open={open} unit={r.quantity.unit} />
                      </div>
                    ) : open ? (
                      <SupplierQuoteForm rfqId={r.id} qty={r.quantity.value} unit={r.quantity.unit} />
                    ) : (
                      <p className="text-sm text-muted-foreground">RFQ sudah ditutup.</p>
                    )}
                  </section>
                )}
              </div>
              <Thread id={r.conversationId} className="lg:sticky lg:top-20 lg:self-start" />
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}



export function MessagesPage() {
  const { id } = useParams()
  const list = useConversations()
  return (
    <>
      <PageHeader title="Pesan" description="Percakapan dengan pembeli, supplier, dan match." icon={MessagesSquare} tone="purple" featured />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <AsyncView query={list} skeleton={<Skeleton className="h-80 rounded-2xl" />} emptyFallback={false}>
          {(cs) => (
            <section className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]', id && 'max-lg:hidden')}>
              <header className="flex items-end justify-between gap-2 border-b bg-muted/15 px-4 py-4">
                <div><h2 className="font-semibold tracking-tight">Percakapan</h2><p className="mt-1 text-xs text-muted-foreground">Pesan terkait RFQ, match, dan transaksi.</p></div>
                <span className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">{cs.length}</span>
              </header>
              {cs.length ? (
                <ul className="grid gap-1 p-2">
                  {cs.map((c) => (
                    <li key={c.id}>
                      <Link to={`/app/messages/${c.id}`} aria-current={c.id === id ? 'page' : undefined} className={cn('block rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/45', c.id === id && 'border-primary/20 bg-primary/5 shadow-sm')}>
                        <p className="truncate text-sm font-semibold">{c.subject}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{c.messages.at(-1)?.text ?? 'Belum ada pesan'}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatRelative(c.updatedAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState icon={MessagesSquare} tone="purple" title="Belum ada percakapan" description="Percakapan muncul saat kamu mengirim RFQ atau terhubung melalui Matches." />
                </div>
              )}
            </section>
          )}
        </AsyncView>
        {id ? (
          <div className="flex min-w-0 flex-col gap-3">
            <Link to="/app/messages" className="inline-flex min-h-9 items-center self-start rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden">← Semua percakapan</Link>
            <ThreadWithLink id={id} />
          </div>
        ) : (
          <section className="hidden min-h-[26rem] items-center justify-center rounded-2xl border border-dashed bg-muted/10 p-8 text-center lg:flex">
            <div className="max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-purple-500/10 text-purple-700 dark:text-purple-300"><MessagesSquare className="size-5" aria-hidden="true" /></span>
              <h2 className="mt-4 font-semibold">Pilih percakapan</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pilih dari daftar untuk membaca pesan dan melanjutkan diskusi dengan mitramu.</p>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function ThreadWithLink({ id }: { id: string }) {
  const conv = useConversation(id)
  const link = conv.data?.link
  return (
    <>
      {link && <Link to={link.href} className="self-start text-sm font-medium text-primary hover:underline">Buka {link.type === 'rfq' ? 'RFQ' : link.type === 'match' ? 'match' : 'transaksi'} terkait →</Link>}
      <Thread id={id} />
    </>
  )
}
