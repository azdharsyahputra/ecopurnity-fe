import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Store, Users, Wallet } from 'lucide-react'
import { usePublicActivity, usePublicStats } from './hooks'
import { formatIdr, formatNumber } from '@/domain/format'
import { StatTile } from '@/components/StatTile'
import { ActivityFeed } from '@/components/ActivityFeed'
import { AsyncView } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import logo from '@/assets/ecopurnity.png'

// ponytail: F0 landing = hero + live stats + feed, enough to exercise the live data path. Full landing is F1 (PRD §6.1).
export function LandingPage() {
  const stats = usePublicStats()
  const activity = usePublicActivity(8)
  const s = stats.data

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6">
      <section className="grid items-center gap-10 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-lime" /> Economic Opportunity Engine
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Find markets that{' '}
            <span className="bg-linear-to-r from-[#0a8fb0] to-brand-to bg-clip-text text-transparent">don't exist yet</span>.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground text-pretty">
            Ecopurnity mempertemukan supply, demand, dan jaringan untuk mendeteksi peluang ekonomi, membentuk market, dan
            menjalankan auction secara real-time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-10 px-4" render={<Link to="/explore" />}>
              Explore live economy <ArrowRight />
            </Button>
            <Button size="lg" variant="outline" className="h-10 px-4" render={<Link to="/register" />}>
              Mulai gratis
            </Button>
          </div>
        </div>
        <img src={logo} alt="" className="mx-auto hidden w-56 drop-shadow-2xl md:block" />
      </section>

      <section aria-labelledby="live-heading" className="pb-16">
        <h2 id="live-heading" className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
          LIVE ECONOMY
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Participant aktif" icon={Users} tone="teal" loading={!s} value={s && formatNumber(s.activeParticipants)} />
          <StatTile label="Market aktif" icon={Store} tone="blue" loading={!s} value={s && formatNumber(s.activeMarkets)} />
          <StatTile label="Opportunity terdeteksi" icon={Activity} tone="lime" loading={!s} value={s && formatNumber(s.opportunitiesDetected)} />
          <StatTile
            label="Volume transaksi"
            icon={Wallet}
            tone="purple"
            loading={!s}
            value={s && formatIdr(s.transactionVolumeIdr, { compact: true })}
          />
        </div>

        <div className="mt-8 rounded-xl border p-4 md:p-6">
          <h3 className="font-medium">Aktivitas ekonomi</h3>
          <AsyncView
            query={activity}
            skeleton={<Skeleton className="mt-4 h-48" />}
            empty={<p className="py-6 text-sm text-muted-foreground">Belum ada aktivitas.</p>}
          >
            {(events) => <ActivityFeed events={events} />}
          </AsyncView>
        </div>
      </section>
    </div>
  )
}
