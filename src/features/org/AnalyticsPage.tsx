import { useSearchParams } from 'react-router-dom'
import { ChartColumn, Download, Gavel, PiggyBank, TrendingDown, Wallet } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { OrgAnalytics } from '@/domain/org'
import { CATEGORIES } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent, formatQty } from '@/domain/format'
import { useAnalytics } from './hooks'
import { CATEGORY_SERIES, downloadCsv, monthLabel, selectClass } from './utils'
import { Section } from './ui'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Segmented } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const compactIdr = (v: number) => formatIdr(v, { compact: true })
const cursorLine = { stroke: 'var(--muted-foreground)', strokeWidth: 1 }
const dot = { r: 4, strokeWidth: 2, stroke: 'var(--card)' }
const VIA = { auction: 'Auction', collective: 'Collective', direct: 'Langsung' }

function exportCsv(d: OrgAnalytics) {
  downloadCsv('procurement-history.csv', [
    ['Kode', 'Bulan', 'Item', 'Kategori', 'Supplier', 'Kuantitas', 'Satuan', 'Harga satuan', 'Total', 'Jalur'],
    ...d.history.map((h) => [h.code, h.month, h.item, CATEGORIES[h.categoryId].label, h.supplier, h.quantity.value, h.quantity.unit, h.unitPriceIdr, h.totalIdr, VIA[h.via]]),
  ])
}

