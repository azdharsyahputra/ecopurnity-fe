import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, EyeOff, Gavel, Lock, Package, Timer, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AuctionDetail } from '@/domain/types'
import { AUCTION_TYPES } from '@/domain/catalog'
import { formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { useAuthGate, useMe } from '@/features/auth/hooks'
import { useAuction } from './hooks'
import { auctionPriceLabel } from './utils'
import { RulesList } from './components'
import { ParticipantBidBox } from '@/features/me/auctions'
import { AsyncView } from '@/components/States'
import { StatTile } from '@/components/StatTile'
import { StatusBadge, Tag } from '@/components/Tag'
import { Countdown } from '@/components/Countdown'
import { IconChip } from '@/components/IconChip'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

const time = (iso: string) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
const isLive = (a: AuctionDetail) => a.status === 'live' || a.status === 'extended'
const pricesHidden = (a: AuctionDetail) => a.visibility !== 'full'

/** Visitors see a disabled box; logged-in users see what they need before bidding (PRD §6.5). */
function BidBox({ a }: { a: AuctionDetail }) {
  const { data: me } = useMe()
  const gate = useAuthGate()
  const unit = a.lot.quantity.unit
  const dir = a.type === 'forward' ? 1 : -1
  const suggested = (a.currentPriceIdr ?? a.openingPriceIdr) + dir * a.minStepIdr

  if (me) return <ParticipantBidBox a={a} />

  if (!isLive(a)) {
    return (
      <div className="text-sm text-muted-foreground">
        {a.status === 'scheduled' || a.status === 'qualification'
          ? <>Auction dimulai <b className="text-foreground">{formatDateTime(a.startsAt)}</b>. Kualifikasi dibuka sebelum mulai.</>
          : 'Auction sudah ditutup. Hasil penetapan tercatat di audit trail market.'}
      </div>
    )
  }

  if (a.type === 'dutch') {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Terima harga saat ini sebelum orang lain. Harga turun {formatIdr(a.minStepIdr)} tiap 10 detik.</p>
        <Button className="mt-4 h-10 w-full" onClick={() => gate('menerima harga di auction ini', () => undefined)}>
          Terima {formatIdr(a.currentPriceIdr ?? a.openingPriceIdr)}/{unit}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Harga per {unit}
        <Input disabled value={a.type === 'sealed' ? '' : formatIdr(suggested)} placeholder="Rp" className="h-10" readOnly />
      </label>
      {a.type !== 'sealed' && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {a.type === 'reverse' ? 'Maksimal' : 'Minimal'} {formatIdr(suggested)} ({a.type === 'reverse' ? 'turun' : 'naik'} {formatIdr(a.minStepIdr)} dari harga terbaik)
        </p>
      )}
      <Button className="mt-4 h-10 w-full" onClick={() => gate('ikut bid di auction ini', () => undefined)}>
        <Lock /> Masuk untuk bid
      </Button>
    </div>
  )
}

