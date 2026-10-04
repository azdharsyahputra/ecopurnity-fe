import { ArrowLeftRight, ChartColumn, ClipboardList, PackageOpen, ShoppingCart } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MmAnalytics } from '@/domain/mm'
import { formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { useMmAnalytics, useMmOverview, useParam } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Skeleton } from '@/components/ui/skeleton'

// Dataviz rules as in ExplorerPage: one y-axis per chart, SERIES in fixed order, legend for ≥ 2 series,
// table toggle on every chart. Each metric keeps its slot in every chart it appears in.

const C = {
  buyers: SERIES[0], suppliers: SERIES[1],
  opening: SERIES[0], current: SERIES[1], median: SERIES[2], clearing: SERIES[3],
  matched: SERIES[0], utilization: SERIES[1],
  participants: SERIES[0], transactions: SERIES[1], connections: SERIES[2], repeat: SERIES[3],
}

const week = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(iso))
const dot = { r: 4, strokeWidth: 2, stroke: 'var(--card)' }
const pct = (v: number) => formatPercent(v, 1)

export function AnalyticsView({ data, marketId }: { data: MmAnalytics; marketId?: string }) {
  const l = data.liquidity
  const pd = data.priceDiscovery.find((p) => p.marketId === marketId) ?? data.priceDiscovery[0]
  const eff = data.efficiency[data.efficiency.length - 1]
  const rounds = pd?.rounds.map((r) => ({ ...r, label: `R${r.round}` })) ?? []
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="an-liq" className="flex flex-col gap-3">
        <div><h2 id="an-liq" className="text-lg font-semibold tracking-tight">Likuiditas</h2><p className="mt-0.5 text-sm text-muted-foreground">Keseimbangan peserta aktif di market.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Buyers" icon={ShoppingCart} tone="blue" value={formatNumber(l.buyers)} />
          <StatTile label="Suppliers" icon={PackageOpen} tone="teal" value={formatNumber(l.suppliers)} />
          <StatTile label="Order aktif" icon={ClipboardList} tone="purple" value={formatNumber(l.activeOrders)} />
          <StatTile label="Rasio buyer:supplier" icon={ArrowLeftRight} tone="orange" value={`${l.ratio.toFixed(1).replace('.', ',')} : 1`} />
        </div>
        {data.byMarket.length > 1 && (
          <ChartCard
            title="Pembeli vs supplier per market"
            subtitle="Peserta aktif"
            height={Math.max(160, data.byMarket.length * 44)}
            legend={[{ label: 'Buyers', color: C.buyers, shape: 'rect' }, { label: 'Suppliers', color: C.suppliers, shape: 'rect' }]}
            table={{ columns: ['Market', 'Buyers', 'Suppliers'], rows: data.byMarket.map((m) => [m.name, formatNumber(m.buyers), formatNumber(m.suppliers)]) }}
          >
            <ResponsiveContainer>
              <BarChart data={data.byMarket} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="25%">
                <CartesianGrid {...grid} vertical horizontal={false} />
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="name" width={120} tickFormatter={(n: string) => (n.length > 16 ? `${n.slice(0, 15)}…` : n)} {...axis} />
                <Tooltip cursor={{ fill: 'var(--hover)' }} content={(p) => <ChartTooltip {...p} formatValue={(v) => formatNumber(v)} />} />
                <Bar dataKey="buyers" name="Buyers" fill={C.buyers} maxBarSize={12} radius={[0, 4, 4, 0]} />
                <Bar dataKey="suppliers" name="Suppliers" fill={C.suppliers} maxBarSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </section>

      <section aria-labelledby="an-price" className="flex flex-col gap-3">
        <div><h2 id="an-price" className="text-lg font-semibold tracking-tight">Price discovery</h2><p className="mt-0.5 text-sm text-muted-foreground">Pergerakan harga dari pembukaan sampai hasil tiap round.</p></div>
        {pd && rounds.length ? (
          <ChartCard
            title={`Harga per round · ${pd.name}`}
            subtitle={`Rp per ${pd.unit}${!marketId && data.priceDiscovery.length > 1 ? '. Pilih market di filter untuk market lain.' : ''} Current hanya untuk round yang sedang live.`}
            legend={[
              { label: 'Opening', color: C.opening }, { label: 'Current', color: C.current }, { label: 'Median', color: C.median }, { label: 'Clearing', color: C.clearing },
            ]}
            table={{
              columns: ['Round', 'Opening', 'Current', 'Median', 'Clearing'],
              rows: rounds.map((r) => [r.label, formatIdr(r.openingIdr), r.currentIdr ? formatIdr(r.currentIdr) : '—', r.medianIdr ? formatIdr(r.medianIdr) : '—', r.clearingIdr ? formatIdr(r.clearingIdr) : '—']),
            }}
          >
            <ResponsiveContainer>
              <LineChart data={rounds} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis width={56} domain={['auto', 'auto']} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
                <Tooltip
                  cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  content={(p) => <ChartTooltip {...p} formatLabel={(x) => rounds.find((r) => r.label === x)?.title ?? String(x)} formatValue={(v) => formatIdr(v)} />}
                />
                <Line dataKey="openingIdr" name="Opening" stroke={C.opening} strokeWidth={2} dot={false} activeDot={dot} />
                <Line dataKey="currentIdr" name="Current" stroke={C.current} strokeWidth={2} dot={{ r: 3, fill: C.current }} activeDot={dot} />
                <Line dataKey="medianIdr" name="Median" stroke={C.median} strokeWidth={2} dot={false} activeDot={dot} />
                <Line dataKey="clearingIdr" name="Clearing" stroke={C.clearing} strokeWidth={2} dot={false} activeDot={dot} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <EmptyState title="Belum ada round" description="Buka round pertama untuk mulai mencatat price discovery." />
        )}
      </section>

      <section aria-labelledby="an-eff" className="flex flex-col gap-3">
        <div><h2 id="an-eff" className="text-lg font-semibold tracking-tight">Efisiensi</h2><p className="mt-0.5 text-sm text-muted-foreground">Demand yang terpenuhi dan pemanfaatan supply.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Matched demand" tone="green" value={pct(eff.matched)} />
          <StatTile label="Unmatched demand" tone="orange" value={pct(eff.unmatched)} />
          <StatTile label="Supply utilization" tone="teal" value={pct(eff.utilization)} />
        </div>
        <ChartCard
          title="Efisiensi per minggu"
          subtitle="Persen; unmatched = 100% − matched"
          legend={[{ label: 'Matched demand', color: C.matched }, { label: 'Supply utilization', color: C.utilization }]}
          table={{ columns: ['Minggu', 'Matched', 'Unmatched', 'Utilization'], rows: data.efficiency.map((e) => [week(e.week), pct(e.matched), pct(e.unmatched), pct(e.utilization)]) }}
        >
          <ResponsiveContainer>
            <LineChart data={data.efficiency} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="week" tickFormatter={week} {...axis} minTickGap={24} />
              <YAxis width={44} domain={[0, 1]} tickFormatter={(v) => formatPercent(v)} {...axis} />
              <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }} content={(p) => <ChartTooltip {...p} formatLabel={(x) => `Minggu ${week(String(x))}`} formatValue={pct} />} />
              <Line dataKey="matched" name="Matched demand" stroke={C.matched} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="utilization" name="Supply utilization" stroke={C.utilization} strokeWidth={2} dot={false} activeDot={dot} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section aria-labelledby="an-net" className="flex flex-col gap-3">
        <div><h2 id="an-net" className="text-lg font-semibold tracking-tight">Pertumbuhan jaringan</h2><p className="mt-0.5 text-sm text-muted-foreground">Perubahan peserta, transaksi, koneksi, dan repeat.</p></div>
        <ChartCard
          title="Jaringan per minggu"
          subtitle="Jumlah"
          legend={[
            { label: 'Participants', color: C.participants }, { label: 'Transaksi', color: C.transactions },
            { label: 'Koneksi', color: C.connections }, { label: 'Interaksi berulang', color: C.repeat },
          ]}
          table={{
            columns: ['Minggu', 'Participants', 'Transaksi', 'Koneksi', 'Berulang'],
            rows: data.growth.map((g) => [week(g.week), formatNumber(g.participants), formatNumber(g.transactions), formatNumber(g.connections), formatNumber(g.repeat)]),
          }}
        >
          <ResponsiveContainer>
            <LineChart data={data.growth} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="week" tickFormatter={week} {...axis} minTickGap={24} />
              <YAxis width={48} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
              <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }} content={(p) => <ChartTooltip {...p} formatLabel={(x) => `Minggu ${week(String(x))}`} formatValue={(v) => formatNumber(v)} />} />
              <Line dataKey="participants" name="Participants" stroke={C.participants} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="transactions" name="Transaksi" stroke={C.transactions} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="connections" name="Koneksi" stroke={C.connections} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="repeat" name="Interaksi berulang" stroke={C.repeat} strokeWidth={2} dot={false} activeDot={dot} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </div>
  )
}

