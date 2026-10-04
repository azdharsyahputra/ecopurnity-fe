import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, CircleDollarSign, Clock3, Link2, ReceiptText, Repeat, RotateCcw, Truck, Wallet } from 'lucide-react'
import { TERMS } from '@/domain/trade'
import { formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { cn } from '@/lib/utils'
import { personalTradeScope, useTransaction, useTransactions } from './hooks'
import { ActionPanel, TradeSections } from '@/features/trade/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function TransactionsPage() {
  const [role, setRole] = useState<'' | 'buyer' | 'supplier'>('')
  const query = useTransactions(role || undefined)
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Agreement, invoice, pembayaran, pengiriman, dan penerimaan barang, dari dua sisi transaksi."
        icon={ReceiptText}
        tone="purple"
        featured
        actions={
          <div role="group" aria-label="Filter peran transaksi" className="inline-flex flex-wrap rounded-xl border bg-muted/55 p-1">
            {([['', 'Semua'], ['buyer', 'Sebagai pembeli'], ['supplier', 'Sebagai supplier']] as const).map(([value, label]) => (
              <button key={value || 'all'} type="button" aria-pressed={role === value} onClick={() => setRole(value)}
                className={cn('inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors', role === value ? 'border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/15' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        emptyFallback={false}
      >
        {(rows) => {
          const runningCount = rows.filter((t) => !['completed', 'cancelled', 'disputed'].includes(t.status)).length
          const totalValue = rows.reduce((sum, t) => sum + t.totalIdr, 0)
          return (
            <div className="grid gap-6">
              <section aria-label="Ringkasan transaksi" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Total transaksi', value: formatNumber(rows.length), note: role === 'buyer' ? 'Sebagai pembeli' : role === 'supplier' ? 'Sebagai supplier' : 'Dari kedua peran', icon: ReceiptText, color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-500/10' },
                  { label: 'Perlu dipantau', value: formatNumber(runningCount), note: 'Belum selesai', icon: Clock3, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10' },
                  { label: 'Nilai transaksi', value: formatIdr(totalValue, { compact: true }), note: 'Akumulasi daftar ini', icon: CircleDollarSign, color: 'text-teal-700 dark:text-teal-300', bg: 'bg-teal-500/10' },
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
                  <div><h2 className="text-lg font-semibold tracking-tight">Daftar transaksi</h2><p className="mt-1 text-sm text-muted-foreground">Pantau kesepakatan, pembayaran, dan pengiriman dalam satu tempat.</p></div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} transaksi</span>
                </div>
                {rows.length ? <DataTable
            caption="Transaksi"
            rows={rows}
            rowKey={(t) => t.id}
            rowHref={(t) => `/app/transactions/${t.id}`}
            initialSort={{ key: 'updated', dir: 'desc' }}
            columns={[
              { key: 'title', header: 'Transaksi', primary: true, cell: (t) => <span>{t.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{t.code}</span></span> },
              {
                key: 'cp', header: 'Pihak lain',
                cell: (t) => <span className="inline-flex items-center gap-1.5"><EntityAvatar name={t.counterparty.name} kind={t.counterparty.kind} size={18} /> {t.counterparty.name} {t.peer && <Link2 className="size-3 text-muted-foreground" aria-label="Akun platform" />}</span>,
              },
              { key: 'role', header: 'Peran', cell: (t) => <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Pembeli' : 'Supplier'}</Tag> },
              { key: 'terms', header: 'Termin', cell: (t) => <span className="text-muted-foreground">{TERMS[t.terms ?? 'escrow'].label}</span> },
              { key: 'total', header: 'Nilai', align: 'right', cell: (t) => formatIdr(t.totalIdr, { compact: true }), sortValue: (t) => t.totalIdr },
              { key: 'status', header: 'Status', cell: (t) => <StatusBadge entity="transaction" status={t.status} /> },
              { key: 'updated', header: 'Diperbarui', cell: (t) => <span className="text-muted-foreground">{formatRelative(t.updatedAt)}</span>, sortValue: (t) => t.updatedAt },
            ]}
          /> : (
            <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7">
              <EmptyState icon={role ? ReceiptText : BadgeCheck} tone="purple" title={role ? `Belum ada transaksi sebagai ${role === 'buyer' ? 'pembeli' : 'supplier'}` : 'Belum ada transaksi'} description="Transaksi muncul saat kamu menang auction, menetapkan pemenang, atau menerima penawaran RFQ. Setelah terbentuk, status dan langkah berikutnya bisa dipantau di sini." />
            </div>
          )}
              </section>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}

const PAYMENT_LABEL = { unpaid: 'Belum dibayar', escrow: 'Di escrow', released: 'Dibayarkan ke supplier', refunded: 'Dikembalikan ke pembeli' }

export function TransactionDetailPage() {
  const { id = '' } = useParams()
  const query = useTransaction(id)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(t) => {
        const terms = t.terms ?? 'escrow'
        return (
          <>
            <PageHeader
              title={t.title}
              description={
                <span className="flex flex-wrap items-center gap-1.5">
                  {t.code} <StatusBadge entity="transaction" status={t.status} />
                  <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Kamu pembeli' : 'Kamu supplier'}</Tag>
                  <Tag>{TERMS[terms].label}</Tag>
                  {t.group && <Tag tone="purple">{t.group.label}</Tag>}
                </span>
              }
              icon={ReceiptText}
              tone="purple"
              featured
            />
            <TradeSections
              t={t}
              actions={
                <section className="h-full min-w-0 rounded-2xl border border-primary/15 bg-linear-to-br from-card via-card to-primary/[0.045] p-4 shadow-sm shadow-foreground/[0.025] xl:col-span-3 sm:p-5">
                  <div className="mb-4 border-b border-border/70 pb-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Langkah berikutnya</p><h2 className="mt-1 font-semibold tracking-tight">Aksi kamu</h2></div>
                  <ActionPanel t={t} scope={personalTradeScope}>
                    {t.status === 'completed' && (
                      <>
                        <Button variant="outline" className="h-11 w-full justify-center" render={<Link to={`/app/rfq/new?from=${t.id}`} />}><RotateCcw /> Pesan lagi</Button>
                        <Button variant="ghost" className="h-11 w-full justify-center" render={<Link to={`/app/contracts?from=${t.id}`} />}><Repeat /> Jadikan kontrak rutin</Button>
                      </>
                    )}
                  </ActionPanel>
                </section>
              }
              counterparty={
                <section className="h-full min-w-0 rounded-2xl border bg-card p-4 text-sm shadow-sm shadow-foreground/[0.025] xl:col-span-3 sm:p-5">
                  <h2 className="border-b border-border/70 pb-3 font-semibold tracking-tight">Pihak lain</h2>
                  <p className="mt-3 flex min-w-0 items-center gap-2"><EntityAvatar name={t.counterparty.name} kind={t.counterparty.kind} verified={t.counterparty.verified} size={32} /> <span className="min-w-0 break-words font-medium">{t.counterparty.name}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.peer ? 'Akun platform: melihat dan bertindak di transaksi yang sama.' : 'Pihak di luar platform; langkahnya disimulasikan.'}</p>
                  <dl className="mt-4 grid gap-2 border-t border-border/70 pt-3">
                    <div className="flex items-start gap-2 rounded-lg bg-muted/25 p-2.5"><Wallet className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0"><dt className="text-[11px] font-medium text-muted-foreground">Pembayaran</dt><dd className="mt-0.5 break-words font-medium text-foreground">{PAYMENT_LABEL[t.payment.status]}</dd></div></div>
                    <div className="flex items-start gap-2 rounded-lg bg-muted/25 p-2.5"><Truck className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0"><dt className="text-[11px] font-medium text-muted-foreground">Alamat pengiriman</dt><dd className="mt-0.5 break-words font-medium text-foreground">{t.delivery.address}</dd></div></div>
                  </dl>
                </section>
              }
            />
          </>
        )
      }}
    </AsyncView>
  )
}
