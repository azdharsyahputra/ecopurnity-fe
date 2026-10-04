import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Check, Clock3, FileText, Scale } from 'lucide-react'
import { DISPUTE_STEPS, disputeActions, resolveOutcome, validateResolution, type Resolution } from '@/domain/dispute'
import { statusMeta } from '@/domain/status'
import { formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useAdminAction, useDispute, useDisputes } from './hooks'
import type { DisputeCase, Evidence } from './types'
import { BackLink, Facts, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { Field, Segmented, SelectField } from '@/components/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Attachment } from '@/features/trade/components'

const PAYMENT_LABEL = { unpaid: 'Belum dibayar', escrow: 'Di escrow', released: 'Dilepas ke supplier', refunded: 'Dikembalikan ke pembeli' }
const SIDE_LABEL: Record<Evidence['side'], string> = { buyer: 'Pembeli', supplier: 'Supplier', admin: 'Admin' }

export function DisputesPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'open'
  const market = params.get('market')
  const query = useDisputes()
  return (
    <>
      <PageHeader
        title="Disputes"
        description="Kasus dengan para pihak, transaksi, dan bukti dari kedua sisi. Putusan mengubah status transaksi dan escrow, dan kedua pihak diberi tahu."
        icon={Scale}
        tone="orange"
        actions={<Segmented label="Status" value={status} options={[['open', 'Belum selesai'], ['resolved', 'Selesai'], ['all', 'Semua']]} onChange={(v) => setParams((p) => (p.set('status', v), p), { replace: true })} />}
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-72 rounded-xl" />} emptyFallback={false}>
        {(all) => {
          const rows = all.filter((c) => (status === 'all' || (status === 'resolved') === (c.status === 'resolved')) && (!market || c.marketId === market))
          const unresolved = all.filter((c) => c.status !== 'resolved').length
          const resolved = all.filter((c) => c.status === 'resolved').length
          const exposure = rows.filter((c) => c.status !== 'resolved').reduce((sum, c) => sum + c.totalIdr, 0)
          return (
            <div className="grid gap-5">
              <section aria-label="Ringkasan dispute" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Total kasus', value: all.length, note: 'Seluruh dispute tercatat', icon: Scale, color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
                  { label: 'Belum selesai', value: unresolved, note: 'Menunggu bukti, review, atau putusan', icon: Clock3, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
                  { label: 'Selesai', value: resolved, note: 'Sudah diputuskan', icon: BadgeCheck, color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
                ].map(({ label, value, note, icon: Icon, color }) => <article key={label} className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className={`grid size-10 place-items-center rounded-xl ${color}`}><Icon className="size-5" aria-hidden="true" /></span></div></article>)}
              </section>
              {market && <p className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2 text-sm"><Tag tone="blue">Market {market}</Tag><span className="text-muted-foreground">Filter aktif · eksposur kasus aktif {formatIdr(exposure, { compact: true })}</span><button type="button" className="ml-auto rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-primary/10" onClick={() => setParams((p) => (p.delete('market'), p), { replace: true })}>Hapus filter</button></p>}
              <section className="grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3"><div><h2 className="text-lg font-semibold tracking-tight">Daftar dispute</h2><p className="mt-1 text-sm text-muted-foreground">Periksa nilai transaksi dan bukti sebelum meminta tambahan atau memberi putusan.</p></div><span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} kasus</span></div>
              {rows.length ? (
            <DataTable
              caption="Dispute"
              rows={rows}
              rowKey={(c) => c.id}
              rowHref={(c) => `/admin/disputes/${c.id}`}
              initialSort={{ key: 'opened', dir: 'asc' }}
              columns={[
                { key: 'title', header: 'Kasus', primary: true, cell: (c) => <span>{c.title} <span className="text-xs font-normal text-muted-foreground">{c.code}</span></span> },
                { key: 'parties', header: 'Para pihak', cell: (c) => c.parties.map((p) => p.name).join(' vs ') },
                { key: 'total', header: 'Nilai', align: 'right', cell: (c) => formatIdr(c.totalIdr, { compact: true }), sortValue: (c) => c.totalIdr },
                { key: 'opened', header: 'Dibuka', cell: (c) => formatRelative(c.openedAt), sortValue: (c) => c.openedAt },
                { key: 'status', header: 'Status', cell: (c) => <StatusBadge entity="dispute" status={c.status} /> },
              ]}
            />
          ) : <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7"><EmptyState icon={Scale} tone="orange" title="Tidak ada dispute di filter ini" description="Coba ubah status atau hapus filter market. Dispute dari halaman transaksi akan muncul di sini." /></div>}
              </section>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}

function Stepper({ status }: { status: DisputeCase['status'] }) {
  const at = DISPUTE_STEPS.indexOf(status)
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Tahap kasus">
      {DISPUTE_STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className="flex flex-col gap-1.5">
          <span className={cn('h-1.5 rounded-full', i <= at ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('flex items-center gap-1 text-xs', i === at ? 'font-medium' : 'text-muted-foreground')}>
            {i < at && <Check className="size-3" />} {statusMeta('dispute', s).label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function EvidenceColumn({ title, items }: { title: string; items: Evidence[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <li key={e.id} className="rounded-lg border p-3 text-sm">
              <p>{e.text}</p>
              {e.file && <Attachment name={e.file} url={e.url} preview className="mt-1.5 text-xs" />}
              <p className="mt-1 text-xs text-muted-foreground">{e.by} · {formatRelative(e.at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Belum ada bukti.</p>
      )}
    </div>
  )
}

function CaseActions({ c }: { c: DisputeCase }) {
  const act = useAdminAction(`disputes/${c.id}`)
  const [from, setFrom] = useState<'buyer' | 'supplier' | 'both'>('both')
  const [kind, setKind] = useState<Resolution['kind']>('partial')
  const [amount, setAmount] = useState('')
  const total = c.transaction.totalIdr
  const resolution: Resolution = kind === 'partial' ? { kind, refundIdr: Number(amount) } : { kind }
  const preview = validateResolution(total, resolution) ? null : resolveOutcome(total, resolution)
  const actions = disputeActions(c.status)
  if (!actions.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes('request_evidence') && (
        <ReasonDialog action={act} name="evidence" label="Minta bukti" title="Minta bukti tambahan" confirmLabel="Kirim permintaan" reasonLabel="Pesan ke para pihak"
          reasonHint="Dikirim sebagai notifikasi dan tercatat di audit trail."
          extra={
            <SelectField label="Diminta dari" value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
              <option value="both">Kedua pihak</option><option value="buyer">Pembeli</option><option value="supplier">Supplier</option>
            </SelectField>
          }
          body={(reason) => ({ action: 'request_evidence', from, reason })} onDone={() => toast({ title: 'Permintaan bukti dikirim', tone: 'blue' })} />
      )}
      {actions.includes('start_review') && (
        <ReasonDialog action={act} name="review" label="Mulai review" variant="default" reasonOptional reasonLabel="Catatan" title="Mulai review kasus?" confirmLabel="Mulai review"
          impact="Pengumpulan bukti ditutup. Setelah review, kamu bisa memutuskan kasus."
          body={(reason) => ({ action: 'start_review', reason })} onDone={() => toast({ title: 'Review dimulai', tone: 'blue' })} />
      )}
      {actions.includes('resolve') && (
        <ReasonDialog action={act} name="resolve" label="Putuskan & tutup kasus" variant="default" title={`Putuskan ${c.code}`} confirmLabel="Putuskan" reasonLabel="Dasar putusan"
          description={`Dana di escrow: ${formatIdr(total)}. Putusan bersifat final dan langsung mengubah transaksi.`}
          extra={
            <div className="flex flex-col gap-3">
              <Segmented label="Jenis putusan" value={kind} options={[['refund', 'Refund penuh'], ['release', 'Lepas ke supplier'], ['partial', 'Sebagian']]} onChange={setKind} />
              {kind === 'partial' && (
                <Field label="Nominal refund ke pembeli (Rp)" type="number" inputMode="numeric" min={1} max={total - 1} value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldError(act.error, 'refundIdr')} />
              )}
              <div className="rounded-lg bg-muted p-3 text-sm">
                {preview ? (
                  <ul className="list-disc pl-4">
                    <li>{preview.note}</li>
                    <li>Transaksi menjadi <strong>{statusMeta('transaction', preview.status).label}</strong>, pembayaran <strong>{PAYMENT_LABEL[preview.payment].toLowerCase()}</strong></li>
                    <li>Kedua pihak diberi tahu</li>
                  </ul>
                ) : (
                  'Isi nominal refund untuk melihat dampaknya.'
                )}
              </div>
            </div>
          }
          body={(reason) => ({ action: 'resolve', resolution, reason })} onDone={() => toast({ title: `${c.code} diputuskan`, tone: 'green' })} />
      )}
    </div>
  )
}

export function DisputeCasePage() {
  const { id = '' } = useParams()
  const query = useDispute(id)
  return (
    <>
      <BackLink to="/admin/disputes">Disputes</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(c) => {
          const t = c.transaction
          return (
            <>
              <PageHeader
                title={t.title}
                description={<span className="flex flex-wrap items-center gap-1.5">{c.code} · dibuka {c.openedBy}, {formatRelative(c.openedAt)} <StatusBadge entity="dispute" status={c.status} /></span>}
                actions={<CaseActions c={c} />}
              />
              <Stepper status={c.status} />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex min-w-0 flex-col gap-6">
                  <Panel title="Pokok sengketa"><p className="text-sm">{c.reason}</p></Panel>
                  {c.resolution && (
                    <Panel title="Putusan">
                      <Facts items={[
                        ['Jenis', { refund: 'Refund penuh', release: 'Lepas ke supplier', partial: 'Refund sebagian' }[c.resolution.kind]],
                        ['Refund ke pembeli', formatIdr(c.resolution.refundIdr)], ['Dilepas ke supplier', formatIdr(c.resolution.releaseIdr)],
                        ['Diputuskan', `${c.resolution.by}, ${formatDateTime(c.resolution.at)}`],
                      ]} />
                      <p className="mt-3 rounded-md bg-muted px-2 py-1.5 text-sm">Dasar: {c.resolution.reason}</p>
                    </Panel>
                  )}
                  <Panel title="Bukti">
                    <div className="grid gap-4 md:grid-cols-2">
                      <EvidenceColumn title="Pembeli" items={c.evidence.filter((e) => e.side === 'buyer')} />
                      <EvidenceColumn title="Supplier" items={c.evidence.filter((e) => e.side === 'supplier')} />
                    </div>
                    {c.evidence.some((e) => e.side === 'admin') && (
                      <div className="mt-4"><EvidenceColumn title={SIDE_LABEL.admin} items={c.evidence.filter((e) => e.side === 'admin')} /></div>
                    )}
                  </Panel>
                  <Panel title="Timeline">
                    <ol className="flex flex-col gap-3 border-l pl-5">
                      {c.timeline.map((e, i) => (
                        <li key={i} className="relative text-sm">
                          <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background bg-primary" />
                          <p>{e.label}</p>
                          <p className="text-xs text-muted-foreground">{e.by} · {formatDateTime(e.at)}</p>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                </div>
                <div className="flex flex-col gap-6">
                  <Panel title="Para pihak">
                    <ul className="flex flex-col gap-3">
                      {c.parties.map((p) => (
                        <li key={p.role} className="flex items-center gap-2 text-sm">
                          <EntityAvatar name={p.name} kind={p.kind} verified={p.verified} size={28} />
                          <div className="min-w-0 flex-1">
                            {p.userId ? <Link to={`/admin/users/${p.userId}`} className="block truncate font-medium hover:underline">{p.name}</Link> : <p className="truncate font-medium">{p.name}</p>}
                            <p className="text-xs text-muted-foreground">{p.role === 'buyer' ? 'Pembeli' : 'Supplier'}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                  <Panel title="Transaksi" action={<Tag>Hanya baca</Tag>}>
                    <dl className="grid gap-2.5 text-sm">
                      {[
                        ['Kode', t.code], ['Status', statusMeta('transaction', t.status).label], ['Kuantitas', formatQty(t.quantity)],
                        ['Harga per unit', formatIdr(t.unitPriceIdr)], ['Total', formatIdr(t.totalIdr)], ['Pembayaran', PAYMENT_LABEL[t.payment.status]],
                      ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>)}
                    </dl>
                    <ul className="mt-3 flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground">
                      {t.documents.map((d) => <li key={d.id} className="flex min-w-0 items-center gap-1.5 truncate">{d.url ? <Attachment name={d.name} url={d.url} /> : <><FileText className="size-3.5 shrink-0" /> {d.name}</>}</li>)}
                    </ul>
                  </Panel>
                </div>
              </div>
            </>
          )
        }}
      </AsyncView>
    </>
  )
}
