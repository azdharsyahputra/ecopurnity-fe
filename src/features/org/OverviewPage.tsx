import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, ClipboardList, Gavel, LayoutDashboard, PiggyBank, Plus, ReceiptText, Truck, Wallet } from 'lucide-react'
import { PIPELINE } from '@/domain/org'
import { formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { useOrgAccess, useOverview } from './hooks'
import { GuardedLink, Section } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView } from '@/components/States'
import { AuditLog } from '@/components/AuditLog'
import { Tag } from '@/components/Tag'
import { Skeleton } from '@/components/ui/skeleton'

export function OverviewPage() {
  const access = useOrgAccess()
  const query = useOverview()
  const p = access.settings?.profile
  return (
    <>
      <PageHeader
        title={p?.name ?? 'Overview'}
        description={<>Kamu masuk sebagai <b>{access.roleLabel}</b>. Ringkasan pengadaan, auction, supplier, dan transaksi bisnis.</>}
        icon={LayoutDashboard}
        tone="blue"
        featured
        actions={<GuardedLink to={`${access.base}/procurement/new`} reason={access.deny('procurement', 'create')}><Plus /> Buat procurement</GuardedLink>}
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(d) => {
          const s = d.stats
          const ratio = s.savingsTargetIdr ? s.savingsMonthIdr / s.savingsTargetIdr : 0
          return (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatTile label="Spend bulan ini" icon={Wallet} tone="purple" value={formatIdr(s.spendMonthIdr, { compact: true })} />
                <StatTile label="Penghematan vs target" icon={PiggyBank} tone="green" value={formatIdr(s.savingsMonthIdr, { compact: true })} hint={`${formatPercent(ratio)} dari target ${formatIdr(s.savingsTargetIdr, { compact: true })}`} />
                <StatTile label="Procurement aktif" icon={ClipboardList} tone="blue" value={formatNumber(s.activeProcurement)} />
                <StatTile label="Auction aktif" icon={Gavel} tone="orange" value={formatNumber(s.activeAuctions)} />
                <StatTile label="Supplier aktif" icon={Truck} tone="teal" value={formatNumber(s.activeSuppliers)} hint="terverifikasi oleh tim" />
                <StatTile label="Transaksi berjalan" icon={ReceiptText} tone="purple" value={formatNumber(s.runningTransactions)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
                <div className="flex min-w-0 flex-col gap-6">
                  <Section title="Menunggu approval saya">
                    {d.waiting.length ? (
                      <ul className="divide-y">
                        {d.waiting.map((w) => (
                          <li key={w.id}>
                            <Link to={`${access.base}/${w.href}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
                              <Tag tone={w.kind === 'auction' ? 'orange' : 'blue'}>{w.kind === 'auction' ? 'Auction' : 'Procurement'}</Tag>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{w.title}</span>
                                <span className="block text-xs text-muted-foreground">{w.code} · {formatIdr(w.valueIdr, { compact: true })}</span>
                              </span>
                              <ArrowRight className="size-4 text-muted-foreground" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Tidak ada yang menunggu persetujuan {access.roleLabel}.</p>
                    )}
                  </Section>

                  <Section title="Pipeline procurement" actions={<Link to={`${access.base}/procurement`} className="text-sm text-primary hover:underline">Semua</Link>}>
                    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Tahap procurement">
                      {PIPELINE.map(([stage, label], i) => (
                        <li key={stage} className="relative">
                          <Link to={`${access.base}/procurement?stage=${stage}`} className="flex flex-col rounded-lg border bg-background p-3 hover:bg-hover">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <span className="num text-xl font-semibold">{d.pipeline[stage]}</span>
                          </Link>
                          {i < PIPELINE.length - 1 && <ChevronRight aria-hidden className="absolute top-1/2 -right-2 z-10 hidden size-3.5 -translate-y-1/2 text-muted-foreground sm:block" />}
                        </li>
                      ))}
                    </ol>
                  </Section>
                </div>

                <Section title="Aktivitas tim">
                  <AuditLog entries={d.activity} showEntity />
                </Section>
              </div>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}
