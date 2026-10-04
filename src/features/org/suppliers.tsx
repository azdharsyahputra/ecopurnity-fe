import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Ban, FileText, MapPin, Search, Star, Truck, UserPlus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CategoryId } from '@/domain/types'
import { RELATION, scoreOf, type OrgSupplier, type SupplierAction, type SupplierRelation } from '@/domain/org'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatDate, formatIdr, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useOrgAccess, useSupplier, useSupplierAction, useSuppliers } from './hooks'
import { monthLabel, selectClass } from './utils'
import { FilterPills, GuardedButton, RelationBadge, Section, Stars } from './ui'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AuditLog } from '@/components/AuditLog'
import { EntityAvatar } from '@/components/EntityAvatar'
import { StatusBadge, Tag } from '@/components/Tag'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const ACTION_LABEL: Record<Exclude<SupplierAction, 'rate' | 'block' | 'verify'>, string> = { shortlist: 'Shortlist', invite: 'Undang', unblock: 'Buka blokir' }


function RelationActions({ s, compact }: { s: OrgSupplier; compact?: boolean }) {
  const access = useOrgAccess()
  const act = useSupplierAction()
  const [reason, setReason] = useState('')
  const run = (action: SupplierAction, extra: { reason?: string } = {}) => act.mutateAsync({ id: s.id, action, ...extra }).then(() => toast({ title: `${s.name}: ${RELATION[{ shortlist: 'shortlisted', invite: 'invited', verify: 'verified', block: 'blocked', unblock: 'none', rate: s.relation }[action] as SupplierRelation][0]}`, tone: 'green' }))
  const createDeny = access.deny('suppliers', 'create')
  const manageDeny = access.deny('suppliers', 'manage')
  const size = compact ? 'xs' : 'default'
  const cls = compact ? undefined : 'h-9'
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  if (s.relation === 'blocked')
    return <span onClick={stop}><GuardedButton size={size} className={cls} variant="outline" reason={manageDeny} onClick={() => run('unblock')}>{ACTION_LABEL.unblock}</GuardedButton></span>
  return (
    <span className="inline-flex flex-wrap gap-1.5" onClick={stop}>
      {s.relation === 'none' && <GuardedButton size={size} className={cls} variant="outline" reason={createDeny} onClick={() => run('shortlist')}><Star /> Shortlist</GuardedButton>}
      {(s.relation === 'none' || s.relation === 'shortlisted') && <GuardedButton size={size} className={cls} reason={createDeny} onClick={() => run('invite')}><UserPlus /> Undang</GuardedButton>}
      {!compact && s.relation !== 'verified' && (
        manageDeny ? <GuardedButton className={cls} variant="outline" reason={manageDeny}>Verifikasi</GuardedButton> : (
          <ConfirmDialog
            trigger={<Button variant="outline" className={cls}><BadgeCheck /> Verifikasi</Button>}
            title={`Verifikasi ${s.name}?`}
            impact={<>Dokumen: {s.documents.join(', ')}. Supplier terverifikasi masuk daftar aktif tim dan bisa diundang ke auction tertutup.</>}
            confirmLabel="Verifikasi"
            onConfirm={() => run('verify')}
          />
        )
      )}
      {!compact && (
        manageDeny ? <GuardedButton className={cls} variant="ghost" reason={manageDeny}>Blokir</GuardedButton> : (
          <ConfirmDialog
            trigger={<Button variant="ghost" className={cls}><Ban /> Blokir</Button>}
            title={`Blokir ${s.name}?`}
            destructive
            impact={
              <div className="flex flex-col gap-3">
                <p>Supplier tidak bisa melihat atau menawar procurement dan auction tim ini. Transaksi berjalan tetap dilanjutkan.</p>
                <TextareaField label="Alasan blokir" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(act.error, 'reason')} />
              </div>
            }
            confirmLabel="Blokir"
            onConfirm={() => run('block', { reason })}
          />
        )
      )}
      {!compact && <FormError error={act.error} />}
    </span>
  )
}



