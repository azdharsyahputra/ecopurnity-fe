import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, Boxes, Gauge, MapPin, PackageOpen, ShoppingCart, Sparkles, Users, Wallet } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { OpportunityDetail } from '@/domain/types'
import { CATEGORIES, MECHANISMS, OPPORTUNITY_KINDS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent, formatQty, formatRelative } from '@/domain/format'
import { useAuthGate } from '@/features/auth/hooks'
import { useOpportunity } from './hooks'
import { GapMeter, MarketCard } from './components'
import { AsyncView } from '@/components/States'
import { StatTile } from '@/components/StatTile'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { IconChip } from '@/components/IconChip'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const monthLabel = (m: string) => new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(`${m}-01T00:00:00`))

function Actions({ o, className }: { o: OpportunityDetail; className?: string }) {
  const gate = useAuthGate()
  const navigate = useNavigate()
  // ponytail: logged-in join/follow flows land in F2 (PRD §8.5); route there with the intent.
  return (
    <div className={className}>
      <Button variant="outline" size="lg" className="h-10" onClick={() => gate('mengikuti opportunity ini', () => navigate(`/app/opportunities?follow=${o.id}`))}>
        <Bell /> Follow
      </Button>
      <Button size="lg" className="h-10 flex-1 px-5 sm:flex-none" onClick={() => gate('bergabung ke opportunity ini', () => navigate(`/app/opportunities?join=${o.id}`))}>
        Join opportunity
      </Button>
    </div>
  )
}

function Content({ o }: { o: OpportunityDetail }) {
  const gap = Math.max(0, o.demand.value - o.supply.value)
  const unit = o.demand.unit
  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{o.code}</span>
            <Tag tone={OPPORTUNITY_KINDS[o.kind].tone}>{OPPORTUNITY_KINDS[o.kind].label}</Tag>
            <StatusBadge entity="opportunity" status={o.status} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{o.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {o.region}</span>
            <span>{CATEGORIES[o.categoryId].label}</span>
            <span>Terdeteksi {formatRelative(o.detectedAt)}</span>
          </p>
        </div>
        <Actions o={o} className="hidden gap-2 lg:flex" />
      </header>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Potential demand" icon={ShoppingCart} tone="blue" value={formatQty(o.demand, { compact: true })} hint="per bulan" />
        <StatTile label="Current supply" icon={PackageOpen} tone="teal" value={formatQty(o.supply, { compact: true })} hint="per bulan" />
        <StatTile label="Estimated gap" icon={Boxes} tone="orange" value={formatQty({ value: gap, unit }, { compact: true })} hint={gap ? 'belum terpenuhi' : 'supply mencukupi'} />
        <StatTile label="Participants" icon={Users} tone="purple" value={formatNumber(o.participants)} hint="bisnis dan individu" />
        <StatTile label="Nilai potensi" icon={Wallet} tone="lime" value={formatIdr(o.potentialValueIdr, { compact: true })} hint="per bulan" className="col-span-2 md:col-span-1" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-medium">Demand vs supply</h2>
            <GapMeter demand={o.demand} supply={o.supply} className="mt-3" />
          </section>

          <ChartCard
            title="Pertumbuhan demand dan supply"
            subtitle={`6 bulan terakhir, ${unit} per bulan`}
            legend={[
              { label: 'Demand', color: SERIES[0] },
              { label: 'Supply', color: SERIES[1] },
            ]}
            table={{
              columns: ['Bulan', `Demand (${unit})`, `Supply (${unit})`],
              rows: o.history.map((h) => [monthLabel(h.month), formatNumber(h.demand), formatNumber(h.supply)]),
            }}
          >
            <ResponsiveContainer>
              <LineChart data={o.history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                <YAxis width={48} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
                <Tooltip
                  cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  content={(p) => <ChartTooltip {...p} formatLabel={(l) => monthLabel(String(l))} formatValue={(v) => `${formatNumber(v)} ${unit}`} />}
                />
                <Line dataKey="demand" name="Demand" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
                <Line dataKey="supply" name="Supply" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <h2 className="font-medium">Tentang opportunity ini</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.description}</p>
            <h3 className="mt-5 text-sm font-medium">Kontribusi yang dibutuhkan</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{o.requiredContribution}</p>
          </section>

          <section className="rounded-xl border bg-card p-4 md:p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium">Peserta</h2>
              <span className="text-sm text-muted-foreground">{formatNumber(o.participants)} total</span>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {o.participantsPreview.map((p, i) => (
                <li key={i} className="flex items-center gap-2.5 rounded-lg p-1.5">
                  <EntityAvatar name={p.name} kind={p.kind} verified={p.verified} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <Tag tone={p.role === 'buyer' ? 'blue' : 'teal'}>{p.role === 'buyer' ? 'Pembeli' : 'Supplier'}</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Nama lengkap peserta terlihat setelah kamu masuk.</p>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2">
              <IconChip icon={Sparkles} tone="lime" size="sm" />
              <h2 className="font-medium">Mekanisme yang disarankan</h2>
            </div>
            <p className="mt-3 text-lg font-semibold">{MECHANISMS[o.suggestedMechanism].label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{o.mechanismReason}</p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Gauge className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Confidence</span>
              <span className="num ml-auto font-semibold">{formatPercent(o.confidence)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--tag-lime-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${o.confidence * 100}%`, background: 'var(--tag-lime-fg)' }} />
            </div>
          </section>

          {o.markets.length > 0 && (
            <section>
              <h2 className="mb-3 font-medium">Market terkait</h2>
              <div className="flex flex-col gap-3">
                {o.markets.map((m) => <MarketCard key={m.id} m={m} />)}
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* Mobile: primary action stays in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <Actions o={o} className="flex gap-2" />
      </div>
    </>
  )
}

export function OpportunityDetailPage() {
  const { id = '' } = useParams()
  const query = useOpportunity(id)
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:px-6 lg:pb-16">
      <Link to="/opportunities" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Opportunities
      </Link>
      <div className="mt-4">
        <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(o) => <Content o={o} />}
        </AsyncView>
      </div>
    </div>
  )
}
