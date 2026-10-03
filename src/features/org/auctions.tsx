import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, ExternalLink, FileText, Gavel, Plus, Scale, Trash2, Trophy } from 'lucide-react'
import type { AllocationLine, AuctionType, BidVisibility, CategoryId } from '@/domain/types'
import {
  AWARD_RULES, DEFAULT_WEIGHTS, ORG_AUCTION_STATUS, WITHDRAW_RULES, auctionValue, awardLines, awardSummary, canApprove, requiredApprovers,
  weightedScores, type AuctionObjective, type AwardRule, type OrgAuctionEvaluation, type OrgAuctionInput, type OrgAuctionStatus, type OrgAuctionView,
  type ProcurementRequest, type Weights, type WithdrawRule,
} from '@/domain/org'
import { suggestAllocation } from '@/domain/auction'
import { AUCTION_TYPES, CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatDate, formatDateTime, formatIdr, formatNumber, formatPercent, formatQty } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLocalDraft } from '@/lib/useLocalDraft'
import { toast } from '@/stores/toast'
import {
  useCreateOrgAuction, useIssuePo, useOrgAccess, useOrgAuctionDecision, useOrgAuctions, useOrgAward, useOrgEvaluation, useProcurements, useSuppliers,
} from './hooks'
import { ApprovalTrail, CheckChips, DecisionButtons, FilterPills, GuardedButton, GuardedLink, OrgAuctionBadge, Section } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { Countdown } from '@/components/Countdown'
import { Tag } from '@/components/Tag'
import { SummaryRow, Wizard } from '@/components/Wizard'
import { Field, FormError, Segmented, SelectField, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
type Filter = '' | OrgAuctionStatus
const higherWins = (t: AuctionType) => t === 'forward' || t === 'dutch'

// ── Review (approval) dialog, deep-linked as ?review=<id> ────────

function ReviewDialog({ a, onClose }: { a: OrgAuctionView; onClose: () => void }) {
  const access = useOrgAccess()
  const decide = useOrgAuctionDecision()
  const mine = canApprove(access.role, a.requiredApprovers, a.approvals)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{a.code}: {a.title}</DialogTitle>
          <DialogDescription>{AUCTION_TYPES[a.type].label} · {a.lots.length} lot · nilai acuan {formatIdr(a.valueIdr)}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border text-sm">
          {a.lots.map((l) => <li key={l.id} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{l.item}</span><span className="num shrink-0">{formatQty(l.quantity, { compact: true })} × {formatIdr(l.reservePriceIdr)}</span></li>)}
        </ul>
        <ApprovalTrail required={a.requiredApprovers} approvals={a.approvals} roles={access.settings?.roles ?? []} />
        {mine ? (
          <DecisionButtons
            subject={a.code}
            error={decide.error}
            impact={<>Auction senilai <b>{formatIdr(a.valueIdr)}</b> langsung live setelah semua approval terpenuhi; supplier yang lolos kualifikasi bisa menawar.</>}
            onDecide={(action, note) => decide.mutateAsync({ id: a.id, action, note }).then(() => { toast({ title: action === 'approve' ? 'Auction disetujui' : 'Auction ditolak', body: a.code, tone: 'green' }); onClose() })}
          />
        ) : <p className="text-sm text-muted-foreground">{a.status === 'pending_approval' ? `Tidak menunggu persetujuan ${access.roleLabel}.` : 'Approval selesai.'}</p>}
      </DialogContent>
    </Dialog>
  )
}

// ── List ─────────────────────────────────────────────────────────

