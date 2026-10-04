import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass, Gavel, Percent, Plus, Store, Users, Wallet } from 'lucide-react'
import type { ActivityEvent, AuctionEvent } from '@/domain/types'
import type { MmOverview } from '@/domain/mm'
import { MECHANISMS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { subscribe, useChannel } from '@/lib/realtime'
import { useMe } from '@/features/auth/hooks'
import { useMmOverview } from './hooks'
import { AlertTags } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { StatusBadge } from '@/components/Tag'
import { ActivityFeed } from '@/components/ActivityFeed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'


function EventFeed({ initial, liveAuctions }: { initial: ActivityEvent[]; liveAuctions: MmOverview['liveAuctions'] }) {
  const { data: me } = useMe()
  const [live, setLive] = useState<ActivityEvent[]>([])
  const push = (e: ActivityEvent) => setLive((l) => [e, ...l].slice(0, 20))
  useChannel<ActivityEvent>(me ? `user:${me.id}` : undefined, ({ type, payload }) => type === 'mm.activity' && push(payload))

  const key = JSON.stringify(liveAuctions)
  useEffect(() => {
    const push = (e: ActivityEvent) => setLive((l) => [e, ...l].slice(0, 20))
    const offs = (JSON.parse(key) as MmOverview['liveAuctions']).map(({ id, title }) =>
      subscribe<AuctionEvent>(`auction:${id}`, ({ payload, ts }) => {
        if (payload.kind === 'bid') push({ id: payload.bid.id, type: 'bid_placed', title: `${payload.bid.bidder} bid di ${title}`, at: ts })
        if (payload.kind === 'closed') push({ id: `${id}-closed`, type: 'auction_closed', title: `Round ditutup: ${title}`, at: ts })
      }),
    )
    return () => offs.forEach((off) => off())
  }, [key])
  const seen = new Set<string>()
  const events = [...live, ...initial].filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, 12)
  return events.length ? <ActivityFeed events={events} /> : <p className="py-6 text-sm text-muted-foreground">Belum ada event. Buka round untuk mulai melihat bid masuk.</p>
}

export function OperationsPage() {
  const query = useMmOverview()
  const s = query.data?.stats
  return (
    <>
      <PageHeader
        title="Market Operations"
        description="Market yang kamu operasikan, kesehatannya, dan apa yang perlu ditangani sekarang."
        icon={Compass}
        tone="purple"
        featured
        actions={<Button className="h-9" render={<Link to="/mm/markets/new" />}><Plus /> Buat market</Button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Active markets" icon={Store} tone="purple" loading={!s} value={s && formatNumber(s.activeMarkets)} />
        <StatTile label="Participants" icon={Users} tone="teal" loading={!s} value={s && formatNumber(s.participants)} />
        <StatTile label="Active auctions" icon={Gavel} tone="lime" loading={!s} value={s && formatNumber(s.activeAuctions)} />
        <StatTile label="Volume 30 hari" icon={Wallet} tone="blue" loading={!s} value={s && formatIdr(s.volumeIdr, { compact: true })} />
        <StatTile label="Matched demand" icon={Percent} tone="green" loading={!s} value={s && formatPercent(s.matchedDemand)} className="col-span-2 lg:col-span-1" />
      </div>

      <AsyncView query={query} skeleton={<Skeleton className="mt-6 h-72 rounded-xl" />}>
        {(d) => (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div><h2 className="font-semibold tracking-tight">Market yang saya operasikan</h2><p className="mt-0.5 text-sm text-muted-foreground">Kesehatan round, likuiditas, dan hal yang perlu ditindaklanjuti.</p></div>
                <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{d.markets.length} market</span>
              </div>
              {d.markets.length ? (
                <DataTable
                  caption="Market yang saya operasikan"
                  rows={d.markets}
                  rowKey={(m) => m.id}
                  rowHref={(m) => `/mm/markets/${m.id}`}
                  initialSort={{ key: 'alerts', dir: 'desc' }}
                  columns={[
                    { key: 'name', header: 'Market', primary: true, cell: (m) => m.name, sortValue: (m) => m.name },
                    { key: 'status', header: 'Status', cell: (m) => <StatusBadge entity="market" status={m.status} /> },
                    { key: 'liq', header: 'Pembeli · supplier', align: 'right', cell: (m) => `${formatNumber(m.buyers)} · ${formatNumber(m.suppliers)}`, sortValue: (m) => m.buyers + m.suppliers },
                    { key: 'rounds', header: 'Round live', align: 'right', cell: (m) => m.liveRounds, sortValue: (m) => m.liveRounds },
                    { key: 'mech', header: 'Mekanisme', cell: (m) => <span className="text-muted-foreground">{MECHANISMS[m.mechanism].label}</span> },
                    { key: 'alerts', header: 'Perlu perhatian', cell: (m) => <AlertTags alerts={m.alerts} />, sortValue: (m) => m.alerts.length },
                  ]}
                />
              ) : (
                <EmptyState icon={Store} tone="purple" title="Belum ada market" description="Ubah opportunity jadi market yang berjalan." action={<Button render={<Link to="/mm/opportunities" />}>Buka opportunity pipeline</Button>} />
              )}
            </section>
            <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5" aria-labelledby="mm-feed">
              <div className="border-b pb-3"><h2 id="mm-feed" className="font-semibold tracking-tight">Event market</h2><p className="mt-0.5 text-sm text-muted-foreground">Update live dari round dan operasimu.</p></div>
              <EventFeed initial={d.events} liveAuctions={d.liveAuctions} />
            </section>
          </div>
        )}
      </AsyncView>
    </>
  )
}