export function SuppliersPage() {
  const access = useOrgAccess()
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const search = new URLSearchParams([...params].filter(([k]) => ['q', 'category', 'region', 'minRating', 'verified', 'relation'].includes(k))).toString()
  const query = useSuppliers(search)
  const relation = (params.get('relation') ?? '') as '' | SupplierRelation
  return (
    <>
      <PageHeader title="Suppliers" description="Temukan, shortlist, undang, verifikasi, dan nilai supplier. Scorecard dihitung dari transaksi." icon={Truck} tone="blue" featured />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search">
        <label className="relative sm:w-64">
          <span className="sr-only">Cari supplier</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Cari supplier" defaultValue={params.get('q') ?? ''} onChange={(e) => set('q', e.target.value || null)} className="h-9 pl-8" />
        </label>
        <select aria-label="Kategori" className={selectClass} value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value || null)}>
          <option value="">Semua kategori</option>
          {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
        <select aria-label="Wilayah" className={selectClass} value={params.get('region') ?? ''} onChange={(e) => set('region', e.target.value || null)}>
          <option value="">Semua wilayah</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select aria-label="Rating minimum" className={selectClass} value={params.get('minRating') ?? ''} onChange={(e) => set('minRating', e.target.value || null)}>
          <option value="">Semua rating</option>
          {['4.5', '4', '3.5'].map((r) => <option key={r} value={r}>★ {r.replace('.', ',')}+</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={params.get('verified') === '1'} onChange={(e) => set('verified', e.target.checked ? '1' : null)} /> Hanya terverifikasi platform</label>
      </div>
      <FilterPills<'' | SupplierRelation> label="Relasi" value={relation} onChange={(v) => set('relation', v || null)}
        options={[['', 'Semua'], ...(['shortlisted', 'invited', 'verified', 'blocked'] as SupplierRelation[]).map((r) => [r, RELATION[r][0]] as ['' | SupplierRelation, string])]} />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} empty={<EmptyState icon={Truck} title="Tidak ada supplier yang cocok" description="Longgarkan filter atau cari dengan kata lain." />}>
        {(rows) => (
          <DataTable
            caption="Supplier"
            rows={rows}
            rowKey={(s) => s.id}
            rowHref={(s) => `${access.base}/suppliers/${s.id}`}
            initialSort={{ key: 'rating', dir: 'desc' }}
            columns={[
              { key: 'name', header: 'Supplier', primary: true, cell: (s) => <span className="inline-flex items-center gap-2"><EntityAvatar name={s.name} kind="business" verified={s.verified} size={22} />{s.name}</span>, sortValue: (s) => s.name },
              { key: 'cat', header: 'Kategori', cell: (s) => <span className="inline-flex flex-wrap gap-1">{s.categories.map((c) => <CategoryTag key={c} id={c} />)}</span> },
              { key: 'region', header: 'Wilayah', cell: (s) => s.region },
              { key: 'rating', header: 'Rating', align: 'right', cell: (s) => <Stars value={s.rating} />, sortValue: (s) => s.rating },
              { key: 'score', header: 'Skor', align: 'right', cell: (s) => scoreOf(s.scorecard[s.scorecard.length - 1]), sortValue: (s) => scoreOf(s.scorecard[s.scorecard.length - 1]) },
              { key: 'rel', header: 'Relasi', cell: (s) => <RelationBadge relation={s.relation} /> },
              { key: 'act', header: 'Aksi', cell: (s) => <RelationActions s={s} compact /> },
            ]}
          />
        )}
      </AsyncView>
    </>
  )
}



