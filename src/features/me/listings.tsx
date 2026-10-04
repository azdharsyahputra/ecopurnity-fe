import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, Gavel, PackageOpen, Pencil, Plus, ShoppingCart, Store } from 'lucide-react'
import type { CategoryId, DeliveryMode, DemandListing, Listing, ListingInput, SupplyListing } from '@/domain/types'
import { STATUS } from '@/domain/status'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatDate, formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLocalDraft } from '@/lib/useLocalDraft'
import { useListing, useListingAction, useListings, useSaveListing } from './hooks'
import { CategoryTag, OpportunityCard } from '@/features/economy/components'
import { usePriceSuggestion } from '@/features/economy/hooks'
import { priceVerdict } from '@/domain/pricing'
import { attachmentsBlocker, draftsOf, toRefs, type AttachmentDraft } from '@/domain/attachments'
import { AttachmentGallery, AttachmentsField } from '@/components/Attachments'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { Wizard, SummaryRow } from '@/components/Wizard'
import { Field, FormError, Segmented, SelectField, TextareaField } from '@/components/form'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type Kind = 'supply' | 'demand'

const COPY = {
  supply: {
    title: 'Supply', icon: PackageOpen, tone: 'teal' as const, add: 'Tambah supply',
    description: 'Apa yang kamu punya: produk, bahan, kapasitas, atau jasa yang siap ditawarkan.',
    empty: 'Belum ada supply', emptyBody: 'Daftarkan yang kamu punya supaya engine bisa mencarikan market dan pembeli.',
  },
  demand: {
    title: 'Demand', icon: ShoppingCart, tone: 'blue' as const, add: 'Tambah demand',
    description: 'Apa yang kamu butuhkan. Gabungkan dengan pembeli lain atau jadikan auction.',
    empty: 'Belum ada demand', emptyBody: 'Catat kebutuhanmu supaya supplier dan opportunity kolektif bisa menemukanmu.',
  },
}

const DELIVERY: [DeliveryMode, string][] = [['pickup', 'Diambil'], ['deliver', 'Dikirim'], ['both', 'Keduanya']]
const DELIVERY_LABEL = Object.fromEntries(DELIVERY) as Record<DeliveryMode, string>

const priceOf = (l: Listing) => (l.kind === 'supply' ? `${formatIdr(l.priceIdr)}/${l.quantity.unit}` : formatIdr(l.budgetIdr, { compact: true }))

// ── List ─────────────────────────────────────────────────────────

