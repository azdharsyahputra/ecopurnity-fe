import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ReceiptText, Truck, UsersRound, Wallet } from 'lucide-react'
import type { TransactionStatus } from '@/domain/status'
import { TERMS } from '@/domain/trade'
import { formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { cn } from '@/lib/utils'
import { useOrgAccess, useOrgTradeScope, useOrgTransaction, useOrgTransactions, type OrgTransactionPage } from './hooks'
import { FilterPills, Section } from './ui'
import { ActionPanel, TradeSections } from '@/features/trade/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { AuditLog } from '@/components/AuditLog'
import { EntityAvatar } from '@/components/EntityAvatar'
import { StatusBadge, Tag } from '@/components/Tag'
import { Skeleton } from '@/components/ui/skeleton'

const RUNNING: TransactionStatus[] = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'accepted', 'disputed']
const PAYMENT_LABEL = { unpaid: 'Belum dibayar', escrow: 'Di escrow', released: 'Dilepas ke supplier', refunded: 'Dikembalikan' }
const poOf = (docs: { kind: string; name: string }[]) => docs.find((d) => d.kind === 'order')?.name.replace(/\.pdf$/, '')

export function OrgTransactionsPage() {
  const access = useOrgAccess()
  const query = useOrgTransactions()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filter') ?? '') as '' | 'buyer' | 'supplier' | 'running'
  return (
    <>
      <PageHeader title="Transactions" description="Purchase order, agreement, invoice, pembayaran, pengiriman bertahap, QC, dan dispute untuk seluruh tim." icon={ReceiptText} tone="purple" featured />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} empty={<EmptyState icon={ReceiptText} tone="purple" title="Belum ada transaksi" description="Transaksi dan PO dibuat saat auction di-award, procurement dipenuhi, atau pool collective di-settle." />}>
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
                    { key: 'terms', header: 'Termin', cell: (t) => <span className="text-muted-foreground">{TERMS[t.terms ?? 'escrow'].label}</span> },
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

/** How the pool's winning lot was split over its members; this org's line links back here (PRD F6 settlement agregasi). */
function PoolSplit({ c }: { c: NonNullable<OrgTransactionPage['collective']> }) {
  const access = useOrgAccess()
  return (
    <Section title="Settlement kolektif" actions={<Link to={`${access.base}/collective?pool=${c.poolId}`} className="text-sm text-primary hover:underline">Lihat pool</Link>}>
      <p className="text-sm text-muted-foreground">
        {c.title}: pemenang <b className="text-foreground">{c.winner}</b> di {formatIdr(c.priceIdr)}/{c.unit}, dibagi pro-rata ke peserta pool.
      </p>
      <ul className="mt-3 divide-y rounded-lg border text-sm">
        {c.lines.map((l) => (
          <li key={l.name} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', l.mine && 'bg-primary/5')}>
            <span className="font-medium">{l.mine ? 'Bisnis kamu' : l.name}</span>
            <span className="ml-auto num text-muted-foreground">{formatNumber(l.quantity)} {c.unit} · {Math.round(l.share * 100)}%</span>
            <span className="num w-28 text-right font-medium">{formatIdr(l.amountIdr, { compact: true })}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function OrgTransactionDetailPage() {
  const { tid = '' } = useParams()
  const query = useOrgTransaction(tid)
  const access = useOrgAccess()
  const scope = useOrgTradeScope()
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(t) => (
        <>
            <PageHeader
            title={t.title}
            description={
              <span className="flex flex-wrap items-center gap-1.5">
                {t.code} <StatusBadge entity="transaction" status={t.status} />
                <Tag tone={t.role === 'buyer' ? 'blue' : 'teal'}>{t.role === 'buyer' ? 'Pembelian' : 'Penjualan'}</Tag>
                <Tag>{TERMS[t.terms ?? 'escrow'].label}</Tag>
                {poOf(t.documents) && <Tag>{poOf(t.documents)}</Tag>}
                {t.group && <Tag tone="purple"><UsersRound className="size-3" /> {t.group.label}</Tag>}
              </span>
              }
            featured
            icon={ReceiptText}
            tone="purple"
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <TradeSections t={t} />
              {t.collective && <PoolSplit c={t.collective} />}
              <Section title="Aktivitas">
                <AuditLog entries={t.activity} />
              </Section>
            </div>
            <aside className="flex flex-col gap-4">
              <Section title="Aksi tim"><ActionPanel t={t} scope={scope} deny={access.txDeny} /></Section>
              <Section title="Pihak lain">
                <p className="flex items-center gap-2 text-sm"><EntityAvatar name={t.counterparty.name} kind="business" verified={t.counterparty.verified} size={28} /> {t.counterparty.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Pihak di luar platform; langkahnya disimulasikan.</p>
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
