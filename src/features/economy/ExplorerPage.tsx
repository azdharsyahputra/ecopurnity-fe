import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ArrowRight, ChartNoAxesCombined, Store, Users, Wallet } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AggregateRow, CategoryId, ExplorerOverview, ExplorerRange } from '@/domain/types'
import { CATEGORIES } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent, formatQty } from '@/domain/format'
import { cn } from '@/lib/utils'
import { useAggregates, useAuctions, useExplorerOverview, useMarkets, useOpportunities } from './hooks'
import { AuctionCard, CardGrid, CategoryTag, MarketCard, OpportunityCard } from './components'
import { usePublicActivity } from '@/features/public/hooks'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView } from '@/components/States'
import { ActivityFeed } from '@/components/ActivityFeed'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const RANGES: [ExplorerRange, string][] = [['7d', '7 hari'], ['30d', '30 hari'], ['90d', '90 hari']]
const TABS = ['overview', 'opportunities', 'markets', 'auctions', 'demand', 'supply'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  overview: 'Overview', opportunities: 'Opportunities', markets: 'Markets', auctions: 'Auctions', demand: 'Demand', supply: 'Supply',
}

/** Color follows the category, never its rank (dataviz). Categories past slot 4 only ever appear alone. */
const CATEGORY_SERIES: Record<CategoryId, string> = {
  agri: SERIES[0], food: SERIES[1], packaging: SERIES[2], logistics: SERIES[3], energy: SERIES[4], it: SERIES[4], manufacturing: SERIES[4],
}

const day = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(iso))

function useExplorerParams() {
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  return {
    range: (params.get('range') as ExplorerRange) || '30d',
    category: params.get('category') ?? '',
    tab: (params.get('tab') as (typeof TABS)[number]) || 'overview',
    set,
  }
}