export function ListingsPage({ kind }: { kind: Kind }) {
  const c = COPY[kind]
  const query = useListings(kind)
  const [status, setStatus] = useState('')
  const statuses = Object.entries(STATUS[kind]) as [string, readonly [string, string]][]

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        icon={c.icon}
        tone={c.tone}
        featured
        actions={<Button className="h-9" render={<Link to={`/app/${kind}/new`} />}><Plus /> {c.add}</Button>}
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        empty={<EmptyState icon={c.icon} tone={c.tone} title={c.empty} description={c.emptyBody} action={<Button render={<Link to={`/app/${kind}/new`} />}><Plus /> {c.add}</Button>} />}
      >
        {(rows) => {
          const visible = status ? rows.filter((r) => r.status === status) : rows
          const activeStatuses = kind === 'supply' ? ['available', 'reserved', 'in_market'] : ['open', 'matched', 'in_market']
          const activeCount = rows.filter((r) => activeStatuses.includes(r.status)).length
          const categoryCount = new Set(rows.map((r) => r.categoryId)).size
          return (
            <>
              <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Ringkasan listing">
                <div className="rounded-2xl border bg-linear-to-br from-card to-primary/5 p-4 shadow-sm shadow-foreground/[0.02]">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total {c.title.toLowerCase()}</p>
                  <p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(rows.length)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Seluruh listing yang tercatat</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02]">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sedang aktif</p>
                  <p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(activeCount)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Terbuka untuk peluang dagang</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02]">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kategori terjangkau</p>
                  <p className="num mt-2 text-2xl font-semibold tracking-tight">{formatNumber(categoryCount)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Kategori berbeda dalam daftar</p>
                </div>
              </section>
              <section className="mb-5 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5" aria-label="Filter listing">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-sm font-semibold">Daftar listing</h2><p className="mt-0.5 text-xs text-muted-foreground">Filter berdasarkan status untuk menemukan listing dengan cepat.</p></div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"><span className="num font-semibold text-foreground">{visible.length}</span> dari {rows.length}</span>
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status">
                {[['', 'Semua'] as const, ...statuses.map(([k, [label]]) => [k, label] as const)].map(([k, label]) => {
                  const count = k ? rows.filter((r) => r.status === k).length : rows.length
                  return (
                    <button
                      key={k || 'all'}
                      type="button"
                      role="radio"
                      aria-checked={status === k}
                      onClick={() => setStatus(k)}
                      className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', status === k ? 'border-primary bg-primary font-medium text-primary-foreground shadow-sm' : 'border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground')}
                    >
                      {label} <span className="num opacity-70">{count}</span>
                    </button>
                  )
                })}
                </div>
              </section>
              {visible.length === 0 ? (
                <EmptyState title="Tidak ada listing dengan status ini" description="Coba pilih status lain untuk melihat listing yang tersedia." action={<Button variant="outline" onClick={() => setStatus('')}>Tampilkan semua</Button>} />
              ) : (
                <DataTable
                  caption={`Daftar ${c.title.toLowerCase()}`}
                  rows={visible}
                  rowKey={(r) => r.id}
                  rowHref={(r) => `/app/${kind}/${r.id}`}
                  initialSort={{ key: 'updated', dir: 'desc' }}
                  columns={[
                    { key: 'item', header: 'Item', primary: true, cell: (r) => <span>{r.item} <span className="ml-1 text-xs font-normal text-muted-foreground">{r.code}</span></span>, sortValue: (r) => r.item },
                    { key: 'cat', header: 'Kategori', cell: (r) => <CategoryTag id={r.categoryId} /> },
                    { key: 'qty', header: 'Kuantitas', align: 'right', cell: (r) => formatQty(r.quantity, { compact: true }), sortValue: (r) => r.quantity.value },
                    { key: 'price', header: kind === 'supply' ? 'Harga ekspektasi' : 'Budget', align: 'right', cell: priceOf, sortValue: (r) => (r.kind === 'supply' ? r.priceIdr : r.budgetIdr) },
                    { key: 'status', header: 'Status', cell: (r) => (r.kind === 'supply' ? <StatusBadge entity="supply" status={r.status} /> : <StatusBadge entity="demand" status={r.status} />) },
                    { key: 'updated', header: 'Diperbarui', cell: (r) => <span className="text-muted-foreground">{formatRelative(r.updatedAt)}</span>, sortValue: (r) => r.updatedAt },
                  ]}
                />
              )}
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

// ── Form ─────────────────────────────────────────────────────────

const toDate = (iso?: string) => (iso ? iso.slice(0, 10) : '')
const fromDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : '')
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString()

interface Draft {
  item: string
  categoryId: CategoryId
  qty: string
  unit: string
  spec: string
  location: string
  delivery: DeliveryMode
  price: string
  availableFrom: string
  expiresAt: string
  budget: string
  deadline: string
}

const emptyDraft = (): Draft => ({
  item: '', categoryId: 'agri', qty: '', unit: 'kg', spec: '', location: REGIONS[1], delivery: 'both', price: '',
  availableFrom: toDate(new Date().toISOString()), expiresAt: toDate(inDays(30)), budget: '', deadline: toDate(inDays(21)),
})

function fromListing(l: Listing): Draft {
  return {
    ...emptyDraft(), item: l.item, categoryId: l.categoryId, qty: String(l.quantity.value), unit: l.quantity.unit, spec: l.spec, location: l.location,
    delivery: l.delivery,
    ...(l.kind === 'supply'
      ? { price: String(l.priceIdr), availableFrom: toDate(l.availableFrom), expiresAt: toDate(l.expiresAt) }
      : { budget: String(l.budgetIdr), deadline: toDate(l.deadline) }),
  }
}

/** Market price band for the category and unit; `perUnit` is what the user typed, per unit. */
function PriceHint({ category, unit, item, perUnit, exclude, onUse }: { category: CategoryId; unit: string; item: string; perUnit: number; exclude?: string; onUse: (medianIdr: number) => void }) {
  const { data: s } = usePriceSuggestion(category, unit, item, exclude)
  if (!s) return null
  const verdict = perUnit > 0 ? priceVerdict(perUnit, s) : null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm sm:col-span-2" role="status">
      <span className="min-w-0 flex-1">
        Harga pasar {formatIdr(s.lowIdr)}–{formatIdr(s.highIdr)}/{unit}, median <b className="num">{formatIdr(s.medianIdr)}</b>
        <span className="text-muted-foreground"> · {s.sample} data</span>
      </span>
      {verdict && verdict !== 'fair' && <Tag tone={verdict === 'low' ? 'orange' : 'yellow'}>{verdict === 'low' ? 'Di bawah pasar' : 'Di atas pasar'}</Tag>}
      {verdict === 'fair' && <Tag tone="green">Wajar</Tag>}
      <Button type="button" size="xs" variant="outline" className="border-primary/25 bg-background text-primary hover:bg-primary/10" onClick={() => onUse(s.medianIdr)}>Pakai median</Button>
    </div>
  )
}

function ListingForm({ kind, existing }: { kind: Kind; existing?: Listing }) {
  const navigate = useNavigate()
  const save = useSaveListing(existing?.id)
  const [d, setD, clear] = useLocalDraft<Draft>(existing ? null : `ecp-draft-${kind}-new`, existing ? fromListing(existing) : emptyDraft())
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  // Not in the saved draft: previews and in-flight uploads don't survive a reload.
  const [atts, setAtts] = useState<AttachmentDraft[]>(() => (existing ? draftsOf(existing.attachments) : []))
  const qty = Number(d.qty)

  function submit() {
    const common = {
      item: d.item.trim(), categoryId: d.categoryId, quantity: { value: qty, unit: d.unit.trim() }, location: d.location, spec: d.spec.trim(),
      delivery: d.delivery, attachments: toRefs(atts),
    }
    const input: ListingInput =
      kind === 'supply'
        ? { ...common, kind, priceIdr: Number(d.price), availableFrom: fromDate(d.availableFrom), expiresAt: fromDate(d.expiresAt) || undefined }
        : { ...common, kind, budgetIdr: Number(d.budget), deadline: fromDate(d.deadline) }
    save.mutate(input, {
      onSuccess: (l) => {
        clear()
        navigate(`/app/${kind}/${l.id}`, { replace: true })
      },
    })
  }

  const step1 = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={kind === 'supply' ? 'Item' : 'Kebutuhan'} aside={<span className="text-destructive" aria-label="Wajib diisi">*</span>} placeholder={kind === 'supply' ? 'mis. Green bean arabika grade 1' : 'mis. Karung goni 60 kg'} value={d.item} onChange={(e) => set('item', e.target.value)} error={fieldError(save.error, 'item')} required />
      </div>
      <SelectField label="Kategori" value={d.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
        {Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
      </SelectField>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Kuantitas" aside={<span className="text-destructive" aria-label="Wajib diisi">*</span>} type="number" min={0} inputMode="decimal" value={d.qty} onChange={(e) => set('qty', e.target.value)} error={fieldError(save.error, 'quantity')} />
        <Field label="Satuan" value={d.unit} onChange={(e) => set('unit', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <TextareaField label={kind === 'supply' ? 'Kualitas / spesifikasi' : 'Spesifikasi'} placeholder="Grade, ukuran, standar, sertifikasi…" value={d.spec} onChange={(e) => set('spec', e.target.value)} />
      </div>
    </div>
  )

  const step2 =
    kind === 'supply' ? (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Harga ekspektasi per ${d.unit || 'unit'} (Rp)`} aside={<span className="text-destructive" aria-label="Wajib diisi">*</span>} type="number" min={0} inputMode="numeric" value={d.price} onChange={(e) => set('price', e.target.value)} />
        <PriceHint category={d.categoryId} unit={d.unit} item={d.item} perUnit={Number(d.price)} exclude={existing?.id} onUse={(m) => set('price', String(m))} />
        <SelectField label="Lokasi" value={d.location} onChange={(e) => set('location', e.target.value)}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </SelectField>
        <Field label="Tersedia mulai" type="date" value={d.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
        <Field label="Kedaluwarsa" type="date" hint="Opsional, untuk barang yang punya umur simpan" value={d.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3.5 sm:col-span-2">
          <span className="text-sm font-semibold">Pengiriman</span>
          <span className="text-xs text-muted-foreground">Pilih cara produk diterima oleh pembeli.</span>
          <Segmented label="Pengiriman" value={d.delivery} options={DELIVERY} onChange={(v) => set('delivery', v)} />
        </div>
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget total (Rp)" aside={<span className="text-destructive" aria-label="Wajib diisi">*</span>} type="number" min={0} inputMode="numeric" value={d.budget} onChange={(e) => set('budget', e.target.value)} hint={qty > 0 && Number(d.budget) > 0 ? `≈ ${formatIdr(Math.round(Number(d.budget) / qty))} per ${d.unit}` : undefined} />
        <Field label="Deadline" aside={<span className="text-destructive" aria-label="Wajib diisi">*</span>} type="date" value={d.deadline} onChange={(e) => set('deadline', e.target.value)} />
        {qty > 0 && <PriceHint category={d.categoryId} unit={d.unit} item={d.item} perUnit={Number(d.budget) / qty} exclude={existing?.id} onUse={(m) => set('budget', String(m * qty))} />}
        <SelectField label="Lokasi pengiriman" value={d.location} onChange={(e) => set('location', e.target.value)}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </SelectField>
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3.5">
          <span className="text-sm font-semibold">Pengiriman</span>
          <span className="text-xs text-muted-foreground">Pilih cara kebutuhanmu dikirim atau diambil.</span>
          <Segmented label="Pengiriman" value={d.delivery} options={DELIVERY} onChange={(v) => set('delivery', v)} />
        </div>
      </div>
    )

  const step3 = (
    <div className="flex flex-col gap-4">
      <AttachmentsField
        label={kind === 'supply' ? 'Tambah foto atau dokumen' : 'Tambah dokumen pendukung'}
        value={atts}
        onChange={setAtts}
        error={fieldError(save.error, 'attachments')}
      />
      <p className="text-sm text-muted-foreground">Cek ringkasan di samping. Setelah disimpan, engine langsung mencari opportunity dan market yang cocok.</p>
    </div>
  )

  return (
    <Wizard
      submitLabel={existing ? 'Simpan perubahan' : `Simpan ${kind}`}
      submitting={save.isPending}
      onSubmit={submit}
      error={<FormError error={save.error} />}
      steps={[
        { id: 'item', title: kind === 'supply' ? 'Item & kualitas' : 'Kebutuhan', description: `Isi informasi utama ${kind === 'supply' ? 'produk atau jasa' : 'yang kamu cari'}. Kolom bertanda * wajib diisi.`, content: step1, blocker: !d.item.trim() ? 'Isi nama item' : !(qty > 0) ? 'Isi kuantitas' : undefined },
        { id: 'terms', title: kind === 'supply' ? 'Harga & ketersediaan' : 'Budget & jadwal', description: 'Tentukan nilai dan informasi pengiriman agar calon mitra dapat menilai listing ini.', content: step2, blocker: kind === 'supply' ? (!(Number(d.price) > 0) ? 'Isi harga ekspektasi' : undefined) : !(Number(d.budget) > 0) ? 'Isi budget' : !d.deadline ? 'Isi deadline' : undefined },
        { id: 'review', title: 'Lampiran & review', description: 'Tambahkan foto atau dokumen pendukung, lalu periksa kembali ringkasan sebelum menyimpan.', content: step3, blocker: attachmentsBlocker(atts) },
      ]}
      summary={
        <>
          <div className="mb-3 rounded-xl border border-primary/15 bg-background/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{existing ? 'Mengedit listing' : `Listing baru · ${kind === 'supply' ? 'Supply' : 'Demand'}`}</p>
            <p className="mt-1.5 break-words font-semibold">{d.item || (kind === 'supply' ? 'Nama produk atau jasa' : 'Nama kebutuhan')}</p>
          </div>
          <SummaryRow label="Kategori" value={CATEGORIES[d.categoryId].label} />
          <SummaryRow label="Kuantitas" value={qty > 0 ? formatQty({ value: qty, unit: d.unit }) : ''} />
          {kind === 'supply' ? (
            <>
              <SummaryRow label="Harga/unit" value={Number(d.price) > 0 ? formatIdr(Number(d.price)) : ''} />
              <SummaryRow label="Nilai total" value={qty > 0 && Number(d.price) > 0 ? formatIdr(qty * Number(d.price), { compact: true }) : ''} />
            </>
          ) : (
            <>
              <SummaryRow label="Budget" value={Number(d.budget) > 0 ? formatIdr(Number(d.budget), { compact: true }) : ''} />
              <SummaryRow label="Deadline" value={d.deadline ? formatDate(fromDate(d.deadline)) : ''} />
            </>
          )}
          <SummaryRow label="Lokasi" value={d.location} />
          <SummaryRow label="Pengiriman" value={DELIVERY_LABEL[d.delivery]} />
          {!existing && <p className="mt-3 text-xs text-muted-foreground">Draft tersimpan otomatis.</p>}
        </>
      }
    />
  )
}

export function ListingFormPage({ kind }: { kind: Kind }) {
  const { id } = useParams()
  const query = useListing(id)
  const c = COPY[kind]
  return (
    <>
      <PageHeader title={id ? `Edit ${c.title.toLowerCase()}` : c.add} description={id ? 'Perbarui detail listing. Perubahan akan digunakan untuk pencocokan dan ditampilkan ke calon mitra.' : c.description} icon={c.icon} tone={c.tone} featured />
      {id ? (
        <AsyncView query={query} skeleton={<Skeleton className="h-80 rounded-xl" />}>
          {(l) => <ListingForm kind={kind} existing={l} />}
        </AsyncView>
      ) : (
        <ListingForm kind={kind} />
      )}
    </>
  )
}

// ── Detail ───────────────────────────────────────────────────────

function MarketPicker({ id, markets }: { id: string; markets: { id: string; name: string; region: string }[] }) {
  const action = useListingAction(id)
  const [open, setOpen] = useState(false)
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '')
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-9" disabled={!markets.length} />}>
        <Store /> Masukkan ke market
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Masukkan ke market</DialogTitle>
          <DialogDescription>Listing akan terlihat oleh peserta market dan ikut di round berikutnya.</DialogDescription>
        </DialogHeader>
        <SelectField label="Market" value={marketId} onChange={(e) => setMarketId(e.target.value)}>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.region}</option>)}
        </SelectField>
        <FormError error={action.error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button disabled={!marketId || action.isPending} onClick={() => action.mutate({ type: 'market', marketId }, { onSuccess: () => setOpen(false) })}>
            {action.isPending ? 'Menyimpan…' : 'Masukkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ListingDetailPage({ kind }: { kind: Kind }) {
  const { id = '' } = useParams()
  const query = useListing(id)
  const archive = useListingAction(id)
  const c = COPY[kind]

  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(l) => {
        const closed = ['sold', 'expired', 'fulfilled', 'cancelled'].includes(l.status)
        const demand = l.kind === 'demand' ? (l as DemandListing) : undefined
        const supply = l.kind === 'supply' ? (l as SupplyListing) : undefined
        return (
          <>
            <PageHeader
              title={l.item}
              description={<span className="flex flex-wrap items-center gap-1.5"><span>{l.code}</span>{supply ? <StatusBadge entity="supply" status={supply.status} /> : <StatusBadge entity="demand" status={demand!.status} />}<CategoryTag id={l.categoryId} /></span>}
              icon={c.icon}
              tone={c.tone}
              featured
              actions={
                !closed && (
                  <>
                    <Button variant="outline" className="h-9" render={<Link to={`/app/${kind}/${l.id}/edit`} />}><Pencil /> Edit</Button>
                    {l.status !== 'in_market' && <MarketPicker id={l.id} markets={l.markets} />}
                    {demand && !demand.auctionId && (
                      <Button className="h-9" render={<Link to={`/app/auctions/new?demand=${l.id}`} />}><Gavel /> Jadikan auction</Button>
                    )}
                    {demand?.auctionId && (
                      <Button className="h-9" render={<Link to={`/app/auctions/${demand.auctionId}/evaluate`} />}><Gavel /> Lihat auction</Button>
                    )}
                    <ConfirmDialog
                      trigger={<Button variant="ghost" className="h-9"><Archive /> Arsipkan</Button>}
                      title={`Arsipkan ${l.item}?`}
                      impact={`Listing berhenti ditawarkan ke market dan opportunity. Statusnya menjadi ${kind === 'supply' ? 'Expired' : 'Cancelled'}.`}
                      confirmLabel="Arsipkan"
                      destructive
                      onConfirm={() => archive.mutateAsync({ type: 'archive' })}
                    />
                  </>
                )
              }
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section className="rounded-2xl border bg-linear-to-br from-card via-card to-primary/[0.025] p-4 shadow-sm shadow-foreground/[0.025] md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-semibold tracking-tight">Detail listing</h2><p className="mt-1 text-sm text-muted-foreground">Informasi utama dan ketentuan listing ini.</p></div>
                    <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{kind === 'supply' ? 'Supply' : 'Demand'}</span>
                  </div>
                  <dl className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    {[
                      ['Kuantitas', formatQty(l.quantity)],
                      supply ? ['Harga ekspektasi', `${formatIdr(supply.priceIdr)}/${l.quantity.unit}`] : ['Budget', formatIdr(demand!.budgetIdr)],
                      supply ? ['Nilai total', formatIdr(supply.priceIdr * l.quantity.value)] : ['Deadline', formatDate(demand!.deadline)],
                      ['Lokasi', l.location],
                      ['Pengiriman', DELIVERY_LABEL[l.delivery]],
                      supply ? ['Tersedia', `${formatDate(supply.availableFrom)}${supply.expiresAt ? ` – ${formatDate(supply.expiresAt)}` : ''}`] : ['Dibuat', formatDate(l.createdAt)],
                    ].map(([k, v]) => (
                      <div key={k} className="min-w-0 rounded-xl border border-border/70 bg-background/75 px-3.5 py-3">
                        <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                        <dd className="num mt-1 break-words text-sm font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {l.spec && <p className="mt-4 rounded-xl border-l-2 border-primary/50 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">{l.spec}</p>}
                  {l.attachments.length > 0 && <div className="mt-5 border-t pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lampiran</p><AttachmentGallery attachments={l.attachments} /></div>}
                </section>

                <section>
                  <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="font-semibold tracking-tight">Opportunity yang cocok</h2><p className="mt-1 text-sm text-muted-foreground">Peluang yang terhubung dengan listing ini.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{formatNumber(l.matches.length)}</span></div>
                  {l.matches.length ? (
                    <div className="grid gap-3 md:grid-cols-2">{l.matches.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>
                  ) : (
                    <EmptyState title="Belum ada yang cocok" description="Engine akan memberi tahu saat ada opportunity baru di kategori ini." />
                  )}
                </section>
              </div>

              <aside className="flex flex-col gap-6">
                {l.marketId && (
                    <section className="rounded-2xl border border-primary/15 bg-linear-to-br from-card to-primary/5 p-4 shadow-sm shadow-foreground/[0.025]">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terdaftar di market</h2>
                    <Link to={`/markets/${l.marketId}`} className="mt-1 block font-medium text-primary hover:underline">
                      {l.markets.find((m) => m.id === l.marketId)?.name ?? 'Lihat market'}
                    </Link>
                  </section>
                )}
                <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <h2 className="font-semibold tracking-tight">Riwayat status</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Jejak perubahan listing.</p>
                  <ol className="mt-4 flex flex-col gap-4 border-l border-border pl-4">
                    {l.history.map((h, i) => (
                      <li key={i} className="relative text-sm">
                        <span className="absolute top-1.5 -left-[1.32rem] size-2 rounded-full bg-primary ring-4 ring-card" />
                        <p className="font-medium leading-snug">{h.note}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(h.at)}</p>
                      </li>
                    ))}
                  </ol>
                </section>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(l.matches.length)} opportunity dan {formatNumber(l.markets.length)} market terkait.
                </p>
              </aside>
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}
