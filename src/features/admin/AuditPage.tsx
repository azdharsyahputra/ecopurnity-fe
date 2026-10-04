import { useSearchParams } from 'react-router-dom'
import { Download, History, SlidersHorizontal, Users } from 'lucide-react'
import type { AuditEntry } from '@/domain/types'
import { formatNumber } from '@/domain/format'
import { useAuditTrail } from './hooks'
import { toCsv } from './labels'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { AuditLog } from '@/components/AuditLog'
import { Field, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const ENTITY_LABEL: Record<AuditEntry['entity']['type'], string> = {
  user: 'User', business: 'Bisnis', opportunity: 'Opportunity', market: 'Market', alert: 'Fraud alert', auction: 'Auction', transaction: 'Transaksi', dispute: 'Dispute',
  rule: 'Aturan', procurement: 'Procurement', supplier: 'Supplier',
}

/** Dates are WIB calendar days; entries are UTC instants. */
const wibDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)

function exportCsv(rows: AuditEntry[]) {
  const csv = toCsv([
    ['Waktu (UTC)', 'Aktor', 'Aksi', 'Jenis entitas', 'ID entitas', 'Entitas', 'Alasan', 'Perubahan'],
    ...rows.map((e) => [
      e.at, e.actor, e.action, e.entity.type, e.entity.id, e.entity.label, e.reason,
      e.changes?.map((c) => `${c.field}: ${c.before ?? ''} → ${c.after ?? ''}`).join('; '),
    ]),
  ])
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AuditTrailPage() {
  const [params, setParams] = useSearchParams()
  const f = { type: params.get('type') ?? '', actor: params.get('actor') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const set = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const query = useAuditTrail()

  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(all) => {
        const actors = [...new Set(all.map((e) => e.actor))].sort()
        const rows = all.filter(
          (e) => (!f.type || e.entity.type === f.type) && (!f.actor || e.actor === f.actor) && (!f.from || wibDay(e.at) >= f.from) && (!f.to || wibDay(e.at) <= f.to),
        )
        const hasFilters = Object.values(f).some(Boolean)
        const resetFilters = () => setParams(new URLSearchParams(), { replace: true })
        return (
          <>
            <PageHeader
              title="Audit trail"
              description="Siapa melakukan apa, kapan, dan kenapa, di semua workspace. Catatan tidak bisa diubah atau dihapus."
              icon={History}
              tone="orange"
              actions={<Button variant="outline" className="h-9" disabled={!rows.length} onClick={() => exportCsv(rows)}><Download /> Ekspor CSV ({rows.length})</Button>}
            />
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-300"><History className="size-4" /></span>Aktivitas tercatat</div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(all.length)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Seluruh catatan yang tersedia</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300"><SlidersHorizontal className="size-4" /></span>Sesuai filter</div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(rows.length)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Catatan yang cocok dengan pilihan</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300"><Users className="size-4" /></span>Aktor terlibat</div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(new Set(rows.map((e) => e.actor)).size)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Aktor berbeda pada hasil saat ini</p>
              </div>
            </div>
            <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div><h2 className="font-semibold">Filter aktivitas</h2><p className="mt-0.5 text-sm text-muted-foreground">Persempit riwayat berdasarkan jenis, aktor, atau tanggal WIB.</p></div>
                {hasFilters && <Button variant="ghost" className="h-8" onClick={resetFilters}>Hapus filter</Button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField label="Jenis entitas" value={f.type} onChange={(e) => set('type', e.target.value)}>
                  <option value="">Semua</option>
                  {Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectField>
                <SelectField label="Aktor" value={f.actor} onChange={(e) => set('actor', e.target.value)}>
                  <option value="">Semua</option>
                  {actors.map((a) => <option key={a}>{a}</option>)}
                </SelectField>
                <Field label="Dari tanggal" type="date" value={f.from} max={f.to || undefined} onChange={(e) => set('from', e.target.value)} />
                <Field label="Sampai tanggal" type="date" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div><h2 className="font-semibold">Riwayat perubahan</h2><p className="mt-0.5 text-sm text-muted-foreground">Urutkan dan telusuri detail tindakan yang tercatat.</p></div>
                <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{formatNumber(rows.length)} catatan</span>
              </div>
              {rows.length ? <div className="p-4 sm:p-5"><AuditLog entries={rows} showEntity /></div> : <EmptyState icon={History} title={all.length ? 'Tidak ada catatan di filter ini' : 'Belum ada aktivitas tercatat'} description={all.length ? 'Longgarkan filter tanggal atau aktor, atau hapus filter untuk melihat semua catatan.' : 'Tindakan Admin, Market Maker, dan bisnis akan tercatat di sini.'} className="m-4 sm:m-5" />}
            </section>
          </>
        )
      }}
    </AsyncView>
  )
}
