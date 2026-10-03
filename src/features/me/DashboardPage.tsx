import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Gavel, House, PackageOpen, PiggyBank, ReceiptText, ShoppingCart, Sparkles, TrendingUp, Users } from 'lucide-react'
import { useMe } from '@/features/auth/hooks'
import { formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { useDashboard, useIdentity } from './hooks'
import { auctionPriceLabel } from '@/features/economy/utils'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { Countdown } from '@/components/Countdown'
import { EntityAvatar } from '@/components/EntityAvatar'
import { ActivityFeed } from '@/components/ActivityFeed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date()))
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'
}

export function DashboardPage() {
  const { data: me } = useMe()
  const query = useDashboard()
  const identity = useIdentity()
  const completeness = identity.data?.completeness ?? 1

  return (
    <>
      <PageHeader title={`${greeting()}, ${me!.name.split(' ')[0]}`} description="Ringkasan ekonomimu: supply, demand, opportunity, auction, dan transaksi." icon={House} tone="teal" />

      {completeness < 1 && (
        <Link to="/app/identity" className="mb-6 flex items-center gap-4 rounded-xl border bg-card p-4 hover:bg-hover">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Profilmu {formatPercent(completeness)} lengkap</p>
            <p className="text-sm text-muted-foreground">Profil lengkap = rekomendasi lebih tepat dan peluang lolos kualifikasi auction lebih besar.</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${completeness * 100}%` }} /></div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Opportunity aktif" icon={Sparkles} tone="lime" value={formatNumber(d.stats.activeOpportunities)} />
              <StatTile label="Bid aktif" icon={Gavel} tone="orange" value={formatNumber(d.stats.activeBids)} />
              <StatTile label="Demand terbuka" icon={ShoppingCart} tone="blue" value={formatNumber(d.stats.openDemands)} />
              <StatTile label="Supply ditawarkan" icon={PackageOpen} tone="teal" value={formatNumber(d.stats.currentOffers)} />
              <StatTile label="Transaksi berjalan" icon={ReceiptText} tone="purple" value={formatNumber(d.stats.runningTransactions)} />
              <StatTile label="Pendapatan 30 hari" icon={TrendingUp} tone="green" value={formatIdr(d.stats.earnings30dIdr, { compact: true })} />
              <StatTile label="Penghematan 30 hari" icon={PiggyBank} tone="yellow" value={formatIdr(d.stats.savings30dIdr, { compact: true })} hint="dari procurement kolektif & auction" />
              <StatTile label="Reputasi" icon={BadgeCheck} tone="teal" value={formatNumber(d.stats.reputation)} hint="dari 100" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section className="rounded-xl border bg-card p-4 md:p-5">
                  <h2 className="font-medium">Butuh tindakanmu</h2>
                  {d.actions.length ? (
                    <ul className="mt-3 divide-y">
                      {d.actions.map((a) => (
                        <li key={a.id}>
                          <Link to={a.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-hover">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--tag-${a.tone}-fg)` }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{a.title}</span>
                              <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                            </span>
                            <ArrowRight className="size-4 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Tidak ada yang menunggu. Semua beres.</p>
                  )}
                </section>

                <section>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-medium">Match teratas</h2>
                    <Link to="/app/opportunities" className="text-sm text-primary hover:underline">Semua</Link>
                  </div>
                  {d.topMatches.length ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {d.topMatches.map((o) => (
                        <Link key={o.id} to={`/app/opportunities?join=${o.id}`} className="flex flex-col rounded-xl border bg-card p-4 hover:border-foreground/20">
                          <p className="font-medium leading-snug">{o.title}</p>
                          <div className="mt-2 flex flex-wrap gap-1">{o.reasons.slice(0, 3).map((r) => <Tag key={r.label} tone="lime">{r.label}</Tag>)}</div>
                          <p className="mt-auto pt-3 text-sm"><span className="num font-semibold">{formatIdr(o.personalValueIdr, { compact: true })}</span><span className="text-muted-foreground">/bln · {o.distanceKm} km</span></p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Belum ada match" description="Tambah supply atau demand supaya engine bisa mencocokkan." action={<Button render={<Link to="/app/supply/new" />}>Tambah supply</Button>} />
                  )}
                </section>

                <section className="rounded-xl border bg-card p-4 md:p-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-medium">Auction yang kamu ikuti</h2>
                    <Link to="/app/auctions" className="text-sm text-primary hover:underline">Semua</Link>
                  </div>
                  {d.liveBids.length ? (
                    <ul className="mt-3 divide-y">
                      {d.liveBids.map((b) => (
                        <li key={b.auction.id}>
                          <Link to={`/auctions/${b.auction.id}`} className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 text-sm hover:bg-hover">
                            <span className="min-w-0 flex-1 truncate font-medium">{b.auction.title}</span>
                            <StatusBadge entity="bid" status={b.status} />
                            <span className="num text-muted-foreground">kamu {formatIdr(b.priceIdr)} · terbaik {auctionPriceLabel(b.auction)}</span>
                            <Countdown to={b.auction.endsAt} className="text-xs" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Belum ikut auction yang sedang berjalan. <Link to="/app/auctions" className="text-primary hover:underline">Lihat yang eligible</Link></p>
                  )}
                </section>
              </div>

              <aside className="flex flex-col gap-6">
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="flex items-center gap-2 font-medium"><Users className="size-4 text-muted-foreground" /> Jaringan</h2>
                  <p className="num mt-2 text-2xl font-semibold">{formatNumber(d.connections.count)}</p>
                  <p className="text-sm text-muted-foreground">koneksi dagang</p>
                  <div className="mt-3 flex -space-x-2">
                    {d.connections.sample.map((p) => <EntityAvatar key={p.name} name={p.name} kind={p.kind} size={28} className="rounded-full ring-2 ring-card" />)}
                  </div>
                </section>
                <section className="rounded-xl border bg-card px-4 pt-4">
                  <h2 className="font-medium">Aktivitas jaringan</h2>
                  <ActivityFeed events={d.activity} />
                </section>
              </aside>
            </div>
          </div>
        )}
      </AsyncView>
    </>
  )
}
