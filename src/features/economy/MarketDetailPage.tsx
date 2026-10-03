import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, PackageOpen, ShoppingCart, Tag as TagIcon, Users, Wallet } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MarketDetail } from '@/domain/types'
import { MECHANISMS, OBJECTIVES } from '@/domain/catalog'
import { formatDate, formatIdr, formatNumber, formatQty } from '@/domain/format'
import { useAuthGate } from '@/features/auth/hooks'
import { useMarket } from './hooks'
import { AuctionCard, CardGrid, CategoryTag, GapMeter, RulesList } from './components'
import { AsyncView, EmptyState } from '@/components/States'
import { StatTile } from '@/components/StatTile'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { ActivityFeed } from '@/components/ActivityFeed'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const weekLabel = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(iso))

function Actions({ m, className }: { m: MarketDetail; className?: string }) {
  const gate = useAuthGate()
  const navigate = useNavigate()
  const go = (intent: string) => () => navigate(`/app/markets?${intent}=${m.id}`)
  return (
    <div className={className}>
      <Button variant="outline" className="h-9" onClick={() => gate('mengirim demand ke market ini', go('demand'))}>Submit demand</Button>
      <Button variant="outline" className="h-9" onClick={() => gate('mengirim supply ke market ini', go('supply'))}>Submit supply</Button>
      <Button className="h-9 px-4" onClick={() => gate('bergabung ke market ini', go('join'))}>Join market</Button>
    </div>
  )
}

function Content({ m }: { m: MarketDetail }) {
  const unit = m.priceRange.unit
  const priceRows = m.priceHistory.map((p) => ({ ...p, band: [p.lowIdr, p.highIdr] as [number, number] }))
  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{m.code}</span>
            <CategoryTag id={m.categoryId} />
            <StatusBadge entity="market" status={m.status} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{m.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <EntityAvatar name={m.maker.name} kind="business" verified={m.maker.verified} size={20} />
              {m.maker.name}
            </span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {m.region}</span>
            <Tag>{MECHANISMS[m.mechanism].label}</Tag>
            <Tag>{OBJECTIVES[m.objective]}</Tag>
          </p>
        </div>
        <Actions m={m} className="flex flex-wrap gap-2" />
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Demand" icon={ShoppingCart} tone="blue" value={formatQty(m.demand, { compact: true })} hint="per bulan" />
        <StatTile label="Supply" icon={PackageOpen} tone="teal" value={formatQty(m.supply, { compact: true })} hint="per bulan" />
        <StatTile label="Peserta" icon={Users} tone="purple" value={formatNumber(m.buyers + m.suppliers)} hint={`${m.buyers} pembeli · ${m.suppliers} supplier`} />
        <StatTile label="Rentang harga" icon={TagIcon} tone="orange" value={`${formatNumber(m.priceRange.minIdr, { compact: true })}–${formatNumber(m.priceRange.maxIdr, { compact: true })}`} hint={`Rp per ${unit}, 30 hari`} />
        <StatTile label="Volume 30 hari" icon={Wallet} tone="lime" value={formatIdr(m.volume30dIdr, { compact: true })} className="col-span-2 md:col-span-1" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ChartCard
            title="Harga per minggu"
            subtitle={`Median dengan rentang terendah–tertinggi, Rp per ${unit}`}
            table={{
              columns: ['Minggu', 'Median', 'Terendah', 'Tertinggi'],
              rows: m.priceHistory.map((p) => [weekLabel(p.week), formatIdr(p.medianIdr), formatIdr(p.lowIdr), formatIdr(p.highIdr)]),
            }}
          >
            <ResponsiveContainer>
              <ComposedChart data={priceRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="week" tickFormatter={weekLabel} {...axis} minTickGap={24} />
                <YAxis width={56} domain={['auto', 'auto']} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
                <Tooltip
                  cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  content={(p) => <ChartTooltip {...p} formatLabel={(l) => `Minggu ${weekLabel(String(l))}`} formatValue={(v) => formatIdr(v)} />}
                />
                <Area dataKey="band" name="Rentang" stroke="none" fill={SERIES[0]} fillOpacity={0.12} activeDot={false} />
                <Line dataKey="medianIdr" name="Median" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <section>
            <h2 className="mb-3 font-medium">Auction di market ini</h2>
            {m.auctions.length ? (
              <CardGrid className="lg:grid-cols-2">{m.auctions.map((a) => <AuctionCard key={a.id} a={a} />)}</CardGrid>
            ) : (
              <EmptyState title="Belum ada auction" description="Market maker akan membuka round berikutnya. Join market untuk dapat notifikasi." />
            )}
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-medium">Aturan market</h2>
            <p className="mt-1 text-sm text-muted-foreground">Perubahan aturan hanya berlaku untuk round berikutnya dan tercatat di audit trail.</p>
            <div className="mt-3"><RulesList rules={m.rules} /></div>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-medium">Tentang market</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.description}</p>
            <GapMeter demand={m.demand} supply={m.supply} className="mt-4" />
          </section>
          <section className="rounded-xl border bg-card px-4 pt-4 md:px-5">
            <h2 className="font-medium">Aktivitas terbaru</h2>
            <ActivityFeed events={m.activity} />
          </section>
          <p className="text-xs text-muted-foreground">Data per {formatDate(new Date().toISOString())}.</p>
        </aside>
      </div>
    </>
  )
}

export function MarketDetailPage() {
  const { id = '' } = useParams()
  const query = useMarket(id)
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-6">
      <Link to="/markets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Markets
      </Link>
      <div className="mt-4">
        <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(m) => <Content m={m} />}
        </AsyncView>
      </div>
    </div>
  )
}