function Content({ a }: { a: AuctionDetail }) {
  const [sheet, setSheet] = useState(false)
  const unit = a.lot.quantity.unit
  const live = isLive(a)
  const chartRows = [...a.bids].reverse().map((b) => ({ at: b.at, price: b.priceIdr }))
  const showChart = !pricesHidden(a) && chartRows.length > 1
  const PriceIcon = a.type === 'forward' ? TrendingUp : TrendingDown

  return (
    <>
      <header className="flex flex-col gap-4 rounded-2xl border bg-linear-to-br from-card to-muted/60 p-5 shadow-sm shadow-foreground/[0.025] sm:p-7 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{a.code}</span>
            <StatusBadge entity="auction" status={a.status} />
            <Tag>{AUCTION_TYPES[a.type].label} auction</Tag>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{a.title}</h1>
          <Link to={`/markets/${a.marketId}`} className="mt-1 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline">
            {a.marketName}
          </Link>
        </div>
        <div className="rounded-xl border bg-background/80 px-4 py-3 shadow-sm md:text-right">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground md:justify-end">
            <Timer className="size-3.5" />
            {live ? (a.status === 'extended' ? 'Diperpanjang · sisa waktu' : 'Sisa waktu') : a.status === 'scheduled' || a.status === 'qualification' ? 'Mulai dalam' : 'Status'}
          </p>
          <p className="text-3xl font-semibold tracking-tight">
            {live ? <Countdown to={a.endsAt} /> : a.status === 'scheduled' || a.status === 'qualification' ? <Countdown to={a.startsAt} /> : 'Selesai'}
          </p>
          <p className="text-xs text-muted-foreground">Tutup {formatDateTime(a.endsAt)}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr_19rem]">
        {/* Lot + rules */}
        <aside className="order-3 flex flex-col gap-6 lg:order-1">
          <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-foreground/[0.025]">
            <div className="flex items-center gap-2">
              <IconChip icon={Package} tone="blue" size="sm" />
              <h2 className="font-medium">Lot</h2>
            </div>
            <p className="mt-3 font-medium">{a.lot.item}</p>
            <p className="num text-sm">{formatQty(a.lot.quantity)}</p>
            <p className="mt-2 text-sm text-muted-foreground">{a.lot.spec}</p>
          </section>
          <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-foreground/[0.025]">
            <h2 className="font-medium">Aturan</h2>
            <div className="mt-2"><RulesList rules={a.rules} /></div>
          </section>
        </aside>

        {/* Market state */}
        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label={a.type === 'dutch' ? 'Harga saat ini' : AUCTION_TYPES[a.type].best}
              icon={PriceIcon}
              tone="lime"
              value={auctionPriceLabel(a)}
              hint={pricesHidden(a) ? undefined : `per ${unit} · buka ${formatIdr(a.openingPriceIdr)}`}
              className="col-span-2 sm:col-span-1"
            />
            <StatTile label="Jumlah bid" icon={Gavel} tone="orange" value={formatNumber(a.bidCount)} />
            <StatTile label="Peserta" icon={Users} tone="purple" value={formatNumber(a.participants)} />
          </div>

          {showChart && (
            <ChartCard
              title="Pergerakan harga bid"
              subtitle={`Rp per ${unit}, ${chartRows.length} bid terakhir`}
              height={220}
              table={{ columns: ['Waktu', 'Harga'], rows: a.bids.map((b) => [time(b.at), formatIdr(b.priceIdr)]) }}
            >
              <ResponsiveContainer>
                <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="at" tickFormatter={time} {...axis} minTickGap={32} />
                  <YAxis width={56} domain={['auto', 'auto']} tickFormatter={(v) => formatNumber(v, { compact: true })} {...axis} />
                  <Tooltip
                    cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                    content={(p) => <ChartTooltip {...p} formatLabel={(l) => time(String(l))} formatValue={(v) => formatIdr(v)} />}
                  />
                  <Line type="stepAfter" dataKey="price" name="Harga bid" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-foreground/[0.025]">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Aktivitas bid</h2>
              {live && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-lime px-1.5 py-0.5 text-xs font-semibold text-lime-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-current" /> LIVE
                </span>
              )}
            </div>
            {pricesHidden(a) ? (
              <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
                <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {a.visibility === 'sealed'
                    ? 'Sealed bid: harga dan identitas dibuka saat auction ditutup.'
                    : 'Peserta hanya melihat peringkat mereka; harga tidak dipublikasikan.'}{' '}
                  Sejauh ini <b className="text-foreground">{formatNumber(a.bidCount)} bid</b> dari {a.participants} peserta.
                </p>
              </div>
            ) : a.bids.length ? (
              <ol className="mt-2 divide-y" aria-live="polite" aria-relevant="additions">
                {a.bids.slice(0, 10).map((b, i) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm animate-in fade-in slide-in-from-top-1">
                    <span className="flex-1 truncate">{b.mine ? <Tag tone="blue">Kamu</Tag> : b.bidder}</span>
                    {i === 0 && <Tag tone="green">Terbaik</Tag>}
                    <span className="num font-medium">{formatIdr(b.priceIdr)}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">{formatRelative(b.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {a.type === 'dutch' ? 'Belum ada yang menerima harga. Harga terus turun sampai ada yang menerima.' : 'Belum ada bid.'}
              </p>
            )}
          </section>
        </div>

        {/* Bid box: side column on desktop, bottom sheet on mobile. */}
        <aside className="order-2 hidden lg:order-3 lg:block">
          <section className="sticky top-20 rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-medium">{a.type === 'dutch' ? 'Terima harga' : 'Ajukan bid'}</h2>
            <BidBox a={a} />
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button className="h-11 w-full" onClick={() => setSheet(true)}>
          {live ? (a.type === 'dutch' ? 'Terima harga' : 'Ajukan bid') : 'Info auction'}
        </Button>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl p-5">
          <SheetTitle>{a.type === 'dutch' ? 'Terima harga' : 'Ajukan bid'}</SheetTitle>
          <BidBox a={a} />
        </SheetContent>
      </Sheet>
    </>
  )
}

export function AuctionRoomPage() {
  const { id = '' } = useParams()
  const query = useAuction(id)
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-28 md:px-6 lg:pb-16">
      <Link to="/auctions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Auctions
      </Link>
      <div className="mt-4">
        <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(a) => <Content a={a} />}
        </AsyncView>
      </div>
    </div>
  )
}