function Charts({ d, refetching }: { d: OrgAnalytics; refetching: boolean }) {
  const sum = (f: (x: OrgAnalytics['savings'][number]) => number) => d.savings.reduce((s, x) => s + f(x), 0)
  const spend = sum((x) => x.spendIdr)
  const vsBudget = sum((x) => x.budgetIdr) - spend
  const vsMarket = sum((x) => x.marketIdr) - spend
  const drops = d.auctions.map((a) => 1 - a.clearingIdr / a.openingIdr)
  const avgDrop = drops.length ? drops.reduce((s, x) => s + x, 0) / drops.length : 0
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total spend" icon={Wallet} tone="purple" value={compactIdr(spend)} />
        <StatTile label="Hemat vs budget" icon={PiggyBank} tone="green" value={compactIdr(vsBudget)} hint={spend ? `${formatPercent(vsBudget / (spend + vsBudget), 1)} dari budget` : undefined} />
        <StatTile label="Hemat vs harga pasar" icon={TrendingDown} tone="teal" value={compactIdr(vsMarket)} hint={spend ? `${formatPercent(vsMarket / (spend + vsMarket), 1)} di bawah pasar` : undefined} />
        <StatTile label="Rata-rata turun di auction" icon={Gavel} tone="orange" value={formatPercent(avgDrop, 1)} hint="harga pembuka → clearing" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title="Spend per kategori"
          subtitle="Rupiah per bulan"
          refetching={refetching}
          legend={d.categories.map((c) => ({ label: CATEGORIES[c].label, color: CATEGORY_SERIES[c], shape: 'rect' }))}
          table={{ columns: ['Bulan', ...d.categories.map((c) => CATEGORIES[c].label)], rows: d.spend.map((r) => [monthLabel(r.month), ...d.categories.map((c) => formatIdr(r[c] ?? 0))]) }}
        >
          <ResponsiveContainer>
            <BarChart data={d.spend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid {...grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis width={56} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
              <Tooltip cursor={{ fill: 'var(--hover)' }} content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} formatValue={compactIdr} />} />
              {d.categories.map((c, i) => <Bar key={c} dataKey={c} name={CATEGORIES[c].label} stackId="spend" fill={CATEGORY_SERIES[c]} maxBarSize={28} radius={i === d.categories.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Penghematan"
          subtitle="Dibayar vs budget vs harga pasar, Rupiah per bulan"
          refetching={refetching}
          legend={[{ label: 'Dibayar', color: SERIES[0] }, { label: 'Budget', color: SERIES[1] }, { label: 'Harga pasar', color: SERIES[2] }]}
          table={{ columns: ['Bulan', 'Dibayar', 'Budget', 'Pasar'], rows: d.savings.map((s) => [monthLabel(s.month), formatIdr(s.spendIdr), formatIdr(s.budgetIdr), formatIdr(s.marketIdr)]) }}
        >
          <ResponsiveContainer>
            <LineChart data={d.savings} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis width={56} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
              <Tooltip cursor={cursorLine} content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} formatValue={compactIdr} />} />
              <Line dataKey="spendIdr" name="Dibayar" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="budgetIdr" name="Budget" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="marketIdr" name="Harga pasar" stroke={SERIES[2]} strokeWidth={2} dot={false} activeDot={dot} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Tren harga: ${d.priceTrend.item || '—'}`}
          subtitle="Indeks harga satuan, bulan pertama = 100"
          refetching={refetching}
          legend={[{ label: 'Harga kita', color: SERIES[0] }, { label: 'Harga pasar', color: SERIES[2] }]}
          table={{ columns: ['Bulan', 'Kita', 'Pasar'], rows: d.priceTrend.points.map((p) => [monthLabel(p.month), formatNumber(p.ours), formatNumber(p.market)]) }}
        >
          <ResponsiveContainer>
            <LineChart data={d.priceTrend.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis width={40} domain={['auto', 'auto']} {...axis} />
              <Tooltip cursor={cursorLine} content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} formatValue={(v) => formatNumber(v)} />} />
              <Line dataKey="ours" name="Harga kita" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={dot} />
              <Line dataKey="market" name="Harga pasar" stroke={SERIES[2]} strokeWidth={2} dot={false} activeDot={dot} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Tren demand: ${d.demand.item || '—'}`}
          subtitle={`Kuantitas dibeli per bulan (${d.demand.unit})`}
          refetching={refetching}
          table={{ columns: ['Bulan', `Kuantitas (${d.demand.unit})`, 'Jumlah pembelian'], rows: d.demand.points.map((p) => [monthLabel(p.month), formatNumber(p.quantity), p.requests]) }}
        >
          <ResponsiveContainer>
            <AreaChart data={d.demand.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis width={48} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
              <Tooltip cursor={cursorLine} content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} formatValue={(v) => `${formatNumber(v)} ${d.demand.unit}`} />} />
              <Area dataKey="quantity" name="Kuantitas" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} activeDot={dot} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Performa supplier"
          subtitle="Skor scorecard 0–100"
          refetching={refetching}
          height={Math.max(160, d.suppliers.length * 36)}
          table={{ columns: ['Supplier', 'Skor', 'Tepat waktu', 'Spend'], rows: d.suppliers.map((s) => [s.name, s.score, formatPercent(s.onTime), compactIdr(s.spendIdr)]) }}
        >
          <ResponsiveContainer>
            <BarChart data={d.suppliers} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...grid} vertical horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axis} />
              <YAxis type="category" dataKey="name" width={120} tickFormatter={(n: string) => (n.length > 16 ? `${n.slice(0, 15)}…` : n)} {...axis} />
              <Tooltip cursor={{ fill: 'var(--hover)' }} content={(p) => <ChartTooltip {...p} formatValue={(v) => String(v)} />} />
              <Bar dataKey="score" name="Skor" fill={SERIES[0]} maxBarSize={14} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Harga satuan rata-rata">
          <table className="block w-full overflow-x-auto text-sm sm:table">
            <caption className="sr-only">Harga satuan rata-rata vs pasar</caption>
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5 font-medium">Item</th><th className="py-1.5 text-right font-medium">Kita</th><th className="py-1.5 text-right font-medium">Pasar</th><th className="py-1.5 text-right font-medium">Selisih</th></tr></thead>
            <tbody className="num divide-y">
              {d.unitPrices.map((u) => {
                const diff = u.avgIdr / u.marketIdr - 1
                return (
                  <tr key={u.item}>
                    <td className="py-2 font-sans">{u.item} <span className="text-xs text-muted-foreground">/{u.unit}</span></td>
                    <td className="py-2 text-right">{formatIdr(u.avgIdr)}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatIdr(u.marketIdr)}</td>
                    <td className="py-2 text-right" style={{ color: `var(--tag-${diff <= 0 ? 'green' : 'red'}-fg)` }}>{diff <= 0 ? '−' : '+'}{formatPercent(Math.abs(diff), 1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
        <Section title="Performa auction">
          {d.auctions.length ? (
            <table className="block w-full overflow-x-auto text-sm sm:table">
              <caption className="sr-only">Bidder dan penurunan harga per auction</caption>
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5 font-medium">Auction</th><th className="py-1.5 text-right font-medium">Bidder</th><th className="py-1.5 text-right font-medium">Pembuka → clearing</th><th className="py-1.5 text-right font-medium">Turun</th></tr></thead>
              <tbody className="num divide-y">
                {d.auctions.map((a) => (
                  <tr key={a.code}>
                    <td className="py-2 font-sans">{a.title}</td>
                    <td className="py-2 text-right">{a.bidders}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatNumber(a.openingIdr, { compact: true })} → {formatNumber(a.clearingIdr, { compact: true })}</td>
                    <td className="py-2 text-right" style={{ color: 'var(--tag-green-fg)' }}>{formatPercent(1 - a.clearingIdr / a.openingIdr, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-muted-foreground">Belum ada auction di periode ini.</p>}
        </Section>
      </div>

      <section>
        <h2 className="mb-3 font-medium">Riwayat procurement</h2>
        <DataTable
          caption="Riwayat procurement"
          rows={d.history}
          rowKey={(h) => h.code}
          initialSort={{ key: 'month', dir: 'desc' }}
          columns={[
            { key: 'item', header: 'Item', primary: true, cell: (h) => <span>{h.item} <span className="ml-1 text-xs font-normal text-muted-foreground">{h.code}</span></span>, sortValue: (h) => h.item },
            { key: 'month', header: 'Bulan', cell: (h) => monthLabel(h.month), sortValue: (h) => h.month },
            { key: 'cat', header: 'Kategori', cell: (h) => <CategoryTag id={h.categoryId} /> },
            { key: 'supplier', header: 'Supplier', cell: (h) => h.supplier },
            { key: 'qty', header: 'Kuantitas', align: 'right', cell: (h) => formatQty(h.quantity, { compact: true }) },
            { key: 'total', header: 'Total', align: 'right', cell: (h) => compactIdr(h.totalIdr), sortValue: (h) => h.totalIdr },
            { key: 'via', header: 'Jalur', cell: (h) => VIA[h.via] },
          ]}
        />
      </section>
    </div>
  )
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const months = Number(params.get('months') ?? 12)
  const category = params.get('category') ?? ''
  const query = useAnalytics(months, category)
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Spend, penghematan, harga, performa supplier dan auction, serta riwayat procurement."
        icon={ChartColumn}
        tone="blue"
        actions={<Button variant="outline" className="h-9" disabled={!query.data?.history.length} onClick={() => query.data && exportCsv(query.data)}><Download /> Export CSV</Button>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Segmented label="Periode" value={String(months)} options={[['3', '3 bulan'], ['6', '6 bulan'], ['12', '12 bulan']]} onChange={(v) => set('months', v === '12' ? null : v)} />
        <select aria-label="Kategori" className={selectClass} value={category} onChange={(e) => set('category', e.target.value || null)}>
          <option value="">Semua kategori</option>
          {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
      </div>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} isEmpty={(d) => !d.history.length}
        empty={<EmptyState icon={ChartColumn} tone="blue" title="Belum ada data untuk filter ini" description="Analytics terisi dari procurement yang selesai. Coba periode atau kategori lain." />}>
        {(d) => <Charts d={d} refetching={query.isPlaceholderData} />}
      </AsyncView>
    </>
  )
}
