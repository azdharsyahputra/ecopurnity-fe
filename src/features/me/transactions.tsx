import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, FileText, ReceiptText, Truck, Wallet } from 'lucide-react'
import type { TransactionDetail } from '@/domain/types'
import { ACTION_LABEL, TIMELINE, allowedActions, type TransactionAction } from '@/domain/transaction'
import { statusMeta } from '@/domain/status'
import { formatDate, formatDateTime, formatIdr, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useTransaction, useTransactionAction, useTransactions } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError, Segmented, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function TransactionsPage() {
  const [role, setRole] = useState<'' | 'buyer' | 'supplier'>('')
  const query = useTransactions(role || undefined)
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Order, invoice, pembayaran, pengiriman, dan bukti, dari agreement sampai selesai."
        icon={ReceiptText}
        tone="purple"
        actions={<Segmented label="Peran" value={role} options={[['', 'Semua'], ['buyer', 'Sebagai pembeli'], ['supplier', 'Sebagai supplier']]} onChange={setRole} />}
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        empty={<EmptyState icon={ReceiptText} tone="purple" title="Belum ada transaksi" description="Transaksi dibuat otomatis saat kamu menang auction atau menetapkan pemenang." />}
      >
        {(rows) => (
          <DataTable
            caption="Transaksi"
            rows={rows}
            rowKey={(t) => t.id}
            rowHref={(t) => `/app/transactions/${t.id}`}
            initialSort={{ key: 'updated', dir: 'desc' }}
            columns={[
              { key: 'title', header: 'Transaksi', primary: true, cell: (t) => <span>{t.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.code}</span></span> },
              { key: 'cp', header: 'Pihak lain', cell: (t) => <span className="inline-flex items-center gap-1.5"><EntityAvatar name={t.counterparty.name} kind={t.counterparty.kind} size={18} /> {t.counterparty.name}</span> },
              { key: 'role', header: 'Peran', cell: (t) => <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Pembeli' : 'Supplier'}</Tag> },
              { key: 'total', header: 'Nilai', align: 'right', cell: (t) => formatIdr(t.totalIdr, { compact: true }), sortValue: (t) => t.totalIdr },
              { key: 'status', header: 'Status', cell: (t) => <StatusBadge entity="transaction" status={t.status} /> },
              { key: 'updated', header: 'Diperbarui', cell: (t) => <span className="text-muted-foreground">{formatRelative(t.updatedAt)}</span>, sortValue: (t) => t.updatedAt },
            ]}
          />
        )}
      </AsyncView>
    </>
  )
}

const ACTION_IMPACT: Partial<Record<TransactionAction, string>> = {
  pay: 'Dana ditahan di escrow dan baru diteruskan ke supplier setelah kamu mengonfirmasi barang diterima.',
  ship: 'Pembeli diberi tahu bahwa barang sudah dikirim.',
  confirm_receipt: 'Dana escrow dilepas ke supplier dan transaksi selesai. Tidak bisa dibatalkan.',
  cancel: 'Transaksi dibatalkan untuk kedua pihak. Tercatat di riwayat reputasi.',
  issue_invoice: 'Invoice dikirim ke pembeli untuk dibayar.',
}

function ActionButtons({ t }: { t: TransactionDetail }) {
  const act = useTransactionAction(t.id)
  const [file, setFile] = useState('')
  const [note, setNote] = useState('')
  const [disputeOpen, setDisputeOpen] = useState(false)
  const actions = allowedActions(t.status, t.role)
  const done = (a: TransactionAction) => () => toast({ title: ACTION_LABEL[a], body: t.code, tone: 'green' })

  if (!actions.length) return <p className="text-sm text-muted-foreground">Tidak ada aksi yang menunggu kamu.</p>
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => {
        if (a === 'upload_proof')
          return (
            <div key={a} className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <label className="cursor-pointer text-sm">
                <span className="font-medium">Bukti pengiriman</span>
                <span className="block truncate text-muted-foreground">{file || 'Pilih foto / dokumen serah terima'}</span>
                <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
              </label>
              {fieldError(act.error, 'file') && <p className="text-xs text-destructive">{fieldError(act.error, 'file')}</p>}
              <Button className="h-9" disabled={!file || act.isPending} onClick={() => act.mutate({ action: a, file }, { onSuccess: done(a) })}>{ACTION_LABEL[a]}</Button>
            </div>
          )
        if (a === 'dispute')
          return (
            <Dialog key={a} open={disputeOpen} onOpenChange={setDisputeOpen}>
              <DialogTrigger render={<Button variant="destructive" className="h-9" />}>{ACTION_LABEL[a]}</DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ajukan dispute {t.code}</DialogTitle>
                  <DialogDescription>Dana tetap di escrow selama dispute. Kedua pihak diminta bukti, lalu Admin memutuskan.</DialogDescription>
                </DialogHeader>
                <TextareaField label="Apa masalahnya?" rows={4} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(act.error, 'note')} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisputeOpen(false)}>Batal</Button>
                  <Button variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: a, note }, { onSuccess: () => { setDisputeOpen(false); done(a)() } })}>Ajukan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        return (
          <ConfirmDialog
            key={a}
            trigger={<Button variant={a === 'cancel' ? 'outline' : 'default'} className="h-9">{ACTION_LABEL[a]}</Button>}
            title={`${ACTION_LABEL[a]}?`}
            impact={ACTION_IMPACT[a]}
            confirmLabel={ACTION_LABEL[a]}
            destructive={a === 'cancel'}
            onConfirm={() => act.mutateAsync({ action: a }).then(done(a))}
          />
        )
      })}
      <FormError error={act.error} />
    </div>
  )
}

