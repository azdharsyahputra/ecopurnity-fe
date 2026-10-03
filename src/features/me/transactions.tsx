import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Link2, ReceiptText, Repeat, RotateCcw, Truck, Wallet } from 'lucide-react'
import { TERMS } from '@/domain/trade'
import { formatIdr, formatRelative } from '@/domain/format'
import { personalTradeScope, useTransaction, useTransactions } from './hooks'
import { ActionPanel, TradeSections } from '@/features/trade/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { Segmented } from '@/components/form'
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
        actions={<Segmented label="Peran" value={role} options={[['', 'Semua'], ['buyer', 'Sebagai pembeli'], ['supplier', 'Sebagai supplier']]} onChange={setRole} />}
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
        empty={<EmptyState icon={ReceiptText} tone="purple" title="Belum ada transaksi" description="Transaksi dibuat saat kamu menang auction, menetapkan pemenang, atau menerima penawaran RFQ." />}
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
          />
        )}
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
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <TradeSections t={t} />
              </div>

              <aside className="flex flex-col gap-4">
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="mb-3 font-medium">Aksi kamu</h2>
                  <ActionPanel t={t} scope={personalTradeScope}>
                    {t.status === 'completed' && (
                      <>
                        <Button variant="ghost" className="h-9" render={<Link to={`/app/rfq/new?from=${t.id}`} />}><RotateCcw /> Pesan lagi</Button>
                        <Button variant="ghost" className="h-9" render={<Link to={`/app/contracts?from=${t.id}`} />}><Repeat /> Jadikan kontrak rutin</Button>
                      </>
                    )}
                  </ActionPanel>
                </section>
                <section className="rounded-xl border bg-card p-4 text-sm">
                  <h2 className="font-medium">Pihak lain</h2>
                  <p className="mt-2 flex items-center gap-2"><EntityAvatar name={t.counterparty.name} kind={t.counterparty.kind} verified={t.counterparty.verified} size={28} /> {t.counterparty.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.peer ? 'Akun platform: melihat dan bertindak di transaksi yang sama.' : 'Pihak di luar platform; langkahnya disimulasikan.'}</p>
                  <p className="mt-3 flex items-center gap-2 text-muted-foreground"><Wallet className="size-4" /> {PAYMENT_LABEL[t.payment.status]}</p>
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Truck className="size-4" /> {t.delivery.address}</p>
                </section>
              </aside>
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}