export function OrgAuctionsPage() {
  const access = useOrgAccess()
  const query = useOrgAuctions()
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const filter = (params.get('status') ?? '') as Filter
  const add = <GuardedLink to={`${access.base}/auctions/new`} reason={access.deny('auctions', 'create')}><Plus /> Buat auction</GuardedLink>
  return (
    <>
      <PageHeader title="Auctions" description="Reverse, forward, sealed, dan Dutch auction bisnis, termasuk multi-lot dan award terbagi." icon={Gavel} tone="orange" actions={add} />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} empty={<EmptyState icon={Gavel} tone="orange" title="Belum ada auction" description="Ubah procurement yang sudah disetujui menjadi auction supaya supplier bersaing." action={add} />}>
        {(rows) => {
          const visible = filter ? rows.filter((a) => a.status === filter) : rows
          const review = rows.find((a) => a.id === params.get('review'))
          return (
            <>
              <FilterPills<Filter> label="Status" value={filter} onChange={(v) => set('status', v || null)}
                options={[['', 'Semua', rows.length], ...(Object.keys(ORG_AUCTION_STATUS) as OrgAuctionStatus[]).map((s) => [s, ORG_AUCTION_STATUS[s][0], rows.filter((a) => a.status === s).length] as [Filter, string, number])]} />
              {visible.length ? (
                <DataTable
                  caption="Auction bisnis"
                  rows={visible}
                  rowKey={(a) => a.id}
                  rowHref={(a) => (a.status === 'pending_approval' || a.status === 'rejected' ? `${access.base}/auctions?review=${a.id}` : `${access.base}/auctions/${a.id}/evaluate`)}
                  initialSort={{ key: 'created', dir: 'desc' }}
                  columns={[
                    { key: 'title', header: 'Auction', primary: true, cell: (a) => <span>{a.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{a.code}</span></span> },
                    { key: 'type', header: 'Tipe', cell: (a) => <Tag>{AUCTION_TYPES[a.type].label}{a.multiLot ? ` · ${a.lots.length} lot` : ''}</Tag> },
                    { key: 'value', header: 'Nilai acuan', align: 'right', cell: (a) => formatIdr(a.valueIdr, { compact: true }), sortValue: (a) => a.valueIdr },
                    { key: 'bids', header: 'Bid', align: 'right', cell: (a) => formatNumber(a.live.reduce((s, l) => s + l.bidCount, 0)) },
                    { key: 'status', header: 'Status', cell: (a) => <OrgAuctionBadge status={a.status} /> },
                    { key: 'time', header: 'Waktu', cell: (a) => (a.status === 'live' ? <Countdown to={a.live[0].endsAt} /> : <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>), sortValue: (a) => a.createdAt },
                    { key: 'created', header: 'Dibuat oleh', cell: (a) => <span className="text-muted-foreground">{a.createdBy}</span>, sortValue: (a) => a.createdAt },
                  ]}
                />
              ) : <EmptyState title="Tidak ada auction dengan status ini" />}
              {review && <ReviewDialog a={review} onClose={() => set('review', null)} />}
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

// ── Create wizard (6 steps) ──────────────────────────────────────

interface LotDraft { item: string; qty: string; unit: string; spec: string; price: string }
interface Draft {
  title: string
  categoryId: CategoryId
  objective: AuctionObjective
  type: AuctionType
  multiLot: boolean
  lots: LotDraft[]
  step: string
  visibility: BidVisibility
  autoExtension: boolean
  withdraw: WithdrawRule
  award: AwardRule
  weights: Weights
  documents: string[]
  minRating: string
  regions: string[]
  invited: string[]
  startMode: 'now' | 'later'
  startsAt: string
  duration: string
}

const DOCS = ['NIB', 'NPWP', 'Sertifikat mutu', 'SNI', 'Halal'].map((d) => [d, d] as [string, string])
const blankLot = (): LotDraft => ({ item: '', qty: '', unit: 'pcs', spec: '', price: '' })

function fromProcurement(p?: ProcurementRequest): Draft {
  return {
    title: p ? `${p.need} ${formatNumber(p.quantity.value)} ${p.quantity.unit}` : '', categoryId: p?.categoryId ?? 'packaging', objective: 'procurement', type: 'reverse', multiLot: false,
    lots: [p ? { item: p.need, qty: String(p.quantity.value), unit: p.quantity.unit, spec: p.spec, price: String(Math.round(p.budgetIdr / p.quantity.value)) } : blankLot()],
    step: '', visibility: 'full', autoExtension: true, withdraw: 'before_last_30', award: 'lowest', weights: DEFAULT_WEIGHTS,
    documents: ['NIB', 'NPWP'], minRating: '4', regions: [], invited: p?.invitedSupplierIds ?? [], startMode: 'now', startsAt: '', duration: '1440',
  }
}

function AuctionWizard({ source }: { source?: ProcurementRequest }) {
  const access = useOrgAccess()
  const navigate = useNavigate()
  const create = useCreateOrgAuction()
  const suppliers = useSuppliers('')
  const [d, setD, clear] = useLocalDraft<Draft>(`ecp-draft-${access.orgId}-auction-${source?.id ?? 'new'}`, fromProcurement(source))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const lot = (i: number, patch: Partial<LotDraft>) => setD((x) => ({ ...x, lots: x.lots.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const lots = (d.multiLot ? d.lots : d.lots.slice(0, 1)).map((l) => ({ item: l.item.trim(), quantity: { value: Number(l.qty), unit: l.unit.trim() }, spec: l.spec.trim(), reservePriceIdr: Number(l.price) }))
  const value = auctionValue(lots.filter((l) => l.quantity.value > 0 && l.reservePriceIdr > 0))
  const approvers = requiredApprovers(value, 'auction', access.settings?.approvalRules ?? [])
  const roleLabel = (r: string) => access.settings?.roles.find((x) => x.id === r)?.label ?? r
  const step = Number(d.step || Math.max(1, Math.round((lots[0]?.reservePriceIdr || 0) * 0.005)))
  const visibility: BidVisibility = d.type === 'sealed' ? 'sealed' : d.visibility
  const lotsOk = lots.every((l) => l.item && l.quantity.value > 0 && l.reservePriceIdr > 0)
  const weightSum = d.weights.price + d.weights.quality + d.weights.delivery + d.weights.reliability
  const invitable = (suppliers.data ?? []).filter((s) => s.relation !== 'blocked' && s.categories.includes(d.categoryId))
  const priceLabel = d.objective === 'selling' ? 'Reserve/unit (Rp)' : 'Target/unit (Rp)'

  function submit() {
    const input: OrgAuctionInput = {
      title: d.title.trim(), categoryId: d.categoryId, type: d.type, objective: d.objective, multiLot: d.multiLot, lots,
      rules: { minStepIdr: d.type === 'sealed' ? 0 : step, visibility, autoExtension: d.autoExtension, withdraw: d.withdraw, award: higherWins(d.type) ? 'lowest' : d.award, weights: d.weights },
      qualification: { documents: d.documents, minRating: Number(d.minRating), regions: d.regions }, invited: d.invited,
      schedule: { startsAt: d.startMode === 'later' && d.startsAt ? new Date(d.startsAt).toISOString() : undefined, durationMinutes: Number(d.duration) },
      procurementId: source?.id,
    }
    create.mutate(input, {
      onSuccess: (a) => {
        clear()
        toast({ title: a.status === 'pending_approval' ? 'Diajukan untuk approval' : 'Auction dibuka', body: a.code, tone: 'green' })
        navigate(a.status === 'pending_approval' ? `${access.base}/auctions?review=${a.id}` : `${access.base}/auctions/${a.id}/evaluate`)
      },
    })
  }

  return (
    <Wizard
      submitLabel={approvers.length ? 'Ajukan untuk approval' : 'Buka auction'}
      submitting={create.isPending}
      onSubmit={submit}
      error={<FormError error={create.error} />}
      steps={[
        {
          id: 'type', title: 'Tipe & tujuan', blocker: d.title.trim() ? undefined : 'Isi judul',
          content: (
            <div className="flex flex-col gap-5">
              <Field label="Judul auction" value={d.title} onChange={(e) => set('title', e.target.value)} error={fieldError(create.error, 'title')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Kategori" value={d.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
                  {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </SelectField>
                <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Tujuan</span>
                  <Segmented label="Tujuan" value={d.objective} options={[['procurement', 'Procurement (beli)'], ['selling', 'Selling (jual)']]} onChange={(v) => setD((x) => ({ ...x, objective: v, type: v === 'selling' ? 'forward' : 'reverse' }))} />
                </div>
              </div>
              <div role="radiogroup" aria-label="Tipe auction" className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(AUCTION_TYPES) as AuctionType[]).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={d.type === t} onClick={() => set('type', t)} className={cn('rounded-lg border p-3 text-left text-sm', d.type === t ? 'border-primary ring-3 ring-primary/20' : 'hover:bg-hover')}>
                    <span className="font-medium">{AUCTION_TYPES[t].label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{{ reverse: 'Supplier menurunkan harga; cocok untuk procurement.', forward: 'Pembeli menaikkan harga; cocok untuk menjual stok.', sealed: 'Penawaran tertutup sampai penutupan.', dutch: 'Harga turun bertahap; yang pertama menerima menang.' }[t]}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Struktur lot</span>
                <Segmented label="Struktur lot" value={d.multiLot ? 'multi' : 'single'} options={[['single', 'Single lot'], ['multi', 'Multi-lot']]} onChange={(v) => set('multiLot', v === 'multi')} />
              </div>
            </div>
          ),
        },
        {
          id: 'lots', title: 'Lot', blocker: lotsOk ? undefined : 'Lengkapi item, kuantitas, dan harga tiap lot',
          content: (
            <div className="flex flex-col gap-4">
              {(d.multiLot ? d.lots : d.lots.slice(0, 1)).map((l, i) => (
                <fieldset key={i} className="rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">Lot {i + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Item" value={l.item} onChange={(e) => lot(i, { item: e.target.value })} error={fieldError(create.error, `lot-${i}`)} />
                    <div className="grid grid-cols-[1fr_5rem] gap-2">
                      <Field label="Kuantitas" type="number" min={0} value={l.qty} onChange={(e) => lot(i, { qty: e.target.value })} />
                      <Field label="Satuan" value={l.unit} onChange={(e) => lot(i, { unit: e.target.value })} />
                    </div>
                    <Field label="Spesifikasi" value={l.spec} onChange={(e) => lot(i, { spec: e.target.value })} />
                    <Field label={priceLabel} type="number" min={0} value={l.price} onChange={(e) => lot(i, { price: e.target.value })} hint={Number(l.qty) > 0 && Number(l.price) > 0 ? `Nilai lot ${formatIdr(Number(l.qty) * Number(l.price), { compact: true })}` : 'Juga harga pembuka'} />
                  </div>
                  {d.multiLot && d.lots.length > 1 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => set('lots', d.lots.filter((_, j) => j !== i))}><Trash2 /> Hapus lot</Button>}
                </fieldset>
              ))}
              {d.multiLot && <Button variant="outline" className="h-9 self-start" onClick={() => set('lots', [...d.lots, blankLot()])}><Plus /> Tambah lot</Button>}
            </div>
          ),
        },
        {
          id: 'rules', title: 'Aturan', blocker: d.award === 'weighted' && !higherWins(d.type) && weightSum !== 100 ? `Total bobot harus 100 (sekarang ${weightSum})` : undefined,
          content: (
            <div className="grid gap-4 sm:grid-cols-2">
              {d.type !== 'sealed' && <Field label={d.type === 'dutch' ? 'Penurunan harga per langkah (Rp)' : d.type === 'forward' ? 'Kenaikan minimum (Rp)' : 'Penurunan minimum (Rp)'} type="number" min={0} placeholder={String(step)} value={d.step} onChange={(e) => set('step', e.target.value)} hint="Default 0,5% dari harga lot pertama" />}
              <SelectField label="Visibilitas bid" value={visibility} disabled={d.type === 'sealed'} onChange={(e) => set('visibility', e.target.value as BidVisibility)} hint={d.type === 'sealed' ? 'Sealed bid selalu tertutup' : undefined}>
                <option value="full">Harga terlihat, identitas disamarkan</option>
                <option value="rank_only">Peserta hanya melihat peringkat</option>
                <option value="sealed">Tertutup sampai penutupan</option>
              </SelectField>
              <SelectField label="Penarikan bid" value={d.withdraw} onChange={(e) => set('withdraw', e.target.value as WithdrawRule)}>
                {(Object.keys(WITHDRAW_RULES) as WithdrawRule[]).map((w) => <option key={w} value={w}>{WITHDRAW_RULES[w]}</option>)}
              </SelectField>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="accent-primary" checked={d.autoExtension} onChange={(e) => set('autoExtension', e.target.checked)} /> Perpanjangan otomatis (+5 menit jika ada bid di 2 menit terakhir)</label>
              {higherWins(d.type) ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground sm:col-span-2">Auction penjualan: penawar tertinggi memenangkan tiap lot.</p>
              ) : (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <span className="text-sm font-medium">Penetapan pemenang</span>
                  <div role="radiogroup" aria-label="Penetapan pemenang" className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(AWARD_RULES) as AwardRule[]).filter((r) => r !== 'bundled' || d.multiLot).map((r) => (
                      <button key={r} type="button" role="radio" aria-checked={d.award === r} onClick={() => set('award', r)} className={cn('rounded-lg border p-3 text-left text-sm', d.award === r ? 'border-primary ring-3 ring-primary/20' : 'hover:bg-hover')}>
                        <span className="font-medium">{AWARD_RULES[r].label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{AWARD_RULES[r].hint}</span>
                      </button>
                    ))}
                  </div>
                  {d.award === 'weighted' && <WeightFields weights={d.weights} onChange={(w) => set('weights', w)} />}
                </div>
              )}
            </div>
          ),
        },
        {
          id: 'qualification', title: 'Kualifikasi supplier',
          content: (
            <div className="flex flex-col gap-5">
              <CheckChips label="Dokumen wajib" options={DOCS} value={d.documents} onChange={(v) => set('documents', v)} />
              <SelectField label="Rating minimum" value={d.minRating} onChange={(e) => set('minRating', e.target.value)}>
                {['0', '3', '3.5', '4', '4.5'].map((r) => <option key={r} value={r}>{r === '0' ? 'Tanpa minimum' : `★ ${r.replace('.', ',')}+`}</option>)}
              </SelectField>
              <CheckChips label="Wilayah supplier (kosong = semua)" options={REGIONS.map((r) => [r, r] as [string, string])} value={d.regions} onChange={(v) => set('regions', v)} />
            </div>
          ),
        },
        {
          id: 'invite', title: 'Undang & jadwal', blocker: d.startMode === 'later' && !d.startsAt ? 'Pilih waktu mulai' : undefined,
          content: (
            <div className="flex flex-col gap-5">
              {invitable.length ? <CheckChips label="Undang supplier (opsional)" options={invitable.map((s) => [s.id, `${s.name}${s.verified ? ' ✓' : ''}`] as [string, string])} value={d.invited} onChange={(v) => set('invited', v)} /> : <p className="text-sm text-muted-foreground">Belum ada supplier di kategori ini; auction terbuka untuk supplier terkualifikasi.</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Mulai</span>
                  <Segmented label="Mulai" value={d.startMode} options={[['now', 'Segera setelah approval'], ['later', 'Terjadwal']]} onChange={(v) => set('startMode', v)} />
                </div>
                {d.startMode === 'later' && <Field label="Waktu mulai" type="datetime-local" value={d.startsAt} onChange={(e) => set('startsAt', e.target.value)} error={fieldError(create.error, 'startsAt')} />}
                <SelectField label="Durasi" value={d.duration} onChange={(e) => set('duration', e.target.value)}>
                  {MOCKS && <option value="5">5 menit (demo)</option>}
                  <option value="60">1 jam</option>
                  <option value="1440">24 jam</option>
                  <option value="4320">3 hari</option>
                </SelectField>
              </div>
            </div>
          ),
        },
        {
          id: 'review', title: 'Review & ajukan',
          content: (
            <div className="flex flex-col gap-4 text-sm">
              <ul className="divide-y rounded-lg border">
                {lots.map((l, i) => <li key={i} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{l.item || `Lot ${i + 1}`}</span><span className="num shrink-0">{formatQty(l.quantity, { compact: true })} × {formatIdr(l.reservePriceIdr)}</span></li>)}
              </ul>
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">Approval</p>
                <p className="mt-1 text-muted-foreground">{approvers.length ? <>Nilai {formatIdr(value, { compact: true })} butuh persetujuan <b>{approvers.map(roleLabel).join(' + ')}</b> sebelum live.</> : 'Tidak perlu approval: auction langsung dibuka.'}</p>
              </div>
              <p className="text-muted-foreground">Setelah live, auction tampil di ruang auction publik dan supplier yang lolos kualifikasi bisa menawar. Evaluasi dan award dibuka setelah semua lot ditutup.</p>
            </div>
          ),
        },
      ]}
      summary={
        <>
          <SummaryRow label="Judul" value={d.title} />
          <SummaryRow label="Tipe" value={`${AUCTION_TYPES[d.type].label}${d.multiLot ? ` · ${lots.length} lot` : ''}`} />
          <SummaryRow label="Nilai acuan" value={value ? formatIdr(value, { compact: true }) : ''} />
          <SummaryRow label="Pemenang" value={higherWins(d.type) ? 'Harga tertinggi' : AWARD_RULES[d.award].label} />
          <SummaryRow label="Rating min." value={d.minRating === '0' ? 'Tanpa' : `★ ${d.minRating}`} />
          <SummaryRow label="Diundang" value={d.invited.length ? `${d.invited.length} supplier` : 'Terbuka'} />
          <SummaryRow label="Approval" value={approvers.length ? approvers.map(roleLabel).join(' + ') : 'Tidak perlu'} />
          <p className="mt-3 text-xs text-muted-foreground">Draft tersimpan otomatis.</p>
        </>
      }
    />
  )
}

function WeightFields({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(['price', 'quality', 'delivery', 'reliability'] as const).map((k) => (
        <Field key={k} label={`${{ price: 'Harga', quality: 'Kualitas', delivery: 'Pengiriman', reliability: 'Reliabilitas' }[k]} (%)`} type="number" min={0} max={100} value={String(weights[k])} onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) || 0 })} />
      ))}
    </div>
  )
}

export function CreateOrgAuctionPage() {
  const access = useOrgAccess()
  const [params] = useSearchParams()
  const procurements = useProcurements()
  const deny = access.deny('auctions', 'create')
  const pid = params.get('procurement')
  return (
    <>
      <PageHeader title="Buat auction" description="Enam langkah: tipe, lot, aturan, kualifikasi, undangan & jadwal, lalu ajukan untuk approval." icon={Gavel} tone="orange" />
      {deny ? <EmptyState icon={Ban} title="Tidak bisa membuat auction" description={deny} /> : pid ? (
        <AsyncView query={procurements} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(rows) => <AuctionWizard source={rows.find((r) => r.id === pid)} />}
        </AsyncView>
      ) : <AuctionWizard />}
    </>
  )
}

// ── Evaluate, simulate, award, PO ────────────────────────────────

function PoPreview({ evaluation, onClose }: { evaluation: OrgAuctionEvaluation; onClose: () => void }) {
  const access = useOrgAccess()
  const navigate = useNavigate()
  const po = useIssuePo(evaluation.auction.id)
  const a = evaluation.auction
  const lines = a.award!.lines.flatMap((l, i) => l.map((x) => ({ ...x, lot: a.lots[i] })))
  const total = lines.reduce((s, l) => s + l.quantity * l.priceIdr, 0)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pratinjau Purchase Order</DialogTitle>
          <DialogDescription>Satu transaksi dibuat per supplier pemenang dengan nomor PO yang sama.</DialogDescription>
        </DialogHeader>
        <article className="rounded-lg border bg-background p-4 text-sm" aria-label="Dokumen PO">
          <header className="flex flex-wrap justify-between gap-2 border-b pb-3">
            <div><p className="text-base font-semibold">{evaluation.org.name}</p><p className="text-xs text-muted-foreground">{evaluation.org.location} · NPWP {evaluation.org.npwp || '—'}</p></div>
            <div className="text-right"><p className="font-semibold">PURCHASE ORDER</p><p className="text-xs text-muted-foreground">Draft · {formatDate(new Date().toISOString())}</p><p className="text-xs text-muted-foreground">Ref. {a.code}</p></div>
          </header>
          <table className="mt-3 block w-full overflow-x-auto sm:table">
            <caption className="sr-only">Baris PO</caption>
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5 font-medium">Supplier / item</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Harga</th><th className="py-1.5 text-right font-medium">Subtotal</th></tr></thead>
            <tbody className="num divide-y">
              {lines.map((l) => (
                <tr key={l.offerId + l.lot.id}><td className="py-1.5"><span className="font-medium">{l.supplier}</span><span className="block text-xs text-muted-foreground">{l.lot.item}</span></td><td className="py-1.5 text-right">{formatNumber(l.quantity)} {l.lot.quantity.unit}</td><td className="py-1.5 text-right">{formatIdr(l.priceIdr)}</td><td className="py-1.5 text-right">{formatIdr(l.quantity * l.priceIdr)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t font-semibold"><td colSpan={3} className="py-2">Total</td><td className="num py-2 text-right">{formatIdr(total)}</td></tr></tfoot>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">Pembayaran melalui escrow Ecopurnity; dana dilepas setelah barang diterima. Dasar award: {a.award!.reason}</p>
        </article>
        <FormError error={po.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button disabled={po.isPending} onClick={() => po.mutate(undefined, { onSuccess: (r) => { toast({ title: `${r.poNumber} diterbitkan`, body: `${r.transactionIds.length} transaksi dibuat`, tone: 'green' }); navigate(`${access.base}/transactions`) } })}>
            <FileText /> {po.isPending ? 'Menerbitkan…' : 'Terbitkan PO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AwardDialog({ id, lines, total, rule, onClose }: { id: string; lines: AllocationLine[][]; total: number; rule: string; onClose: () => void }) {
  const award = useOrgAward(id)
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tetapkan pemenang ({rule})</DialogTitle>
          <DialogDescription>Keputusan tercatat di audit trail beserta alasannya dan tidak bisa diubah.</DialogDescription>
        </DialogHeader>
        <ul className="rounded-lg bg-muted p-3 text-sm">
          {lines.flat().map((l) => <li key={l.offerId} className="flex justify-between gap-2"><span className="truncate">{l.supplier}</span><span className="num shrink-0">{formatNumber(l.quantity)} × {formatIdr(l.priceIdr)}</span></li>)}
          <li className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="num">{formatIdr(total)}</span></li>
        </ul>
        <TextareaField label="Alasan award" rows={3} placeholder="mis. Harga terendah dengan skor kualitas di atas 85" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(award.error, 'reason')} />
        <FormError error={award.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!reason.trim() || award.isPending} onClick={() => award.mutate({ lines, reason }, { onSuccess: () => { toast({ title: 'Pemenang ditetapkan', tone: 'green' }); onClose() } })}><Trophy /> Tetapkan pemenang</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OrgEvaluatePage() {
  const { id = '' } = useParams()
  const access = useOrgAccess()
  const query = useOrgEvaluation(id)
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const [weights, setWeights] = useState<Weights | null>(null)

  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(ev) => {
        const a = ev.auction
        const w = weights ?? a.rules.weights
        const lotInputs = ev.lots.map((l) => ({ quantity: l.lot.quantity.value, offers: l.offers }))
        const hw = higherWins(a.type)
        const rule = (params.get('rule') as AwardRule) || a.rules.award
        const rules = (Object.keys(AWARD_RULES) as AwardRule[]).filter((r) => r !== 'bundled' || a.multiLot)
        const sim = rules.map((r) => ({ r, lines: awardLines(lotInputs, r, w, hw) })).map((s) => ({ ...s, ...awardSummary(lotInputs, s.lines) }))
        const chosen = sim.find((s) => s.r === rule) ?? sim[0]
        const reserve = auctionValue(a.lots)
        const allClosed = ev.lots.every((l) => l.status === 'closed')
        const manageDeny = access.deny('auctions', 'manage')
        const room = a.live[0]?.auctionId
        return (
          <>
            <PageHeader
              title={a.title}
              description={<span className="flex flex-wrap items-center gap-1.5">{a.code} <OrgAuctionBadge status={a.status} /> <Tag>{AUCTION_TYPES[a.type].label}{a.multiLot ? ` · ${a.lots.length} lot` : ''}</Tag> {a.status === 'live' && <>sisa <Countdown to={a.live[0].endsAt} /></>}</span>}
              icon={Scale}
              tone="orange"
              actions={room && <Button variant="outline" className="h-9" render={<Link to={`/auctions/${room}`} />}><ExternalLink /> Ruang auction publik</Button>}
            />
            {a.status === 'pending_approval' || a.status === 'rejected' ? (
              <Section title="Approval">
                <ApprovalTrail required={a.requiredApprovers} approvals={a.approvals} roles={access.settings?.roles ?? []} />
                {a.status === 'pending_approval' && <Button variant="outline" className="mt-4 h-9" render={<Link to={`${access.base}/auctions?review=${a.id}`} />}>Buka review</Button>}
              </Section>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                <div className="flex min-w-0 flex-col gap-6">
                  {ev.lots.map((l, i) => {
                    const scores = weightedScores(l.offers, w)
                    const smart = hw ? [] : suggestAllocation(l.offers, l.lot.quantity.value)
                    const smartTotal = smart.reduce((s, x) => s + x.quantity * x.priceIdr, 0)
                    return (
                      <Section key={l.lot.id} title={`${a.multiLot ? `Lot ${i + 1}: ` : ''}${l.lot.item}`} actions={<span className="text-sm text-muted-foreground">{formatQty(l.lot.quantity)} · {hw ? 'reserve' : 'target'} {formatIdr(l.lot.reservePriceIdr)}</span>}>
                        {l.offers.length ? (
                          <DataTable
                            caption={`Penawaran ${l.lot.item}`}
                            rows={l.offers.map((o, k) => ({ ...o, score: scores[k] }))}
                            rowKey={(o) => o.id}
                            initialSort={{ key: hw ? 'price' : 'score', dir: 'desc' }}
                            columns={[
                              { key: 'supplier', header: 'Supplier', primary: true, cell: (o) => <span className="inline-flex items-center gap-1.5">{o.supplier.name}{o.supplier.verified && <Tag tone="teal">Verified</Tag>}</span> },
                              { key: 'price', header: `Harga/${l.lot.quantity.unit}`, align: 'right', cell: (o) => formatIdr(o.priceIdr), sortValue: (o) => o.priceIdr },
                              { key: 'cap', header: 'Kapasitas', align: 'right', cell: (o) => formatQty(o.capacity, { compact: true }), sortValue: (o) => o.capacity.value },
                              { key: 'q', header: 'Kualitas', align: 'right', cell: (o) => o.quality, sortValue: (o) => o.quality },
                              { key: 'd', header: 'Kirim', align: 'right', cell: (o) => o.delivery, sortValue: (o) => o.delivery },
                              { key: 'score', header: 'Skor', align: 'right', cell: (o) => <b>{o.score}</b>, sortValue: (o) => o.score },
                            ]}
                          />
                        ) : <EmptyState icon={Gavel} title={l.status === 'scheduled' ? 'Lot belum dimulai' : 'Belum ada penawaran'} description="Halaman ini memperbarui sendiri." />}
                        {smart.length > 0 && (
                          <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'var(--tag-teal-bg)', color: 'var(--tag-teal-fg)' }}>
                            <p className="font-medium">Smart Allocation</p>
                            <p className="mt-0.5">{smart.map((x) => `${x.supplier} ${formatNumber(x.quantity, { compact: true })}`).join(' + ')} = <b className="num">{formatIdr(smartTotal, { compact: true })}</b>{smartTotal > 0 && <> · hemat {formatPercent(1 - smartTotal / (l.lot.reservePriceIdr * smart.reduce((s, x) => s + x.quantity, 0)), 1)} dari target</>}</p>
                          </div>
                        )}
                      </Section>
                    )
                  })}
                </div>

                <aside className="flex flex-col gap-6">
                  {!hw && (
                    <Section title="Bobot skor">
                      <WeightFields weights={w} onChange={setWeights} />
                      <p className="mt-2 text-xs text-muted-foreground">Harga dinilai relatif ke penawaran termurah. Mengubah bobot hanya memengaruhi simulasi.</p>
                    </Section>
                  )}
                  <Section title="Simulasi award">
                    {hw ? <p className="text-sm text-muted-foreground">Auction penjualan: penawar tertinggi menang per lot.</p> : (
                      <div role="radiogroup" aria-label="Aturan award" className="flex flex-col gap-2">
                        {sim.map((s) => (
                          <button key={s.r} type="button" role="radio" aria-checked={chosen.r === s.r} disabled={!!a.award} onClick={() => set('rule', s.r)}
                            className={cn('rounded-lg border p-2.5 text-left text-sm', chosen.r === s.r ? 'border-primary ring-3 ring-primary/20' : 'hover:bg-hover')}>
                            <span className="flex justify-between gap-2"><span className="font-medium">{AWARD_RULES[s.r].label}{s.r === a.rules.award && <span className="ml-1 text-xs font-normal text-muted-foreground">(aturan)</span>}</span><span className="num">{formatIdr(s.totalIdr, { compact: true })}</span></span>
                            <span className="text-xs text-muted-foreground">{s.suppliers} supplier · tertutup {formatPercent(s.coverage)}{reserve > 0 && s.totalIdr > 0 && <> · hemat {formatIdr(Math.max(0, reserve * s.coverage - s.totalIdr), { compact: true })}</>}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {a.award ? (
                      <div className="mt-4 border-t pt-4 text-sm">
                        <p className="font-medium">Pemenang ditetapkan</p>
                        <ul className="mt-2">{a.award.lines.flat().map((l) => <li key={l.offerId + l.supplier} className="flex justify-between gap-2"><span className="truncate">{l.supplier}</span><span className="num shrink-0">{formatNumber(l.quantity, { compact: true })} × {formatIdr(l.priceIdr)}</span></li>)}</ul>
                        <p className="mt-2 text-xs text-muted-foreground">{a.award.by} · {formatDateTime(a.award.at)} · {a.award.reason}</p>
                        {a.award.poNumber ? (
                          <p className="mt-3"><Tag tone="green">{a.award.poNumber}</Tag> <Link className="text-primary hover:underline" to={`${access.base}/transactions`}>Lihat transaksi</Link></p>
                        ) : (
                          <GuardedButton className="mt-3 h-10 w-full" reason={manageDeny} onClick={() => set('po', '1')}><FileText /> Generate PO</GuardedButton>
                        )}
                      </div>
                    ) : allClosed ? (
                      <GuardedButton className="mt-4 h-10 w-full" reason={manageDeny} disabled={!chosen.lines.every((l) => l.length)} onClick={() => set('award', '1')}><Trophy /> Award ({hw ? 'harga tertinggi' : AWARD_RULES[chosen.r].label})</GuardedButton>
                    ) : (
                      <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Award dibuka setelah semua lot ditutup{a.live[0] ? ` (${formatDateTime(a.live[0].endsAt)})` : ''}.</p>
                    )}
                  </Section>
                </aside>
              </div>
            )}
            {params.get('award') && !a.award && allClosed && !manageDeny && (
              <AwardDialog id={a.id} lines={chosen.lines} total={chosen.totalIdr} rule={hw ? 'harga tertinggi' : AWARD_RULES[chosen.r].label} onClose={() => set('award', null)} />
            )}
            {params.get('po') && a.award && !a.award.poNumber && !manageDeny && <PoPreview evaluation={ev} onClose={() => set('po', null)} />}
          </>
        )
      }}
    </AsyncView>
  )
}