function Overview({ data, refetching }: { data: ExplorerOverview; refetching: boolean }) {
  const activity = usePublicActivity(8)
  const cats = Object.keys(data.priceIndex[0] ?? {}).filter((k) => k !== 'date') as CategoryId[]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        className="lg:col-span-2"
        title="Volume transaksi harian"
        subtitle="Rupiah per hari"
        refetching={refetching}
        table={{ columns: ['Tanggal', 'Volume'], rows: data.volume.map((v) => [day(v.date), formatIdr(v.volumeIdr)]) }}
      >
        <ResponsiveContainer>
          <AreaChart data={data.volume} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="date" tickFormatter={day} {...axis} minTickGap={28} />
            <YAxis width={56} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
              content={(p) => <ChartTooltip {...p} formatLabel={(l) => day(String(l))} formatValue={(v) => formatIdr(v, { compact: true })} />}
            />
            <Area dataKey="volumeIdr" name="Volume" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Indeks harga per kategori"
        subtitle="Awal periode = 100"
        refetching={refetching}
        legend={cats.map((c) => ({ label: CATEGORIES[c].label, color: CATEGORY_SERIES[c] }))}
        table={{
          columns: ['Tanggal', ...cats.map((c) => CATEGORIES[c].label)],
          rows: data.priceIndex.map((p) => [day(p.date), ...cats.map((c) => formatNumber(p[c] ?? 0))]),
        }}
      >
        <ResponsiveContainer>
          <LineChart data={data.priceIndex} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="date" tickFormatter={day} {...axis} minTickGap={28} />
            <YAxis width={40} domain={['auto', 'auto']} {...axis} />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
              content={(p) => <ChartTooltip {...p} formatLabel={(l) => day(String(l))} formatValue={(v) => formatNumber(v)} />}
            />
            {cats.map((c) => (
              <Line key={c} dataKey={c} name={CATEGORIES[c].label} stroke={CATEGORY_SERIES[c]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Demand vs supply per kategori"
        subtitle="Nilai per bulan, Rupiah"
        refetching={refetching}
        legend={[
          { label: 'Demand', color: SERIES[0], shape: 'rect' },
          { label: 'Supply', color: SERIES[1], shape: 'rect' },
        ]}
        table={{
          columns: ['Kategori', 'Demand', 'Supply'],
          rows: data.demandSupply.map((d) => [CATEGORIES[d.categoryId].label, formatIdr(d.demandIdr), formatIdr(d.supplyIdr)]),
        }}
      >
        <ResponsiveContainer>
          <BarChart data={data.demandSupply} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid {...grid} vertical horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
            <YAxis type="category" dataKey="categoryId" width={84} tickFormatter={(c: CategoryId) => CATEGORIES[c].label} {...axis} />
            <Tooltip
              cursor={{ fill: 'var(--hover)' }}
              content={(p) => <ChartTooltip {...p} formatLabel={(l) => CATEGORIES[l as CategoryId].label} formatValue={(v) => formatIdr(v, { compact: true })} />}
            />
            <Bar dataKey="demandIdr" name="Demand" fill={SERIES[0]} maxBarSize={12} radius={[0, 4, 4, 0]} />
            <Bar dataKey="supplyIdr" name="Supply" fill={SERIES[1]} maxBarSize={12} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="rounded-xl border bg-card px-4 pt-4 md:px-5 lg:col-span-2">
        <h2 className="font-medium">Timeline aktivitas ekonomi</h2>
        <AsyncView query={activity} skeleton={<Skeleton className="my-4 h-40" />}>
          {(events) => <ActivityFeed events={events} />}
        </AsyncView>
      </section>
    </div>
  )
}

function AggregateTable({ side, category }: { side: 'demand' | 'supply'; category: string }) {
  const query = useAggregates(side, category || undefined)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />}>
      {(rows: AggregateRow[]) => (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{side === 'demand' ? 'Demand publik' : 'Supply publik'} teragregasi</caption>
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 font-medium">Wilayah</th>
                <th className="px-4 py-2.5 text-right font-medium">Kuantitas/bln</th>
                <th className="px-4 py-2.5 text-right font-medium">{side === 'demand' ? 'Pembeli' : 'Supplier'}</th>
                <th className="px-4 py-2.5 text-right font-medium">Tren 30 hari</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.item} className="hover:bg-hover">
                  <td className="px-4 py-2.5 font-medium">{r.item}</td>
                  <td className="px-4 py-2.5"><CategoryTag id={r.categoryId} /></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.region}</td>
                  <td className="num px-4 py-2.5 text-right">{formatQty(r.quantity, { compact: true })}</td>
                  <td className="num px-4 py-2.5 text-right">{formatNumber(r.listings)}</td>
                  <td className="num px-4 py-2.5 text-right" style={{ color: `var(--tag-${r.trend >= 0 ? 'green' : 'red'}-fg)` }}>
                    {r.trend >= 0 ? '+' : '−'}{formatPercent(Math.abs(r.trend), 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AsyncView>
  )
}

const previewSkeleton = <CardGrid>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</CardGrid>
const noData = <p className="text-sm text-muted-foreground">Belum ada data untuk filter ini.</p>

function Preview({ tab, category }: { tab: 'opportunities' | 'markets' | 'auctions'; category: string }) {
  const f = { category: category || undefined, pageSize: 6 }
  const more = `/${tab}${category ? `?category=${category}` : ''}`
  return (
    <>
      {tab === 'opportunities' && <OpportunityPreview f={f} />}
      {tab === 'markets' && <MarketPreview f={f} />}
      {tab === 'auctions' && <AuctionPreview f={f} />}
      <Button variant="outline" className="mt-4" render={<Link to={more} />}>
        Lihat semua {TAB_LABEL[tab].toLowerCase()} <ArrowRight />
      </Button>
    </>
  )
}

type F = { category?: string; pageSize: number }
const OpportunityPreview = ({ f }: { f: F }) => (
  <AsyncView query={useOpportunities(f)} skeleton={previewSkeleton} isEmpty={(p) => !p.data.length} empty={noData}>
    {(p) => <CardGrid>{p.data.map((o) => <OpportunityCard key={o.id} o={o} />)}</CardGrid>}
  </AsyncView>
)
const MarketPreview = ({ f }: { f: F }) => (
  <AsyncView query={useMarkets(f)} skeleton={previewSkeleton} isEmpty={(p) => !p.data.length} empty={noData}>
    {(p) => <CardGrid>{p.data.map((m) => <MarketCard key={m.id} m={m} />)}</CardGrid>}
  </AsyncView>
)
const AuctionPreview = ({ f }: { f: F }) => (
  <AsyncView query={useAuctions(f)} skeleton={previewSkeleton} isEmpty={(p) => !p.data.length} empty={noData}>
    {(p) => <CardGrid>{p.data.map((a) => <AuctionCard key={a.id} a={a} />)}</CardGrid>}
  </AsyncView>
)

const segClass = (on: boolean) =>
  cn('rounded-md px-2.5 py-1 text-sm transition-colors', on ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')

export function ExplorerPage() {
  const { range, category, tab, set } = useExplorerParams()
  const overview = useExplorerOverview(range, category || undefined)
  const s = overview.data?.stats
  const d = overview.data?.deltas

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <PageHeader
        title="Economic Explorer"
        description="Lihat ekonomi yang sedang bergerak: opportunity, market, auction, demand, dan supply publik."
        icon={ChartNoAxesCombined}
        tone="teal"
      />

      {/* One filter row scopes everything below it (dataviz). */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Rentang waktu" className="inline-flex rounded-lg bg-muted p-0.5">
          {RANGES.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={range === v} className={segClass(range === v)} onClick={() => set('range', v === '30d' ? '' : v)}>
              {l}
            </button>
          ))}
        </div>
        <select
          aria-label="Kategori"
          value={category}
          onChange={(e) => set('category', e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Semua kategori</option>
          {Object.entries(CATEGORIES).map(([id, c]) => (
            <option key={id} value={id}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Participant aktif" icon={Users} tone="teal" loading={!s} value={s && formatNumber(s.activeParticipants)} delta={d?.participants} />
        <StatTile label="Market aktif" icon={Store} tone="blue" loading={!s} value={s && formatNumber(s.activeMarkets)} delta={d?.markets} />
        <StatTile label="Opportunity terdeteksi" icon={Activity} tone="lime" loading={!s} value={s && formatNumber(s.opportunitiesDetected)} delta={d?.opportunities} />
        <StatTile label="Volume transaksi" icon={Wallet} tone="purple" loading={!s} value={s && formatIdr(s.transactionVolumeIdr, { compact: true })} delta={d?.volume} />
      </div>

      <Tabs value={tab} onValueChange={(v) => set('tab', v === 'overview' ? '' : String(v))} className="mt-8">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="px-3">{TAB_LABEL[t]}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="mt-4">
          <h2 className="sr-only">{TAB_LABEL[tab]}</h2>
          {tab === 'overview' && (
            <AsyncView query={overview} skeleton={<Skeleton className="h-80 rounded-xl" />}>
              {(data) => <Overview data={data} refetching={overview.isPlaceholderData} />}
            </AsyncView>
          )}
          {(tab === 'opportunities' || tab === 'markets' || tab === 'auctions') && <Preview tab={tab} category={category} />}
          {(tab === 'demand' || tab === 'supply') && <AggregateTable side={tab} category={category} />}
        </div>
      </Tabs>
    </div>
  )
}
