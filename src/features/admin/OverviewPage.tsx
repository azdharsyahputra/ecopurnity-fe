import { Link } from 'react-router-dom'
import { ArrowRight, Clock, FileCheck2, Gavel, LayoutDashboard, Scale, ShieldAlert, Store, Users } from 'lucide-react'
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {([
                ['Users dilaporkan', d.queues.users, Users, 'blue', 'users'],
                ['Verifikasi bisnis', d.queues.verification, FileCheck2, 'teal', 'verification'],
                ['Market ter-flag', d.queues.markets, Store, 'purple', 'markets'],
                ['Auction dengan temuan', d.queues.auctions, Gavel, 'yellow', 'auctions'],
                ['Dispute terbuka', d.queues.disputes, Scale, 'orange', 'disputes'],
                ['Fraud alert aktif', d.queues.fraud, ShieldAlert, 'red', 'fraud'],
              ] as const).map(([label, n, icon, tone, path]) => (
                <Link key={path} to={`/admin/${path}`} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
                  <StatTile label={label} value={formatNumber(n)} icon={icon} tone={tone} className="h-full hover:bg-hover" />
                </Link>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Fraud alert baru" action={<Link to="/admin/fraud" className="text-sm text-primary hover:underline">Semua</Link>}>
                {d.newAlerts.length ? (
                  <ul className="divide-y">
                    {d.newAlerts.map((a) => (
                      <li key={a.id}>
                        <Link to={`/admin/fraud/${a.id}`} className="flex items-center gap-3 py-3 hover:bg-hover">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{a.code} · {ALERT_TYPE[a.type].label} · {formatRelative(a.detectedAt)}</p>
                            <div className="mt-1.5"><SystemBadge source={a.source} score={a.score} confidence={a.confidence} /></div>
                          </div>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={ShieldAlert} title="Tidak ada alert baru" className="py-8" />
                )}
              </Panel>

              <Panel title="Dispute terbuka" action={<Link to="/admin/disputes" className="text-sm text-primary hover:underline">Semua</Link>}>
                {d.openDisputes.length ? (
                  <ul className="divide-y">
                    {d.openDisputes.map((c) => (
                      <li key={c.id}>
                        <Link to={`/admin/disputes/${c.id}`} className="flex items-center gap-3 py-3 hover:bg-hover">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.title}</p>
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
              <ul className="grid gap-3 sm:grid-cols-2">
                {d.sla.map((s) => (
                  <li key={s.module} className="rounded-lg border p-3">
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
