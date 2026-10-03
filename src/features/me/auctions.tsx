import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, FileUp, Gavel, Plus, Scale, Trophy } from 'lucide-react'
import type { AllocationLine, AuctionDetail, CreateAuctionInput, DemandListing, MyBid } from '@/domain/types'
import { AUCTION_TYPES } from '@/domain/catalog'
import { bidLimit, lowerWins, validateBid } from '@/domain/auction'
import { formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useAuctionAction, useAuctionMe, useAward, useCreateAuction, useEvaluation, useListings, useMyAuctions } from './hooks'
import { auctionPriceLabel } from '@/features/economy/utils'
import { AuctionCard, CardGrid } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { Countdown } from '@/components/Countdown'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Wizard, SummaryRow } from '@/components/Wizard'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const isLive = (s: string) => s === 'live' || s === 'extended'

// ── Qualification (PRD §8.8 supplier: qualify) ───────────────────

export function QualifyDialog({ auctionId, title, onClose }: { auctionId: string; title: string; onClose: () => void }) {
  const me = useAuctionMe(auctionId, true)
  const action = useAuctionAction(auctionId)
  const [doc, setDoc] = useState('')
  const [accept, setAccept] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kualifikasi: {title}</DialogTitle>
          <DialogDescription>Penuhi syarat berikut untuk bisa mengajukan bid.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {me.data?.qualification.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.done ? <CheckCircle2 className="mt-0.5 size-4 text-primary" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
              <span>
                {c.label}
                {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-hover">
          <FileUp className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate">{doc || 'Unggah dokumen spesifikasi (PDF)'}</span>
          <input type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => setDoc(e.target.files?.[0]?.name ?? '')} />
        </label>
        {fieldError(action.error, 'document') && <p className="text-xs text-destructive">{fieldError(action.error, 'document')}</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 accent-primary" />
          Saya menyetujui aturan auction, termasuk bid yang mengikat dan aturan perpanjangan waktu.
        </label>
        {fieldError(action.error, 'email') && <p className="text-xs text-destructive">{fieldError(action.error, 'email')}</p>}
        <FormError error={action.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Nanti</Button>
          <Button
            disabled={!doc || !accept || action.isPending}
            onClick={() => action.mutate({ type: 'qualify', documentName: doc, acceptRules: accept }, { onSuccess: () => { toast({ title: 'Kamu terkualifikasi', body: 'Sekarang kamu bisa mengajukan bid.', tone: 'green' }); onClose() } })}
          >
            {action.isPending ? 'Memeriksa…' : 'Ajukan kualifikasi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Bid box for signed-in users (auction room) ───────────────────

function BidStatusLine({ bid }: { bid: MyBid }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
      <StatusBadge entity="bid" status={bid.status} />
      <span className="num font-medium">{formatIdr(bid.priceIdr)}</span>
      {bid.rank !== undefined && <span className="text-muted-foreground">· peringkat {bid.rank}</span>}
      <span className="ml-auto text-xs text-muted-foreground">{formatRelative(bid.updatedAt)}</span>
    </div>
  )
}

export function ParticipantBidBox({ a }: { a: AuctionDetail }) {
  const me = useAuctionMe(a.id, true)
  const action = useAuctionAction(a.id)
  const navigate = useNavigate()
  const [qualifying, setQualifying] = useState(false)
  const [price, setPrice] = useState('')
  const unit = a.lot.quantity.unit

  if (me.isPending) return <Skeleton className="h-32" />
  if (!me.data) return null
  const { qualification, bid, owner, evaluateHref } = me.data

  if (owner)
    return (
      <div className="text-sm">
        <p className="text-muted-foreground">Kamu pembuat auction ini.</p>
        <Button className="mt-3 h-10 w-full" render={<Link to={evaluateHref ?? `/app/auctions/${a.id}/evaluate`} />}><Scale /> Bandingkan penawaran</Button>
      </div>
    )

  if (!isLive(a.status))
    return bid ? <BidStatusLine bid={bid} /> : <p className="text-sm text-muted-foreground">Auction tidak sedang berjalan.</p>

  if (qualification.status !== 'qualified')
    return (
      <div>
        <p className="text-sm font-medium">Kualifikasi dulu sebelum bid</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {qualification.checks.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {c.done ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
              <span className={c.done ? 'text-muted-foreground' : undefined}>{c.label}</span>
            </li>
          ))}
        </ul>
        <Button className="mt-4 h-10 w-full" onClick={() => setQualifying(true)}>Mulai kualifikasi</Button>
        {qualifying && <QualifyDialog auctionId={a.id} title={a.title} onClose={() => setQualifying(false)} />}
      </div>
    )

  if (a.type === 'dutch')
    return (
      <div>
        <p className="text-sm text-muted-foreground">Yang pertama menerima harga langsung menang.</p>
        <ConfirmDialog
          trigger={<Button className="mt-4 h-10 w-full">Terima {formatIdr(a.currentPriceIdr ?? a.openingPriceIdr)}/{unit}</Button>}
          title="Terima harga sekarang?"
          impact={<>Kamu membeli {formatQty(a.lot.quantity)} seharga <b>{formatIdr((a.currentPriceIdr ?? a.openingPriceIdr) * a.lot.quantity.value)}</b>. Transaksi langsung dibuat.</>}
          confirmLabel="Terima harga"
          onConfirm={() => action.mutateAsync({ type: 'accept' }).then((r) => navigate(`/app/transactions/${(r as { transactionId: string }).transactionId}`))}
        />
      </div>
    )

  const limit = bidLimit({ ...a, currentPriceIdr: a.visibility === 'full' ? a.currentPriceIdr : undefined })
  const value = Number(price || limit)
  const error = price ? validateBid({ ...a, currentPriceIdr: a.visibility === 'full' ? a.currentPriceIdr : undefined }, value) : null
  const total = value * a.lot.quantity.value

  return (
    <div className="flex flex-col gap-3">
      {bid && <BidStatusLine bid={bid} />}
      <Field
        label={`${bid ? 'Update' : 'Harga'} bid per ${unit} (Rp)`}
        type="number"
        inputMode="numeric"
        placeholder={String(limit)}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={error ?? fieldError(action.error, 'price')}
        hint={a.type === 'sealed' ? 'Sealed: hanya bid terakhirmu yang dihitung, dibuka saat penutupan.' : `${lowerWins(a.type) ? 'Maksimal' : 'Minimal'} ${formatIdr(limit)}`}
      />
      <ConfirmDialog
        trigger={<Button className="h-10 w-full" disabled={!!error}>{bid ? 'Update bid' : 'Kirim bid'}</Button>}
        title={`Kirim bid ${formatIdr(value)}/${unit}?`}
        description="Bid mengikat sampai auction ditutup."
        impact={
          <ul className="list-disc space-y-1 pl-4">
            <li>Nilai total: <b>{formatIdr(total)}</b> untuk {formatQty(a.lot.quantity)}</li>
            <li>Bid terdepan tidak bisa ditarik; bid lain bisa ditarik sampai 30 menit sebelum tutup</li>
            <li>Bid di 2 menit terakhir memperpanjang auction 5 menit (maks. 3 kali)</li>
          </ul>
        }
        confirmLabel="Kirim bid"
        onConfirm={() => action.mutateAsync({ type: 'bid', priceIdr: value }).then(() => { setPrice(''); toast({ title: 'Bid terkirim', body: `${formatIdr(value)}/${unit}`, tone: 'green' }) })}
      />
      <FormError error={action.error} />
      {bid?.canWithdraw && (
        <ConfirmDialog
          trigger={<Button variant="ghost" className="h-9">Tarik bid</Button>}
          title="Tarik bid?"
          impact="Bid kamu dihapus dari peringkat. Kamu masih bisa bid lagi selama auction berjalan."
          confirmLabel="Tarik bid"
          destructive
          onConfirm={() => action.mutateAsync({ type: 'withdraw' })}
        />
      )}
    </div>
  )
}

// ── My auctions page ─────────────────────────────────────────────

export function MyAuctionsPage() {
  const query = useMyAuctions()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'supplier' | 'buyer'>(params.get('tab') === 'buyer' ? 'buyer' : 'supplier')
  const [sub, setSub] = useState<'bids' | 'eligible' | 'won' | 'lost'>('bids')
  // Qualification dialog is URL state (?qualify=<auctionId>), reachable from the public auction room.
  const qualifyId = params.get('qualify')
  const qualify = qualifyId ? { id: qualifyId, title: query.data?.eligible.find((a) => a.id === qualifyId)?.title ?? 'auction ini' } : null
  const setQualify = (q: { id: string } | null) => setParams((p) => (q ? p.set('qualify', q.id) : p.delete('qualify'), p), { replace: true })

  return (
    <>
      <PageHeader
        title="Auctions"
        description="Bid yang kamu ajukan sebagai supplier, dan auction yang kamu buat sebagai pembeli."
        icon={Gavel}
        tone="orange"
        actions={
          <>
            <Segmented label="Peran" value={tab} options={[['supplier', 'Sebagai supplier'], ['buyer', 'Sebagai pembeli']]} onChange={setTab} />
            {tab === 'buyer' && <Button className="h-9" render={<Link to="/app/auctions/new" />}><Plus /> Buat auction</Button>}
          </>
        }
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />}>
        {(d) => {
          if (tab === 'buyer')
            return d.owned.length ? (
              <CardGrid>
                {d.owned.map((a) => (
                  <div key={a.id} className="flex flex-col gap-2">
                    <AuctionCard a={a} />
                    <Button variant="outline" className="h-9" render={<Link to={`/app/auctions/${a.id}/evaluate`} />}><Scale /> Evaluasi & award</Button>
                  </div>
                ))}
              </CardGrid>
            ) : (
              <EmptyState icon={Gavel} tone="orange" title="Belum ada auction" description="Ubah demand jadi reverse auction supaya supplier bersaing menawarkan harga terbaik." action={<Button render={<Link to="/app/auctions/new" />}>Buat auction</Button>} />
            )

          const groups = {
            bids: d.bids.filter((b) => ['submitted', 'leading', 'outbid'].includes(b.status)),
            won: d.bids.filter((b) => b.status === 'won'),
            lost: d.bids.filter((b) => b.status === 'lost' || b.status === 'withdrawn'),
          }
          return (
            <>
              <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kelompok">
                {([['bids', 'Bid aktif', groups.bids.length], ['eligible', 'Eligible', d.eligible.length], ['won', 'Menang', groups.won.length], ['lost', 'Kalah', groups.lost.length]] as const).map(([k, l, n]) => (
                  <button key={k} role="radio" aria-checked={sub === k} onClick={() => setSub(k)} className={cn('rounded-full border px-3 py-1 text-sm', sub === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover')}>
                    {l} <span className="num opacity-70">{n}</span>
                  </button>
                ))}
              </div>
              {sub === 'eligible' ? (
                d.eligible.length ? (
                  <DataTable
                    caption="Auction yang bisa kamu ikuti"
                    rows={d.eligible}
                    rowKey={(a) => a.id}
                    rowHref={(a) => `/auctions/${a.id}`}
                    columns={[
                      { key: 'title', header: 'Auction', primary: true, cell: (a) => a.title },
                      { key: 'type', header: 'Tipe', cell: (a) => <Tag>{AUCTION_TYPES[a.type].label}</Tag> },
                      { key: 'price', header: 'Harga terbaik', align: 'right', cell: (a) => auctionPriceLabel(a) },
                      { key: 'time', header: 'Waktu', cell: (a) => (isLive(a.status) ? <Countdown to={a.endsAt} /> : <StatusBadge entity="auction" status={a.status} />) },
                      { key: 'q', header: 'Kualifikasi', cell: (a) => <StatusBadge entity="qualification" status={a.qualification} /> },
                      {
                        key: 'act', header: 'Aksi',
                        cell: (a) => a.qualification === 'qualified' ? <Tag tone="green">Siap bid</Tag> : (
                          <Button size="xs" onClick={(e) => { e.stopPropagation(); setQualify({ id: a.id }) }}>Kualifikasi</Button>
                        ),
                      },
                    ]}
                  />
                ) : <EmptyState title="Tidak ada auction eligible saat ini" />
              ) : groups[sub].length ? (
                <DataTable
                  caption="Bid saya"
                  rows={groups[sub]}
                  rowKey={(b) => b.auction.id}
                  rowHref={(b) => `/auctions/${b.auction.id}`}
                  columns={[
                    { key: 'title', header: 'Auction', primary: true, cell: (b) => b.auction.title },
                    { key: 'mine', header: 'Bid saya', align: 'right', cell: (b) => formatIdr(b.priceIdr), sortValue: (b) => b.priceIdr },
                    { key: 'best', header: 'Harga terbaik', align: 'right', cell: (b) => auctionPriceLabel(b.auction) },
                    { key: 'rank', header: 'Peringkat', align: 'right', cell: (b) => (b.rank ? `#${b.rank}` : '—'), sortValue: (b) => b.rank ?? 99 },
                    { key: 'status', header: 'Status', cell: (b) => <StatusBadge entity="bid" status={b.status} /> },
                    { key: 'time', header: 'Waktu', cell: (b) => (isLive(b.auction.status) ? <Countdown to={b.auction.endsAt} /> : formatRelative(b.updatedAt)) },
                  ]}
                />
              ) : (
                <EmptyState icon={sub === 'won' ? Trophy : Gavel} title={sub === 'bids' ? 'Belum ada bid aktif' : sub === 'won' ? 'Belum ada kemenangan' : 'Tidak ada'} action={sub === 'bids' && <Button onClick={() => setSub('eligible')}>Lihat auction eligible</Button>} />
              )}
            </>
          )
        }}
      </AsyncView>
      {qualify && <QualifyDialog auctionId={qualify.id} title={qualify.title} onClose={() => setQualify(null)} />}
    </>
  )
}

// ── Create auction from a demand (PRD §8.8 buyer) ────────────────

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

export function CreateAuctionPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const demands = useListings('demand')
  const create = useCreateAuction()
  const options = (demands.data ?? []).filter((d): d is DemandListing => d.kind === 'demand' && !d.auctionId && ['open', 'matched'].includes(d.status))
  const [demandId, setDemandId] = useState(params.get('demand') ?? '')
  const demand = options.find((d) => d.id === demandId)
  const [form, setForm] = useState({ type: 'reverse' as 'reverse' | 'sealed', duration: '1440', opening: '', step: '', invite: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const suggestedOpening = demand ? Math.round(demand.budgetIdr / demand.quantity.value) : 0
  const opening = Number(form.opening || suggestedOpening)
  const step = Number(form.step || Math.max(1, Math.round(opening * 0.01)))

  function submit() {
    const input: CreateAuctionInput = {
      demandId, type: form.type, durationMinutes: Number(form.duration), openingPriceIdr: opening, minStepIdr: step,
      visibility: form.type === 'sealed' ? 'sealed' : 'full', invite: form.invite.split(',').map((s) => s.trim()).filter(Boolean),
    }
    create.mutate(input, { onSuccess: (a) => { toast({ title: 'Auction dibuka', body: a.title, tone: 'green' }); navigate(`/auctions/${a.id}`) } })
  }

  return (
    <>
      <PageHeader title="Buat auction" description="Supplier bersaing menawarkan harga untuk demand-mu." icon={Gavel} tone="orange" />
      <Wizard
        submitLabel="Buka auction"
        submitting={create.isPending}
        onSubmit={submit}
        error={<FormError error={create.error} />}
        steps={[
          {
            id: 'demand', title: 'Demand', blocker: demand ? undefined : 'Pilih demand',
            content: (
              <div className="flex flex-col gap-3">
                <SelectField label="Demand yang dilelang" value={demandId} onChange={(e) => setDemandId(e.target.value)}>
                  <option value="">{options.length ? 'Pilih demand' : 'Belum ada demand terbuka'}</option>
                  {options.map((d) => <option key={d.id} value={d.id}>{d.item} · {formatQty(d.quantity, { compact: true })}</option>)}
                </SelectField>
                <Link to="/app/demand/new" className="text-sm font-medium text-primary hover:underline">Buat demand baru</Link>
              </div>
            ),
          },
          {
            id: 'rules', title: 'Tipe & aturan', blocker: opening > 0 ? undefined : 'Isi harga pembuka',
            content: (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Tipe auction</span>
                  <Segmented label="Tipe auction" value={form.type} options={[['reverse', 'Reverse (harga turun)'], ['sealed', 'Sealed bid']]} onChange={(v) => set('type', v)} />
                </div>
                <SelectField label="Durasi" value={form.duration} onChange={(e) => set('duration', e.target.value)}>
                  {MOCKS && <option value="5">5 menit (demo)</option>}
                  <option value="60">1 jam</option>
                  <option value="1440">24 jam</option>
                  <option value="4320">3 hari</option>
                </SelectField>
                <Field label={`Harga pembuka per ${demand?.quantity.unit ?? 'unit'} (Rp)`} type="number" placeholder={String(suggestedOpening || '')} value={form.opening} onChange={(e) => set('opening', e.target.value)} error={fieldError(create.error, 'openingPriceIdr')} hint={suggestedOpening ? `Dari budget: ${formatIdr(suggestedOpening)}` : undefined} />
                {form.type === 'reverse' && <Field label="Penurunan minimum (Rp)" type="number" placeholder={String(step)} value={form.step} onChange={(e) => set('step', e.target.value)} hint="Default 1% dari harga pembuka" />}
              </div>
            ),
          },
          {
            id: 'invite', title: 'Undang supplier',
            content: (
              <div className="flex flex-col gap-3">
                <Field label="Undang supplier (opsional)" placeholder="Nama atau email, pisahkan dengan koma" value={form.invite} onChange={(e) => set('invite', e.target.value)} hint="Supplier terkualifikasi lain tetap bisa ikut." />
                <p className="text-sm text-muted-foreground">Setelah dibuka, auction langsung live. Setelah ditutup kamu membandingkan penawaran dan menetapkan pemenang.</p>
              </div>
            ),
          },
        ]}
        summary={
          <>
            <SummaryRow label="Demand" value={demand?.item} />
            <SummaryRow label="Kuantitas" value={demand ? formatQty(demand.quantity) : ''} />
            <SummaryRow label="Tipe" value={form.type === 'sealed' ? 'Sealed bid' : 'Reverse'} />
            <SummaryRow label="Harga pembuka" value={opening ? formatIdr(opening) : ''} />
            <SummaryRow label="Nilai pembuka" value={demand && opening ? formatIdr(opening * demand.quantity.value, { compact: true }) : ''} />
            <SummaryRow label="Budget" value={demand ? formatIdr(demand.budgetIdr, { compact: true }) : ''} />
          </>
        }
      />
    </>
  )
}

// ── Evaluate & award (PRD §8.8 buyer: compare, award) ────────────

export function EvaluatePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useEvaluation(id)
  const award = useAward(id)
  const [manual, setManual] = useState<AllocationLine[] | null>(null)

  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {({ auction: a, offers, suggestion }) => {
        const lines = manual ?? suggestion.lines
        const total = lines.reduce((s, l) => s + l.quantity * l.priceIdr, 0)
        const covered = lines.reduce((s, l) => s + l.quantity, 0)
        const unit = a.lot.quantity.unit
        const toggle = (offerId: string) => {
          const o = offers.find((x) => x.id === offerId)!
          const has = lines.some((l) => l.offerId === offerId)
          setManual(has ? lines.filter((l) => l.offerId !== offerId) : [...lines, { offerId, supplier: o.supplier.name, quantity: Math.min(o.capacity.value, Math.max(0, a.lot.quantity.value - covered)), priceIdr: o.priceIdr }])
        }
        return (
          <>
            <PageHeader
              title={a.title}
              description={<span className="flex flex-wrap items-center gap-1.5">{a.code} <StatusBadge entity="auction" status={a.status} /> {isLive(a.status) && <>sisa <Countdown to={a.endsAt} /></>}</span>}
              icon={Scale}
              tone="orange"
              actions={<Button variant="outline" className="h-9" render={<Link to={`/auctions/${a.id}`} />}>Buka auction room</Button>}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section className="min-w-0">
                <h2 className="mb-3 font-medium">Penawaran ({offers.length})</h2>
                {offers.length ? (
                  <DataTable
                    caption="Penawaran supplier"
                    rows={offers}
                    rowKey={(o) => o.id}
                    initialSort={{ key: 'price', dir: 'asc' }}
                    columns={[
                      { key: 'pick', header: 'Pilih', cell: (o) => <input type="checkbox" aria-label={`Pilih ${o.supplier.name}`} className="accent-primary" checked={lines.some((l) => l.offerId === o.id)} onChange={() => toggle(o.id)} disabled={a.status !== 'closed'} /> },
                      { key: 'supplier', header: 'Supplier', primary: true, cell: (o) => <span>{o.supplier.name} {o.supplier.verified && <Tag tone="teal">Verified</Tag>}</span> },
                      { key: 'price', header: `Harga/${unit}`, align: 'right', cell: (o) => formatIdr(o.priceIdr), sortValue: (o) => o.priceIdr },
                      { key: 'cap', header: 'Kapasitas', align: 'right', cell: (o) => formatQty(o.capacity, { compact: true }), sortValue: (o) => o.capacity.value },
                      { key: 'rep', header: 'Reputasi', align: 'right', cell: (o) => o.supplier.reputation, sortValue: (o) => o.supplier.reputation },
                      { key: 'at', header: 'Masuk', cell: (o) => <span className="text-muted-foreground">{formatRelative(o.submittedAt)}</span> },
                    ]}
                  />
                ) : (
                  <EmptyState icon={Gavel} title="Belum ada penawaran" description="Supplier terkualifikasi akan mulai menawar. Halaman ini memperbarui sendiri." />
                )}
              </section>

              <aside className="flex flex-col gap-4">
                <section className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium">{manual ? 'Alokasi manual' : 'Smart Allocation'}</h2>
                    {manual && <button className="text-xs text-primary hover:underline" onClick={() => setManual(null)}>Pakai saran</button>}
                  </div>
                  {!manual && <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>}
                  <ul className="mt-3 divide-y text-sm">
                    {lines.map((l) => (
                      <li key={l.offerId} className="flex justify-between gap-2 py-2">
                        <span className="truncate">{l.supplier}</span>
                        <span className="num shrink-0 text-right">{formatNumber(l.quantity)} × {formatIdr(l.priceIdr)}</span>
                      </li>
                    ))}
                  </ul>
                  <SummaryRow label="Tertutup" value={`${formatNumber(covered)} / ${formatNumber(a.lot.quantity.value)} ${unit}`} />
                  <SummaryRow label="Total" value={formatIdr(total)} />
                  {!manual && suggestion.savingsIdr > 0 && <SummaryRow label="Hemat vs pembuka" value={formatIdr(suggestion.savingsIdr)} />}
                  {a.status === 'closed' ? (
                    <ConfirmDialog
                      trigger={<Button className="mt-4 h-10 w-full" disabled={!lines.length}><Trophy /> Tetapkan pemenang</Button>}
                      title={`Award ke ${lines.length} supplier?`}
                      impact={<>Dibuat {lines.length} transaksi senilai total <b>{formatIdr(total)}</b>. Keputusan tercatat di audit trail dan tidak bisa diubah.</>}
                      confirmLabel="Tetapkan pemenang"
                      onConfirm={() => award.mutateAsync(lines).then(() => { toast({ title: 'Pemenang ditetapkan', body: `${lines.length} transaksi dibuat`, tone: 'green' }); navigate('/app/transactions') })}
                    />
                  ) : (
                    <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                      {a.status === 'awarded' ? 'Pemenang sudah ditetapkan.' : `Award dibuka setelah auction ditutup ${formatDateTime(a.endsAt)}.`}
                    </p>
                  )}
                  <FormError error={award.error} />
                </section>
              </aside>
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}
