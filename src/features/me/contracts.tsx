import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarClock, CircleDollarSign, PackageCheck, Repeat } from 'lucide-react'
import { EVERY, type ContractAction, type ContractEvery, type ContractStatus } from '@/domain/contract'
import { TERMS } from '@/domain/trade'
import { formatDate, formatDateTime, formatIdr, formatNumber, formatQty } from '@/domain/format'
import { cn } from '@/lib/utils'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useContract, useContractAction, useContracts, useCreateContract, useTransaction, type ContractView } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, FormError, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const STATUS: Record<ContractStatus, [string, 'blue' | 'green' | 'yellow' | 'gray' | 'red']> = {
  proposed: ['Menunggu persetujuan', 'blue'], active: ['Aktif', 'green'], paused: ['Dijeda', 'yellow'], ended: ['Selesai', 'gray'], declined: ['Ditolak', 'red'],
}
const ACTION: Record<ContractAction, [label: string, impact: string]> = {
  accept: ['Setujui kontrak', 'Order pertama dibuat otomatis pada tanggal mulai, lalu berulang sesuai frekuensi dengan harga dan termin yang sama.'],
  decline: ['Tolak', 'Kontrak tidak berjalan. Pengusul mendapat notifikasi.'],
  pause: ['Jeda', 'Order berikutnya tidak dibuat sampai kontrak dilanjutkan. Order yang sudah dibuat tetap berjalan.'],
  resume: ['Lanjutkan', 'Order yang terlewat dibuat segera, lalu jadwal kembali normal.'],
  end: ['Akhiri', 'Tidak ada order baru. Order yang sudah dibuat tetap harus diselesaikan.'],
  run_now: ['Buat order berikutnya sekarang', 'Order dibuat hari ini dan jadwal berikutnya dihitung ulang dari hari ini.'],
}
const StatusTag = ({ s }: { s: ContractStatus }) => <Tag tone={STATUS[s][1]}>{STATUS[s][0]}</Tag>
const counterparty = (c: ContractView) => (c.side === 'buyer' ? c.supplier : c.buyer).name

function NewContractDialog({ txId, onClose }: { txId: string; onClose: () => void }) {
  const tx = useTransaction(txId)
  const create = useCreateContract()
  const [f, setF] = useState({ every: 'monthly' as ContractEvery, runs: '6', startAt: new Date().toISOString().slice(0, 10) })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kontrak pasok rutin</DialogTitle>
          <DialogDescription>Item, kuantitas, harga, dan termin mengikuti transaksi ini. Pihak lain perlu menyetujui sebelum order pertama dibuat.</DialogDescription>
        </DialogHeader>
        <AsyncView query={tx} skeleton={<Skeleton className="h-40" />}>
          {(t) => (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate({ fromTx: t.id, every: f.every, runs: Number(f.runs), startAt: f.startAt }, { onSuccess: () => { toast({ title: 'Kontrak diusulkan', body: `Menunggu ${t.counterparty.name}`, tone: 'green' }); onClose() } })
              }}
            >
              <p className="rounded-xl border bg-muted/35 p-4 text-sm leading-relaxed">
                {t.title.split(' · ')[0]} · {formatQty(t.quantity)} × {formatIdr(t.unitPriceIdr)} · {TERMS[t.terms ?? 'escrow'].label} · dengan <b>{t.counterparty.name}</b>
              </p>
              <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
                <div><h3 className="font-semibold">Jadwal pasokan</h3><p className="mt-1 text-sm text-muted-foreground">Atur frekuensi dan durasi order berulang.</p></div>
                <SelectField label="Frekuensi" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as ContractEvery })} error={fieldError(create.error, 'every')}>
                  {Object.entries(EVERY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Jumlah order" type="number" min={2} max={52} value={f.runs} onChange={(e) => setF({ ...f, runs: e.target.value })} error={fieldError(create.error, 'runs')} />
                  <Field label="Order pertama" type="date" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} error={fieldError(create.error, 'startAt')} />
                </div>
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Total nilai kontrak ≈ <b className="num text-foreground">{formatIdr(t.totalIdr * (Number(f.runs) || 0), { compact: true })}</b></p>
              </section>
              <FormError error={create.error} />
              <DialogFooter><Button type="submit" disabled={create.isPending}>Usulkan kontrak</Button></DialogFooter>
            </form>
          )}
        </AsyncView>
      </DialogContent>
    </Dialog>
  )
}

