import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, FileUp, Gavel, Scale, Trophy } from 'lucide-react'
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



function BidStatusLine({ bid }: { bid: MyBid }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
      <StatusBadge entity="bid" status={bid.status} />
      <span className="num font-medium">{formatIdr(bid.priceIdr)}</span>
      {bid.rank !== undefined && <span className="text-muted-foreground">· peringkat {bid.rank}</span>}
      {bid.capacity && <span className="text-muted-foreground">· kapasitas {formatQty(bid.capacity)}</span>}
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
  const [qty, setQty] = useState<string | null>(null)
  const unit = a.lot.quantity.unit

  if (me.isPending) return <Skeleton className="h-32" />
  if (!me.data) return null
  const { qualification, bid, owner, evaluateHref } = me.data

  if (owner)
    return (
      <div className="text-sm">
        <p className="text-muted-foreground">{evaluateHref?.startsWith('/org/') ? 'Auction ini milik organisasimu; evaluasi semua lot dari workspace bisnis.' : 'Kamu pembuat auction ini.'}</p>
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

  const withCapacity = lowerWins(a.type)
  const lotQty = a.lot.quantity.value
  const capText = qty ?? String(bid?.capacity?.value ?? lotQty)
  const capacity = Number(capText)
  const capError = withCapacity && !(capacity > 0 && capacity <= lotQty) ? `Kapasitas harus lebih dari 0 dan maksimal ${formatQty(a.lot.quantity)}` : null
  const covered = withCapacity && !capError ? capacity : lotQty
  const total = value * covered
  const withdrawRule = a.rules.find((r) => r.label === 'Penarikan bid')?.value

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
      {withCapacity && (
        <Field
          label={`Kapasitas (${unit})`}
          type="number"
          inputMode="decimal"
          value={capText}
          onChange={(e) => setQty(e.target.value)}
          error={capError ?? fieldError(action.error, 'quantity')}
          hint={`Berapa yang sanggup kamu penuhi dari ${formatQty(a.lot.quantity)}. Hanya terlihat oleh pembeli.`}
        />
      )}
      <ConfirmDialog
        trigger={<Button className="h-10 w-full" disabled={!!error || !!capError}>{bid ? 'Perbarui bid' : 'Kirim bid'}</Button>}
        title={`Kirim bid ${formatIdr(value)}/${unit}?`}
        description="Bid mengikat sampai auction ditutup."
        impact={
          <ul className="list-disc space-y-1 pl-4">
            <li>Nilai total: <b>{formatIdr(total)}</b> untuk {formatQty({ value: covered, unit })}{covered < lotQty ? ` dari ${formatQty(a.lot.quantity)}` : ''}</li>
            <li>{withdrawRule ? `Penarikan bid: ${withdrawRule}` : 'Bid terdepan tidak bisa ditarik; bid lain bisa ditarik sampai 30 menit sebelum tutup'}</li>
            {a.extension.windowMinutes > 0 && <li>Bid di {a.extension.windowMinutes} menit terakhir memperpanjang auction {a.extension.extendMinutes} menit (maks. 3 kali)</li>}
          </ul>
        }
        confirmLabel="Kirim bid"
        onConfirm={() => action.mutateAsync({ type: 'bid', priceIdr: value, quantity: withCapacity ? capacity : undefined }).then(() => { setPrice(''); setQty(null); toast({ title: 'Bid terkirim', body: `${formatIdr(value)}/${unit}`, tone: 'green' }) })}
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



export function MyAuctionsPage() {
  const query = useMyAuctions()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'supplier' | 'buyer'>(params.get('tab') === 'buyer' ? 'buyer' : 'supplier')
  const [sub, setSub] = useState<'bids' | 'eligible' | 'won' | 'lost'>('bids')

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
        featured
        actions={
          <div role="group" aria-label="Peran auction" className="inline-flex rounded-xl border bg-muted/55 p-1">
            {([['supplier', 'Sebagai supplier'], ['buyer', 'Sebagai pembeli']] as const).map(([role, label]) => (
              <button key={role} type="button" aria-pressed={tab === role} onClick={() => setTab(role)}
                className={cn('inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors', tab === role ? 'border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/15' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />}>
        {(d) => {
          const groups = {
            bids: d.bids.filter((b) => ['submitted', 'leading', 'outbid'].includes(b.status)),
            won: d.bids.filter((b) => b.status === 'won'),
            lost: d.bids.filter((b) => b.status === 'lost' || b.status === 'withdrawn'),
          }
          if (tab === 'buyer')
            return (
              <>
                <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Ringkasan auction yang dibuat">
                  <div className="rounded-2xl border bg-linear-to-br from-card to-orange-500/5 p-4 shadow-sm shadow-foreground/[0.02]"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auction dibuat</p><p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(d.owned.length)}</p><p className="mt-0.5 text-xs text-muted-foreground">Total auction milikmu</p></div>
                  <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02]"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sedang berlangsung</p><p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(d.owned.filter((a) => isLive(a.status)).length)}</p><p className="mt-0.5 text-xs text-muted-foreground">Auction yang menerima bid</p></div>
                  <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02]"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Perlu evaluasi</p><p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(d.owned.filter((a) => a.status === 'closed').length)}</p><p className="mt-0.5 text-xs text-muted-foreground">Auction selesai, siap ditinjau</p></div>
                </section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold tracking-tight">Auction yang kamu buat</h2><p className="mt-1 text-sm text-muted-foreground">Pantau proses dan evaluasi hasil penawaran supplier.</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{formatNumber(d.owned.length)} auction</span></div>
                {d.owned.length ? (
                  <CardGrid>
                    {d.owned.map((a) => (
                      <div key={a.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm shadow-foreground/[0.025]">
                        <AuctionCard a={a} />
                        <Button variant="outline" className="h-9 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5" render={<Link to={`/app/auctions/${a.id}/evaluate`} />}><Scale /> Evaluasi & award</Button>
                      </div>
                    ))}
                  </CardGrid>
                ) : (
                  <EmptyState icon={Gavel} tone="orange" title="Belum ada auction" description="Ubah demand jadi reverse auction supaya supplier bersaing menawarkan harga terbaik." action={<Button render={<Link to="/app/auctions/new" />}>Buat auction</Button>} />
                )}
              </>
            )

          return (
            <>
              <div className="mb-5 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02] sm:p-5">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold tracking-tight">Auction sebagai supplier</h2><p className="mt-1 text-sm text-muted-foreground">Tinjau bid yang kamu kirim, hasilnya, dan auction yang bisa diikuti.</p></div><span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300">{formatNumber(d.bids.length + d.eligible.length)} item</span></div>
                <div className="no-scrollbar overflow-x-auto"><div className="flex w-max gap-1 rounded-xl bg-muted/45 p-1">
                {([['bids', 'Bid aktif', groups.bids.length], ['eligible', 'Eligible', d.eligible.length], ['won', 'Menang', groups.won.length], ['lost', 'Kalah', groups.lost.length]] as const).map(([k, l, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={cn('rounded-lg border px-3.5 py-2 text-sm transition-colors', sub === k ? 'border-border/70 bg-background font-semibold text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground')}>
                    {l} <span className="num ml-1 text-xs opacity-70">{n}</span>
                  </button>
                ))}
                </div></div>
              </div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold tracking-tight">{sub === 'eligible' ? 'Auction yang bisa kamu ikuti' : sub === 'bids' ? 'Bid aktif' : sub === 'won' ? 'Auction dimenangkan' : 'Bid yang tidak aktif'}</h2><p className="mt-1 text-sm text-muted-foreground">Status terbaru dari aktivitas auction-mu.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{formatNumber(sub === 'eligible' ? d.eligible.length : groups[sub].length)} item</span></div>
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
      <PageHeader title="Buat auction" description="Supplier bersaing menawarkan harga untuk demand-mu." icon={Gavel} tone="orange" featured />
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
                <Field label={`Harga pembuka per ${demand?.quantity.unit ?? 'unit'} (Rp)`} type="number" placeholder={String(suggestedOpening || '')} value={form.opening} onChange={(e) => set('opening', e.target.value)} error={fieldError(create.error, 'openingPriceIdr')} hint={suggestedOpening ? `Dari anggaran: ${formatIdr(suggestedOpening)}` : undefined} />
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
            <SummaryRow label="Anggaran" value={demand ? formatIdr(demand.budgetIdr, { compact: true }) : ''} />
          </>
        }
      />
    </>
  )
}



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
              featured
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
