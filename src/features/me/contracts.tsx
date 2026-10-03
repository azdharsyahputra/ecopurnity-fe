import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { EVERY, type ContractAction, type ContractEvery, type ContractStatus } from '@/domain/contract'
import { TERMS } from '@/domain/trade'
import { formatDate, formatDateTime, formatIdr, formatQty } from '@/domain/format'
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
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate({ fromTx: t.id, every: f.every, runs: Number(f.runs), startAt: f.startAt }, { onSuccess: () => { toast({ title: 'Kontrak diusulkan', body: `Menunggu ${t.counterparty.name}`, tone: 'green' }); onClose() } })
              }}
            >
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">
                {t.title.split(' · ')[0]} · {formatQty(t.quantity)} × {formatIdr(t.unitPriceIdr)} · {TERMS[t.terms ?? 'escrow'].label} · dengan <b>{t.counterparty.name}</b>
              </p>
              <SelectField label="Frekuensi" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as ContractEvery })} error={fieldError(create.error, 'every')}>
                {Object.entries(EVERY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </SelectField>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jumlah order" type="number" min={2} max={52} value={f.runs} onChange={(e) => setF({ ...f, runs: e.target.value })} error={fieldError(create.error, 'runs')} />
                <Field label="Order pertama" type="date" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} error={fieldError(create.error, 'startAt')} />
              </div>
              <p className="text-sm text-muted-foreground">Total nilai kontrak ≈ <b className="num text-foreground">{formatIdr(t.totalIdr * (Number(f.runs) || 0), { compact: true })}</b></p>
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
      <PageHeader title="Kontrak rutin" description="Pasokan berulang dengan harga dan termin yang disepakati. Tiap periode, order baru dibuat otomatis sebagai transaksi biasa." icon={Repeat} tone="teal" />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        isEmpty={(r) => r.length === 0}
        empty={<EmptyState icon={Repeat} title="Belum ada kontrak" description="Buka transaksi yang sudah selesai, lalu pilih “Jadikan kontrak rutin”." action={<Button variant="outline" render={<Link to="/app/transactions" />}>Lihat transaksi</Button>} />}
      >
        {(rows) => (
          <DataTable
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
          />
        )}
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