export function ContractsPage() {
  const query = useContracts()
  const [params, setParams] = useSearchParams()
  const from = params.get('from')
  return (
    <>
      <PageHeader title="Kontrak rutin" description="Pasokan berulang dengan harga dan termin yang disepakati. Tiap periode, order baru dibuat otomatis sebagai transaksi biasa." icon={Repeat} tone="teal" featured />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} emptyFallback={false}>
        {(rows) => {
          const activeCount = rows.filter((c) => c.status === 'active').length
          const awaitingCount = rows.filter((c) => c.status === 'proposed').length
          const orderCount = rows.reduce((sum, c) => sum + c.orders.length, 0)
          return (
            <div className="grid gap-6">
              <section aria-label="Ringkasan kontrak" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Kontrak aktif', value: formatNumber(activeCount), note: 'Jadwal berjalan', icon: Repeat, color: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-500/10' },
                  { label: 'Menunggu persetujuan', value: formatNumber(awaitingCount), note: 'Perlu ditinjau kedua pihak', icon: CalendarClock, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10' },
                  { label: 'Order terlaksana', value: formatNumber(orderCount), note: 'Dibuat dari kontrak rutin', icon: PackageCheck, color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-500/10' },
                ].map(({ label, value, note, icon: Icon, color, bg }) => (
                  <article key={label} className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] transition-colors hover:bg-muted/20 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
                      <span className={cn('grid size-10 place-items-center rounded-xl', bg, color)}><Icon className="size-5" aria-hidden="true" /></span>
                    </div>
                  </article>
                ))}
              </section>
              <section className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
                  <div><h2 className="text-lg font-semibold tracking-tight">Daftar kontrak</h2><p className="mt-1 text-sm text-muted-foreground">Lihat frekuensi pasokan, progres order, dan jadwal berikutnya.</p></div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} kontrak</span>
                </div>
                {rows.length ? <DataTable
            caption="Kontrak rutin"
            rows={rows}
            rowKey={(c) => c.id}
            rowHref={(c) => `/app/contracts/${c.id}`}
            columns={[
              { key: 'item', header: 'Kontrak', primary: true, cell: (c) => <span>{c.item} <span className="text-xs text-muted-foreground">{c.code}</span></span> },
              { key: 'with', header: 'Dengan', cell: counterparty },
              { key: 'every', header: 'Frekuensi', cell: (c) => EVERY[c.every] },
              { key: 'progress', header: 'Order', align: 'right', cell: (c) => `${c.orders.length}/${c.runs}`, sortValue: (c) => c.orders.length / c.runs },
              { key: 'next', header: 'Berikutnya', cell: (c) => (c.status === 'active' ? formatDate(c.nextAt) : '–'), sortValue: (c) => c.nextAt },
              { key: 'status', header: 'Status', cell: (c) => <StatusTag s={c.status} /> },
            ]}
          /> : (
            <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7">
              <EmptyState icon={CircleDollarSign} tone="teal" title="Belum ada kontrak rutin" description="Mulai dari transaksi yang sudah selesai. Buka detail transaksi, lalu pilih “Jadikan kontrak rutin” untuk mengatur jadwal pasokan berulang." action={<Button variant="outline" className="hover:bg-accent hover:text-accent-foreground" render={<Link to="/app/transactions" />}>Lihat transaksi</Button>} />
            </div>
          )}
              </section>
            </div>
          )
        }}
      </AsyncView>
      {from && <NewContractDialog txId={from} onClose={() => setParams({}, { replace: true })} />}
    </>
  )
}

export function ContractDetailPage() {
  const { id = '' } = useParams()
  const query = useContract(id)
  const act = useContractAction(id)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(c) => (
        <>
          <PageHeader
            title={c.item}
            description={<span className="flex flex-wrap items-center gap-1.5">{c.code} <StatusTag s={c.status} /> <Tag>{c.side === 'buyer' ? 'Kamu pembeli' : 'Kamu supplier'}</Tag></span>}
            icon={Repeat}
            tone="teal"
            featured
            actions={c.actions.map((a) => (
              <ConfirmDialog
                key={a}
                trigger={<Button variant={a === 'accept' || a === 'run_now' || a === 'resume' ? 'default' : 'outline'} className="h-9">{ACTION[a][0]}</Button>}
                title={`${ACTION[a][0]}?`}
                impact={ACTION[a][1]}
                confirmLabel={ACTION[a][0]}
                destructive={a === 'end' || a === 'decline'}
                onConfirm={() => act.mutateAsync(a).then(() => toast({ title: ACTION[a][0], body: c.code, tone: 'green' }))}
              />
            ))}
          />
          <FormError error={act.error} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0">
              <h2 className="mb-3 font-medium">Order ({c.orders.length}/{c.runs})</h2>
              {c.orders.length ? (
                <ol className="divide-y rounded-xl border bg-card">
                  {c.orders.map((o, i) => {
                    const tx = c.side === 'buyer' ? o.buyerTxId : o.supplierTxId
                    return (
                      <li key={o.at} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span className="num text-muted-foreground">#{i + 1}</span>
                        <span className="flex-1">{formatDateTime(o.at)}</span>
                        {tx && <Link to={`/app/transactions/${tx}`} className="text-primary hover:underline">Lihat transaksi</Link>}
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <EmptyState title="Belum ada order" description={c.status === 'proposed' ? `Menunggu persetujuan ${c.side === c.proposedBy ? counterparty(c) : 'kamu'}.` : `Order pertama ${formatDate(c.nextAt)}.`} />
              )}
            </section>
            <aside className="rounded-xl border bg-card p-4 text-sm">
              <dl className="grid gap-2">
                {([
                  ['Dengan', counterparty(c)], ['Kuantitas per order', formatQty(c.quantity)], ['Harga', `${formatIdr(c.unitPriceIdr)}/${c.quantity.unit}`],
                  ['Nilai per order', formatIdr(c.unitPriceIdr * c.quantity.value)], ['Termin', TERMS[c.terms].label], ['Frekuensi', EVERY[c.every]],
                  ['Order berikutnya', c.status === 'active' ? formatDate(c.nextAt) : '–'],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              {c.sourceTxId && c.side === c.proposedBy && <Link to={`/app/transactions/${c.sourceTxId}`} className="mt-3 inline-block text-primary hover:underline">Transaksi asal</Link>}
            </aside>
          </div>
        </>
      )}
    </AsyncView>
  )
}