const PAYMENT_LABEL = { unpaid: 'Belum dibayar', escrow: 'Di escrow', released: 'Dilepas ke supplier', refunded: 'Dikembalikan' }

export function TransactionDetailPage() {
  const { id = '' } = useParams()
  const query = useTransaction(id)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(t) => (
        <>
          <PageHeader
            title={t.title}
            description={<span className="flex flex-wrap items-center gap-1.5">{t.code} <StatusBadge entity="transaction" status={t.status} /> <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Kamu pembeli' : 'Kamu supplier'}</Tag></span>}
            icon={ReceiptText}
            tone="purple"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <section className="rounded-xl border bg-card p-4 md:p-5">
                <h2 className="font-medium">Progres</h2>
                <ol className="mt-4 flex flex-col gap-0">
                  {TIMELINE.map((s, i) => {
                    const step = t.timeline.find((x) => x.status === s)
                    const reached = !!step?.at
                    const current = t.status === s
                    return (
                      <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
                        {i < TIMELINE.length - 1 && <span className={cn('absolute top-6 left-3 h-full w-px', reached ? 'bg-primary' : 'bg-border')} />}
                        <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-xs', reached ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground', current && 'ring-3 ring-primary/30')}>
                          {reached ? <Check className="size-3.5" /> : i + 1}
                        </span>
                        <div className="text-sm">
                          <p className={cn('font-medium', !reached && 'text-muted-foreground')}>{statusMeta('transaction', s).label}</p>
                          <p className="text-xs text-muted-foreground">{step?.at ? `${formatDateTime(step.at)}${step.note ? ` · ${step.note}` : ''}` : 'Menunggu'}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {(t.status === 'cancelled' || t.status === 'disputed') && (
                  <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
                    {t.status === 'cancelled' ? 'Transaksi dibatalkan.' : `Dispute dibuka ${formatRelative(t.dispute!.openedAt)}: ${t.dispute!.reason}`}
                  </p>
                )}
              </section>

              <section className="rounded-xl border bg-card p-4 md:p-5">
                <h2 className="font-medium">Rincian</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ['Kuantitas', formatQty(t.quantity)],
                    ['Harga per unit', formatIdr(t.unitPriceIdr)],
                    ['Total', formatIdr(t.totalIdr)],
                    ['Jatuh tempo', formatDate(t.dueAt)],
                    ['Pembayaran', PAYMENT_LABEL[t.payment.status]],
                    ['Pengiriman', t.delivery.eta ? `Estimasi ${formatDate(t.delivery.eta)}` : t.delivery.proof ? 'Terkirim' : 'Belum dikirim'],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="num font-medium">{v}</dd></div>
                  ))}
                </dl>
              </section>

              <section className="rounded-xl border bg-card p-4 md:p-5">
                <h2 className="font-medium">Dokumen</h2>
                <ul className="mt-3 divide-y text-sm">
                  {t.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{d.name}</span>
                      <Tag>{{ order: 'Order', agreement: 'Agreement', invoice: 'Invoice', proof: 'Bukti' }[d.kind]}</Tag>
                      <span className="text-xs text-muted-foreground">{formatDate(d.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-xl border bg-card p-4">
                <h2 className="mb-3 font-medium">Aksi kamu</h2>
                <ActionButtons t={t} />
              </section>
              <section className="rounded-xl border bg-card p-4 text-sm">
                <h2 className="font-medium">Pihak lain</h2>
                <p className="mt-2 flex items-center gap-2"><EntityAvatar name={t.counterparty.name} kind={t.counterparty.kind} verified={t.counterparty.verified} size={28} /> {t.counterparty.name}</p>
                <p className="mt-3 flex items-center gap-2 text-muted-foreground"><Wallet className="size-4" /> {PAYMENT_LABEL[t.payment.status]}</p>
                <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Truck className="size-4" /> {t.delivery.address}</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </AsyncView>
  )
}
