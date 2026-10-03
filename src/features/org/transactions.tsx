import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, FileText, ReceiptText, Truck, Wallet } from 'lucide-react'
import { ACTION_LABEL, TIMELINE, allowedActions, type TransactionAction } from '@/domain/transaction'
import { statusMeta, type TransactionStatus } from '@/domain/status'
import { formatDate, formatDateTime, formatIdr, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useOrgAccess, useOrgTransaction, useOrgTransactionAction, useOrgTransactions, type OrgTransactionPage } from './hooks'
import { FilterPills, GuardedButton, Section } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AuditLog } from '@/components/AuditLog'
import { EntityAvatar } from '@/components/EntityAvatar'
import { StatusBadge, Tag } from '@/components/Tag'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const RUNNING: TransactionStatus[] = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'disputed']
const DOC_LABEL = { order: 'Purchase order', agreement: 'Agreement', invoice: 'Invoice', proof: 'Bukti' }
const PAYMENT_LABEL = { unpaid: 'Belum dibayar', escrow: 'Di escrow', released: 'Dilepas ke supplier', refunded: 'Dikembalikan' }
const poOf = (docs: { kind: string; name: string }[]) => docs.find((d) => d.kind === 'order')?.name.replace(/\.pdf$/, '')

export function OrgTransactionsPage() {
  const access = useOrgAccess()
  const query = useOrgTransactions()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filter') ?? '') as '' | 'buyer' | 'supplier' | 'running'
  return (
    <>
      <PageHeader title="Transactions" description="Purchase order, invoice, pembayaran escrow, pengiriman, dan bukti untuk seluruh tim." icon={ReceiptText} tone="purple" />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} empty={<EmptyState icon={ReceiptText} tone="purple" title="Belum ada transaksi" description="Transaksi dan PO dibuat saat auction di-award atau procurement dipenuhi." />}>
        {(rows) => {
          const visible = rows.filter((t) => !filter || (filter === 'running' ? RUNNING.includes(t.status) : t.role === filter))
          return (
            <>
              <FilterPills label="Filter" value={filter} onChange={(v) => setParams((p) => (v ? p.set('filter', v) : p.delete('filter'), p), { replace: true })}
                options={[['', 'Semua', rows.length], ['running', 'Berjalan', rows.filter((t) => RUNNING.includes(t.status)).length], ['buyer', 'Pembelian', rows.filter((t) => t.role === 'buyer').length], ['supplier', 'Penjualan', rows.filter((t) => t.role === 'supplier').length]]} />
              {visible.length ? (
                <DataTable
                  caption="Transaksi bisnis"
                  rows={visible}
                  rowKey={(t) => t.id}
                  rowHref={(t) => `${access.base}/transactions/${t.id}`}
                  initialSort={{ key: 'updated', dir: 'desc' }}
                  columns={[
                    { key: 'title', header: 'Transaksi', primary: true, cell: (t) => <span>{t.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.code}</span></span> },
                    { key: 'cp', header: 'Pihak lain', cell: (t) => <span className="inline-flex items-center gap-1.5"><EntityAvatar name={t.counterparty.name} kind="business" size={18} /> {t.counterparty.name}</span> },
                    { key: 'role', header: 'Jenis', cell: (t) => <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Pembelian' : 'Penjualan'}</Tag> },
                    { key: 'total', header: 'Nilai', align: 'right', cell: (t) => formatIdr(t.totalIdr, { compact: true }), sortValue: (t) => t.totalIdr },
                    { key: 'status', header: 'Status', cell: (t) => <StatusBadge entity="transaction" status={t.status} /> },
                    { key: 'updated', header: 'Diperbarui', cell: (t) => <span className="text-muted-foreground">{formatRelative(t.updatedAt)}</span>, sortValue: (t) => t.updatedAt },
                  ]}
                />
              ) : <EmptyState title="Tidak ada transaksi untuk filter ini" />}
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

const ACTION_IMPACT: Partial<Record<TransactionAction, string>> = {
  pay: 'Dana perusahaan ditahan di escrow dan diteruskan ke supplier setelah barang dikonfirmasi diterima.',
  ship: 'Pembeli diberi tahu bahwa barang sudah dikirim.',
  confirm_receipt: 'Dana escrow dilepas ke supplier dan transaksi selesai. Tidak bisa dibatalkan.',
  cancel: 'Transaksi dibatalkan untuk kedua pihak dan tercatat di riwayat reputasi.',
  issue_invoice: 'Invoice dikirim ke pembeli untuk dibayar.',
}

function Actions({ t }: { t: OrgTransactionPage }) {
  const access = useOrgAccess()
  const act = useOrgTransactionAction(t.id)
  const [file, setFile] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const actions = allowedActions(t.status, t.role)
  const deny = access.deny('transactions', 'manage')
  const done = (a: TransactionAction) => () => toast({ title: ACTION_LABEL[a], body: t.code, tone: 'green' })
  if (!actions.length) return <p className="text-sm text-muted-foreground">Tidak ada aksi yang menunggu tim.</p>
  if (deny) return <div className="flex flex-col gap-2">{actions.map((a) => <GuardedButton key={a} className="h-9" variant="outline" reason={deny}>{ACTION_LABEL[a]}</GuardedButton>)}</div>
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => {
        if (a === 'upload_proof')
          return (
            <div key={a} className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <label className="cursor-pointer text-sm">
                <span className="font-medium">Bukti pengiriman</span>
                <span className="block truncate text-muted-foreground">{file || 'Pilih surat jalan / foto serah terima'}</span>
                <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
              </label>
              {fieldError(act.error, 'file') && <p className="text-xs text-destructive">{fieldError(act.error, 'file')}</p>}
              <Button className="h-9" disabled={!file || act.isPending} onClick={() => act.mutate({ action: a, file }, { onSuccess: done(a) })}>{ACTION_LABEL[a]}</Button>
            </div>
          )
        if (a === 'dispute')
          return (
            <Dialog key={a} open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button variant="destructive" className="h-9" />}>{ACTION_LABEL[a]}</DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ajukan dispute {t.code}</DialogTitle>
                  <DialogDescription>Dana tetap di escrow selama dispute. Kedua pihak diminta bukti, lalu Admin memutuskan.</DialogDescription>
                </DialogHeader>
                <TextareaField label="Apa masalahnya?" rows={4} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(act.error, 'note')} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button variant="destructive" disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action: a, note }, { onSuccess: () => { setOpen(false); done(a)() } })}>Ajukan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        return (
          <ConfirmDialog
            key={a}
            trigger={<Button variant={a === 'cancel' ? 'outline' : 'default'} className="h-9">{ACTION_LABEL[a]}</Button>}
            title={`${ACTION_LABEL[a]}?`}
            impact={<>{ACTION_IMPACT[a]}{a === 'pay' && <> Nilai: <b>{formatIdr(t.totalIdr)}</b>.</>}</>}
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

export function OrgTransactionDetailPage() {
  const { tid = '' } = useParams()
  const query = useOrgTransaction(tid)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(t) => (
        <>
          <PageHeader
            title={t.title}
            description={<span className="flex flex-wrap items-center gap-1.5">{t.code} <StatusBadge entity="transaction" status={t.status} /> <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Pembelian' : 'Penjualan'}</Tag>{poOf(t.documents) && <Tag>{poOf(t.documents)}</Tag>}</span>}
            icon={ReceiptText}
            tone="purple"
          />
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <Section title="Progres">
                <ol className="flex flex-col">
                  {TIMELINE.map((s, i) => {
                    const step = t.timeline.find((x) => x.status === s)
                    const reached = !!step?.at
                    return (
                      <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
                        {i < TIMELINE.length - 1 && <span className={cn('absolute top-6 left-3 h-full w-px', reached ? 'bg-primary' : 'bg-border')} />}
                        <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-xs', reached ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground', t.status === s && 'ring-3 ring-primary/30')}>
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
              </Section>
              <Section title="Rincian">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ['Kuantitas', formatQty(t.quantity)], ['Harga per unit', formatIdr(t.unitPriceIdr)], ['Total', formatIdr(t.totalIdr)],
                    ['Jatuh tempo', formatDate(t.dueAt)], ['Pembayaran', PAYMENT_LABEL[t.payment.status]],
                    ['Pengiriman', t.delivery.eta ? `Estimasi ${formatDate(t.delivery.eta)}` : t.delivery.proof ? 'Terkirim' : 'Belum dikirim'],
                  ].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="num font-medium">{v}</dd></div>)}
                </dl>
              </Section>
              <Section title="Dokumen & PO">
                <ul className="divide-y text-sm">
                  {t.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <Tag tone={d.kind === 'order' ? 'blue' : 'gray'}>{DOC_LABEL[d.kind]}</Tag>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(d.at)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Aktivitas">
                <AuditLog entries={t.activity} />
              </Section>
            </div>
            <aside className="flex flex-col gap-4">
              <Section title="Aksi tim"><Actions t={t} /></Section>
              <Section title="Pihak lain">
                <p className="flex items-center gap-2 text-sm"><EntityAvatar name={t.counterparty.name} kind="business" verified={t.counterparty.verified} size={28} /> {t.counterparty.name}</p>
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4" /> {PAYMENT_LABEL[t.payment.status]}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Truck className="size-4" /> {t.delivery.address}</p>
              </Section>
            </aside>
          </div>
        </>
      )}
    </AsyncView>
  )
}
