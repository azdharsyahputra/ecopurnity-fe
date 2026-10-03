import { Link } from 'react-router-dom'
import { auctionPriceLabel, useUrlFilters } from './utils'
import { ChevronLeft, ChevronRight, MapPin, Search, Users } from 'lucide-react'
import type { Auction, CategoryId, LabeledValue, Market, Opportunity, Page, Quantity } from '@/domain/types'
import { AUCTION_TYPES, CATEGORIES, MECHANISMS, OPPORTUNITY_KINDS, REGIONS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent, formatQty } from '@/domain/format'
import { cn } from '@/lib/utils'
import { StatusBadge, Tag } from '@/components/Tag'
import { Countdown } from '@/components/Countdown'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CategoryTag({ id }: { id: CategoryId }) {
  return <Tag tone={CATEGORIES[id].tone}>{CATEGORIES[id].label}</Tag>
}

/** Supply against demand: the bar is demand, the fill is how much supply covers. */
export function GapMeter({ demand, supply, className }: { demand: Quantity; supply: Quantity; className?: string }) {
  const coverage = Math.min(1, supply.value / demand.value)
  const gap = demand.value - supply.value
  return (
    <div className={className}>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--tag-orange-bg)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(coverage * 100)}
        aria-label="Supply menutup demand"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${coverage * 100}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
        <span>Supply {formatPercent(coverage)} dari demand</span>
        <span className="num font-medium text-foreground">
          {gap > 0 ? `Gap ${formatQty({ value: gap, unit: demand.unit }, { compact: true })}` : `Surplus ${formatQty({ value: -gap, unit: demand.unit }, { compact: true })}`}
        </span>
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="num truncate text-sm font-semibold">{value}</dd>
    </div>
  )
}

const cardClass = 'group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 focus-visible:outline-2 focus-visible:outline-ring'

export function OpportunityCard({ o }: { o: Opportunity }) {
  return (
    <Link to={`/opportunities/${o.id}`} className={cardClass}>
      <div className="flex items-center gap-1.5">
        <Tag tone={OPPORTUNITY_KINDS[o.kind].tone}>{OPPORTUNITY_KINDS[o.kind].label}</Tag>
        <StatusBadge entity="opportunity" status={o.status} />
        <span className="ml-auto text-xs text-muted-foreground">{o.code}</span>
      </div>
      <h3 className="mt-3 font-medium leading-snug group-hover:underline">{o.title}</h3>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="size-3" /> {o.region} · {CATEGORIES[o.categoryId].label}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Demand/bln" value={formatQty(o.demand, { compact: true })} />
        <Metric label="Peserta" value={formatNumber(o.participants)} />
        <Metric label="Nilai potensi" value={formatIdr(o.potentialValueIdr, { compact: true })} />
      </dl>
      <GapMeter demand={o.demand} supply={o.supply} className="mt-4" />
    </Link>
  )
}

export function MarketCard({ m }: { m: Market }) {
  return (
    <Link to={`/markets/${m.id}`} className={cardClass}>
      <div className="flex items-center gap-1.5">
        <CategoryTag id={m.categoryId} />
        <StatusBadge entity="market" status={m.status} />
        <span className="ml-auto text-xs text-muted-foreground">{m.code}</span>
      </div>
      <h3 className="mt-3 font-medium leading-snug group-hover:underline">{m.name}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <EntityAvatar name={m.maker.name} kind="business" verified={m.maker.verified} size={16} />
        <span className="truncate">{m.maker.name}</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Volume 30h" value={formatIdr(m.volume30dIdr, { compact: true })} />
        <Metric label="Harga" value={`${formatNumber(m.priceRange.minIdr, { compact: true })}–${formatNumber(m.priceRange.maxIdr, { compact: true })}`} />
        <Metric label="Pembeli · supplier" value={`${m.buyers} · ${m.suppliers}`} />
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        {MECHANISMS[m.mechanism].label}
        {m.activeAuctions > 0 && <> · <span className="font-medium text-foreground">{m.activeAuctions} auction live</span></>}
      </p>
    </Link>
  )
}

export function AuctionCard({ a }: { a: Auction }) {
  const live = a.status === 'live' || a.status === 'extended'
  return (
    <Link to={`/auctions/${a.id}`} className={cardClass}>
      <div className="flex items-center gap-1.5">
        <StatusBadge entity="auction" status={a.status} />
        <Tag>{AUCTION_TYPES[a.type].label}</Tag>
        <span className="ml-auto text-xs text-muted-foreground">{a.code}</span>
      </div>
      <h3 className="mt-3 font-medium leading-snug group-hover:underline">{a.title}</h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">{a.marketName}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Metric label={a.type === 'dutch' ? 'Harga kini' : 'Harga terbaik'} value={auctionPriceLabel(a)} />
        <Metric label="Bid" value={formatNumber(a.bidCount)} />
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{live ? 'Sisa waktu' : a.status === 'scheduled' || a.status === 'qualification' ? 'Mulai' : 'Status'}</dt>
          <dd className="truncate text-sm">
            {live ? <Countdown to={a.endsAt} /> : a.status === 'scheduled' || a.status === 'qualification' ? <Countdown to={a.startsAt} /> : 'Selesai'}
          </dd>
        </div>
      </dl>
      <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="size-3" /> {a.participants} peserta · {formatQty(a.lot.quantity, { compact: true })}
      </p>
    </Link>
  )
}

export function RulesList({ rules }: { rules: LabeledValue[] }) {
  return (
    <dl className="divide-y text-sm">
      {rules.map((r) => (
        <div key={r.label} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const selectClass =
  'h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function FilterBar({
  placeholder,
  statuses,
  showRegion = true,
}: {
  placeholder: string
  statuses?: [value: string, label: string][]
  showRegion?: boolean
}) {
  const { filters, set } = useUrlFilters()
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      <label className="relative sm:w-72">
        <span className="sr-only">Cari</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-8"
          type="search"
        />
      </label>
      <select aria-label="Kategori" className={selectClass} value={filters.category} onChange={(e) => set('category', e.target.value)}>
        <option value="">Semua kategori</option>
        {Object.entries(CATEGORIES).map(([id, c]) => (
          <option key={id} value={id}>{c.label}</option>
        ))}
      </select>
      {showRegion && (
        <select aria-label="Wilayah" className={selectClass} value={filters.region} onChange={(e) => set('region', e.target.value)}>
          <option value="">Semua wilayah</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}
      {statuses && (
        <select aria-label="Status" className={selectClass} value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Semua status</option>
          {statuses.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function Pagination({ meta }: { meta: Page<unknown>['meta'] }) {
  const { set } = useUrlFilters()
  const pages = Math.ceil(meta.total / meta.pageSize)
  if (pages <= 1) return null
  return (
    <nav aria-label="Halaman" className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} dari {meta.total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon-sm" disabled={meta.page <= 1} onClick={() => set('page', String(meta.page - 1))} aria-label="Sebelumnya">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={meta.page >= pages} onClick={() => set('page', String(meta.page + 1))} aria-label="Berikutnya">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

export function CardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>
}