const METRICS = [['price', 'Price'], ['reliability', 'Reliability'], ['quality', 'Quality'], ['delivery', 'Delivery']] as const

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const access = useOrgAccess()
  const query = useSupplier(id)
  const act = useSupplierAction()
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(s) => {
        const last = s.scorecard[s.scorecard.length - 1]
        return (
          <>
            <PageHeader
              title={s.name}
              description={<span className="flex flex-wrap items-center gap-1.5"><RelationBadge relation={s.relation} />{s.verified && <Tag tone="teal">Terverifikasi platform</Tag>}<span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.region}</span><Stars value={s.rating} /></span>}
              icon={Truck}
              tone="blue"
              featured
              actions={<RelationActions s={s} />}
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <Section title="Supplier Scorecard" actions={<span className="num text-2xl font-semibold" aria-label={`Skor gabungan ${scoreOf(last)} dari 100`}>{scoreOf(last)}<span className="text-sm font-normal text-muted-foreground">/100</span></span>}>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {METRICS.map(([k, label], i) => (
                      <div key={k} className="rounded-lg border p-3">
                        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES[i] }} />{label}</dt>
                        <dd className="num text-xl font-semibold">{last[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
                <ChartCard
                  title="Tren scorecard"
                  subtitle="Skor 0–100 per bulan"
                  legend={METRICS.map(([, label], i) => ({ label, color: SERIES[i] }))}
                  table={{ columns: ['Bulan', ...METRICS.map(([, l]) => l)], rows: s.scorecard.map((p) => [monthLabel(p.month), ...METRICS.map(([k]) => p[k])]) }}
                >
                  <ResponsiveContainer>
                    <LineChart data={s.scorecard} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid {...grid} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                      <YAxis width={32} domain={[40, 100]} {...axis} />
                      <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }} content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} />} />
                      {METRICS.map(([k, label], i) => <Line key={k} dataKey={k} name={label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                <Section title="Transaksi dengan tim ini">
                  {s.history.length ? (
                    <DataTable
                      caption="Transaksi dengan supplier"
                      rows={s.history}
                      rowKey={(t) => t.id}
                      rowHref={(t) => `${access.base}/transactions/${t.id}`}
                      columns={[
                        { key: 'title', header: 'Transaksi', primary: true, cell: (t) => <span>{t.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.code}</span></span> },
                        { key: 'total', header: 'Nilai', align: 'right', cell: (t) => formatIdr(t.totalIdr, { compact: true }) },
                        { key: 'status', header: 'Status', cell: (t) => <StatusBadge entity="transaction" status={t.status} /> },
                        { key: 'at', header: 'Dibuat', cell: (t) => <span className="text-muted-foreground">{formatRelative(t.createdAt)}</span> },
                      ]}
                    />
                  ) : <p className="text-sm text-muted-foreground">Belum ada transaksi berjalan.</p>}
                  {s.purchases.length > 0 && (
                    <>
                      <h3 className="mt-5 mb-2 text-sm font-medium">Riwayat pembelian</h3>
                      <ul className="divide-y text-sm">
                        {s.purchases.map((h) => (
                          <li key={h.code} className="flex flex-wrap justify-between gap-x-3 py-2">
                            <span>{h.item} <span className="text-xs text-muted-foreground">{monthLabel(h.month)} · {h.via}</span></span>
                            <span className="num text-muted-foreground">{formatQty(h.quantity, { compact: true })} × {formatIdr(h.unitPriceIdr)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Section>
              </div>
              <aside className="flex flex-col gap-6">
                <Section title="Profil">
                  <dl className="grid gap-2 text-sm">
                    <div><dt className="text-muted-foreground">Kategori</dt><dd className="mt-0.5 flex flex-wrap gap-1">{s.categories.map((c: CategoryId) => <CategoryTag key={c} id={c} />)}</dd></div>
                    <div><dt className="text-muted-foreground">Kapasitas</dt><dd>{s.capacity}</dd></div>
                    <div><dt className="text-muted-foreground">Total belanja tim</dt><dd className="num font-medium">{formatIdr(s.spendIdr, { compact: true })}</dd></div>
                  </dl>
                  <h3 className="mt-4 text-sm font-medium">Dokumen</h3>
                  <ul className="mt-1 text-sm">{s.documents.map((d) => <li key={d} className="flex items-center gap-2 py-1"><FileText className="size-4 text-muted-foreground" />{d}</li>)}</ul>
                </Section>
                <Section title="Rating dari tim">
                  <div role="radiogroup" aria-label="Rating tim" className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={s.myRating === n} aria-label={`${n} bintang`} disabled={!!access.deny('suppliers', 'manage') || act.isPending || s.relation === 'blocked'}
                        onClick={() => act.mutate({ id: s.id, action: 'rate', rating: n }, { onSuccess: () => toast({ title: `Rating ${n}/5 disimpan`, tone: 'green' }) })}
                        className="text-2xl leading-none disabled:opacity-60" style={{ color: (s.myRating ?? 0) >= n ? 'var(--tag-yellow-fg)' : 'var(--border)' }}>★</button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{access.deny('suppliers', 'manage') ?? (s.myRating ? `Terakhir dinilai ${s.myRating}/5` : 'Belum dinilai')}</p>
                </Section>
                <Section title="Aktivitas">
                  <AuditLog entries={s.activity} />
                </Section>
                <Link to={`${access.base}/suppliers`} className="text-sm text-primary hover:underline">Kembali ke daftar supplier</Link>
                <p className="text-xs text-muted-foreground">Data scorecard per {formatDate(new Date().toISOString())}.</p>
              </aside>
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}
