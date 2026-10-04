import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, Clock, FileCheck2, Gavel, LayoutDashboard, Scale, ShieldAlert, Store, Users } from 'lucide-react'
import { formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { cn } from '@/lib/utils'
import { useAdminOverview } from './hooks'
import { ALERT_TYPE } from './labels'
import { Panel, SystemBadge } from './components'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminOverviewPage() {
  const query = useAdminOverview()
  return (
    <>
      <PageHeader
        title="Governance"
        description="Antrean yang menunggu keputusan. Admin memeriksa, membekukan, dan memutuskan; setiap tindakan tercatat di audit trail."
        icon={LayoutDashboard}
        tone="orange"
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <section aria-label="Ringkasan antrean governance" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['Total antrean', Object.values(d.queues).reduce((sum, count) => sum + count, 0), LayoutDashboard, 'orange', ''],
                ['Users dilaporkan', d.queues.users, Users, 'blue', 'users'],
                ['Verifikasi bisnis', d.queues.verification, FileCheck2, 'teal', 'verification'],
                ['Market ter-flag', d.queues.markets, Store, 'purple', 'markets'],
                ['Auction dengan temuan', d.queues.auctions, Gavel, 'yellow', 'auctions'],
                ['Dispute terbuka', d.queues.disputes, Scale, 'orange', 'disputes'],
                ['Fraud alert aktif', d.queues.fraud, ShieldAlert, 'red', 'fraud'],
                ['Pencairan menunggu', d.queues.withdrawals, Banknote, 'green', 'withdrawals'],
              ] as const).map(([label, n, icon, tone, path]) => {
                const tile = <StatTile label={label} value={formatNumber(n)} icon={icon} tone={tone} className="h-full min-h-28 rounded-2xl shadow-sm shadow-foreground/[0.025] transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/25 hover:shadow-md" />
                return path ? (
                  <Link key={path} to={`/admin/${path}`} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">{tile}</Link>
                ) : (
                  <div key="total-queue">{tile}</div>
                )
              })}
            </section>

            <div className="grid items-start gap-5 xl:grid-cols-2">
              <Panel title="Fraud alert terbaru" action={<Link to="/admin/fraud" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">Semua <ArrowRight className="size-3.5" /></Link>}>
                {d.newAlerts.length ? (
                  <ul className="divide-y divide-border/70">
                    {d.newAlerts.map((a) => (
                      <li key={a.id}>
                        <Link to={`/admin/fraud/${a.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/35">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold group-hover:text-primary">{a.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{a.code} · {ALERT_TYPE[a.type].label} · {formatRelative(a.detectedAt)}</p>
                            <div className="mt-1.5"><SystemBadge source={a.source} score={a.score} confidence={a.confidence} /></div>
                          </div>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={ShieldAlert} title="Tidak ada alert baru" className="py-8" />
                )}
              </Panel>

              <Panel title="Dispute terbuka" action={<Link to="/admin/disputes" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10">Semua <ArrowRight className="size-3.5" /></Link>}>
                {d.openDisputes.length ? (
                  <ul className="divide-y divide-border/70">
                    {d.openDisputes.map((c) => (
                      <li key={c.id}>
                        <Link to={`/admin/disputes/${c.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/35">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold group-hover:text-primary">{c.title}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{c.code} · {c.parties.map((p) => p.name).join(' vs ')} · {formatIdr(c.totalIdr, { compact: true })}</p>
                          </div>
                          <StatusBadge entity="dispute" status={c.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Scale} title="Tidak ada dispute terbuka" className="py-8" />
                )}
              </Panel>
            </div>

            <Panel title="SLA review">
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.sla.map((s) => (
                    <li key={s.module} className="rounded-xl border bg-muted/15 p-3.5 transition-colors hover:bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{s.label}</p>
                      <Tag tone={s.breached ? 'red' : 'green'}>{s.breached ? `${s.breached} lewat SLA` : 'Dalam SLA'}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Target {s.slaHours} jam · {s.total} menunggu</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`${s.label} dalam SLA`} aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.total - s.breached}>
                      <div className={cn('h-full rounded-full', s.breached ? 'bg-destructive' : 'bg-primary')} style={{ width: `${s.total ? ((s.total - s.breached) / s.total) * 100 : 100}%` }} />
                    </div>
                    {s.oldestAt && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> Tertua masuk {formatRelative(s.oldestAt)}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </AsyncView>
    </>
  )
}