/** Per-market subset for the market detail tab. */
export function MarketAnalytics({ marketId }: { marketId: string }) {
  const query = useMmAnalytics(marketId)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {(d) => <AnalyticsView data={d} marketId={marketId} />}
    </AsyncView>
  )
}

export function AnalyticsPage() {
  const [market, setMarket] = useParam('market')
  const overview = useMmOverview()
  const query = useMmAnalytics(market || undefined)
  return (
    <>
      <PageHeader title="Market analytics" description="Likuiditas, price discovery, efisiensi, dan pertumbuhan jaringan market yang kamu operasikan." icon={ChartColumn} tone="purple" featured />
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div><h2 className="font-semibold tracking-tight">Ruang lingkup laporan</h2><p className="mt-0.5 text-sm text-muted-foreground">Pilih satu market atau bandingkan seluruh market aktifmu.</p></div>
        <label className="flex w-full flex-col gap-1.5 text-sm font-medium sm:max-w-sm">
          Market
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Semua market saya</option>
            {overview.data?.markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} isEmpty={(d) => !d.byMarket.length} empty={<EmptyState icon={ChartColumn} title="Belum ada market" description="Analytics muncul setelah kamu mengoperasikan market." />}>
        {(d) => <AnalyticsView data={d} marketId={market || undefined} />}
      </AsyncView>
    </>
  )
}
