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

/** Server events plus whatever arrives live: this maker's own operations and bids on their live rounds. */
function EventFeed({ initial, liveAuctions }: { initial: ActivityEvent[]; liveAuctions: MmOverview['liveAuctions'] }) {
  const { data: me } = useMe()
  const [live, setLive] = useState<ActivityEvent[]>([])
  const push = (e: ActivityEvent) => setLive((l) => [e, ...l].slice(0, 20))
  useChannel<ActivityEvent>(`mm:${me?.id ?? 'none'}:events`, ({ payload }) => push(payload))
  // Resubscribe only when the set of live rounds changes, not on every refetch.
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
        actions={<Button className="h-9" render={<Link to="/mm/markets/new" />}><Plus /> Buat market</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Active markets" icon={Store} tone="purple" loading={!s} value={s && formatNumber(s.activeMarkets)} />
        <StatTile label="Participants" icon={Users} tone="teal" loading={!s} value={s && formatNumber(s.participants)} />
        <StatTile label="Active auctions" icon={Gavel} tone="lime" loading={!s} value={s && formatNumber(s.activeAuctions)} />
        <StatTile label="Volume 30 hari" icon={Wallet} tone="blue" loading={!s} value={s && formatIdr(s.volumeIdr, { compact: true })} />
        <StatTile label="Matched demand" icon={Percent} tone="green" loading={!s} value={s && formatPercent(s.matchedDemand)} className="col-span-2 lg:col-span-1" />
      </div>

      <AsyncView query={query} skeleton={<Skeleton className="mt-6 h-72 rounded-xl" />}>
        {(d) => (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_20rem]">
            <section className="min-w-0">
              <h2 className="mb-3 font-medium">Market saya</h2>
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
            <section className="rounded-xl border bg-card px-4 pt-4 md:px-5" aria-labelledby="mm-feed">
              <h2 id="mm-feed" className="font-medium">Event market</h2>
              <p className="text-xs text-muted-foreground">Live dari round dan operasi kamu</p>
              <EventFeed initial={d.events} liveAuctions={d.liveAuctions} />
            </section>
          </div>
        )}
      </AsyncView>
    </>
  )
}
