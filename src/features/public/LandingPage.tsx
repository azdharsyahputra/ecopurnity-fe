import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, Building2, Compass, Gavel, GitMerge, Network, PackageOpen, PieChart, Radar, ShoppingCart, Sparkles,
  Store, UserRound, Users, Wallet,
} from 'lucide-react'
import { usePublicActivity, usePublicStats } from './hooks'
import { useAuctions, useMarkets, useOpportunities } from '@/features/economy/hooks'
import { AuctionCard, GapMeter, MarketCard, OpportunityCard } from '@/features/economy/components'
import { formatIdr, formatNumber } from '@/domain/format'
import type { Tone } from '@/domain/status'
import { cn } from '@/lib/utils'
import { StatTile } from '@/components/StatTile'
import { ActivityFeed } from '@/components/ActivityFeed'
import { AsyncView, EmptyState } from '@/components/States'
import { IconChip } from '@/components/IconChip'
import { Tag } from '@/components/Tag'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function Section({ id, eyebrow, title, intro, children, className }: {
  id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id ?? eyebrow}-title`} className={cn('py-16 md:py-20', className)}>
      <p className="text-sm font-medium tracking-wide text-primary">{eyebrow}</p>
      <h2 id={`${id ?? eyebrow}-title`} className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 max-w-2xl text-muted-foreground text-pretty">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  )
}

function Hero() {
  const activity = usePublicActivity(4)
  return (
    <section className="relative isolate mt-6 grid items-center gap-10 overflow-hidden rounded-[2rem] border bg-linear-to-br from-muted/70 via-background to-primary/5 px-6 py-9 shadow-sm shadow-foreground/[0.025] sm:px-8 md:mt-8 md:grid-cols-[1.1fr_0.9fr] md:px-12 md:py-14">
      <div className="pointer-events-none absolute -right-20 -top-24 -z-10 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          <span className="size-1.5 rounded-full bg-lime" /> Economic Opportunity Engine
        </span>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.06] tracking-tight text-balance sm:text-5xl lg:text-6xl">
          Find markets that{' '}
          <span className="bg-linear-to-r from-primary to-brand-to bg-clip-text text-transparent">don't exist yet</span>.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-muted-foreground text-pretty">
          Ecopurnity membaca supply, demand, dan jaringan untuk menemukan peluang ekonomi, lalu membentuk market dan menjalankan auction
          secara real-time.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="h-11 px-5" render={<Link to="/explore" />}>
            Explore live economy <ArrowRight />
          </Button>
          <Button size="lg" variant="outline" className="h-11 px-5" render={<Link to="/register" />}>
            Mulai gratis
          </Button>
        </div>
      </div>

      <div className="relative rounded-2xl border bg-card/90 p-4 shadow-xl shadow-primary/5 ring-1 ring-foreground/[0.025] md:p-5">
        <div className="mb-3 flex items-center justify-between border-b pb-3">
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Jaringan Ecopurnity</p><p className="mt-0.5 text-sm font-semibold">Terjadi sekarang</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-lime px-1.5 py-0.5 text-xs font-semibold text-lime-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-current" /> LIVE
          </span>
        </div>
        <AsyncView query={activity} skeleton={<Skeleton className="mt-3 h-56" />}>
          {(events) => <ActivityFeed events={events} />}
        </AsyncView>
      </div>
    </section>
  )
}

function LiveStats() {
  const { data: s } = usePublicStats()
  return (
    <section aria-label="Statistik jaringan live" className="relative z-10 -mt-2 grid grid-cols-2 gap-3 rounded-2xl border bg-card p-3 shadow-lg shadow-foreground/[0.035] sm:p-4 lg:grid-cols-4">
      <StatTile label="Participant aktif" icon={Users} tone="teal" loading={!s} value={s && formatNumber(s.activeParticipants)} />
      <StatTile label="Market aktif" icon={Store} tone="blue" loading={!s} value={s && formatNumber(s.activeMarkets)} />
      <StatTile label="Opportunity terdeteksi" icon={Activity} tone="lime" loading={!s} value={s && formatNumber(s.opportunitiesDetected)} />
      <StatTile label="Volume transaksi" icon={Wallet} tone="purple" loading={!s} value={s && formatIdr(s.transactionVolumeIdr, { compact: true })} />
    </section>
  )
}

const CONCEPT: [typeof Network, Tone, string, string][] = [
  [Network, 'blue', 'Supply + demand + jaringan', 'Kapasitas, aset, kebutuhan, dan lokasi setiap peserta membentuk satu economic graph.'],
  [Sparkles, 'lime', 'Opportunity', 'Engine menemukan celah: demand yang belum terlayani, supply yang menganggur, pembeli yang bisa bergabung.'],
  [Store, 'teal', 'Market', 'Opportunity yang matang dijadikan market dengan mekanisme dan aturan yang paling cocok.'],
]

function Concept() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {CONCEPT.map(([icon, tone, title, body], i) => (
        <div key={title} className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
          <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/5 transition-transform group-hover:scale-125" />
          <IconChip icon={icon} tone={tone} size="lg" />
          <h3 className="mt-4 font-medium">{title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          {i < 2 && (
            <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 rounded-full border bg-background p-1 text-muted-foreground md:block" aria-hidden />
          )}
        </div>
      ))}
    </div>
  )
}

const STEPS: [string, string][] = [
  ['Daftarkan kapasitas', 'Isi skill, aset, supply, atau kebutuhanmu. Cukup beberapa menit.'],
  ['Sistem mendeteksi opportunity', 'Engine mencocokkan kamu dengan demand, supply, dan peserta lain di sekitarmu.'],
  ['Market terbentuk, auction berjalan', 'Ikut market, ajukan bid, atau gabungkan demand untuk harga skala.'],
  ['Transaksi & reputasi', 'Transaksi tercatat lengkap; reputasimu tumbuh dari kinerja nyata.'],
]

function HowItWorks() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map(([title, body], i) => (
        <li key={title} className="relative rounded-2xl border bg-card p-5 transition-colors hover:border-primary/35">
          <span className="num grid size-9 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">0{i + 1}</span>
          <h3 className="mt-4 font-medium">{title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        </li>
      ))}
    </ol>
  )
}

const ENGINES = [
  { id: 'opportunity', label: 'Opportunity Engine', icon: Radar, tone: 'lime' as Tone },
  { id: 'formation', label: 'Market Formation', icon: GitMerge, tone: 'teal' as Tone },
  { id: 'auction', label: 'Auction', icon: Gavel, tone: 'orange' as Tone },
  { id: 'allocation', label: 'Smart Allocation', icon: PieChart, tone: 'purple' as Tone },
]

function EngineDemo({ id }: { id: string }) {
  if (id === 'opportunity')
    return (
      <div>
        <p className="text-sm text-muted-foreground">137 UMKM di Bandung Raya butuh standing pouch; supply lokal baru menutup sebagian.</p>
        <GapMeter demand={{ value: 840_000, unit: 'unit' }} supply={{ value: 520_000, unit: 'unit' }} className="mt-5" />
        <div className="mt-5 flex flex-wrap gap-1.5">
          {['Supply', 'Demand', 'Jaringan', 'Lokasi', 'Histori'].map((t) => <Tag key={t}>{t}</Tag>)}
          <ArrowRight className="size-4 self-center text-muted-foreground" />
          <Tag tone="lime">Opportunity · confidence 87%</Tag>
        </div>
      </div>
    )
  if (id === 'formation')
    return (
      <ul className="flex flex-col gap-3 text-sm">
        {[
          ['Banyak pembeli + sedikit supplier', 'Collective procurement → reverse auction'],
          ['Satu penjual + banyak pembeli', 'Forward auction'],
          ['Paket kompleks banyak komponen', 'Combinatorial allocation'],
        ].map(([cond, mech]) => (
          <li key={cond} className="flex flex-col gap-1 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex-1">{cond}</span>
            <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
            <Tag tone="teal">{mech}</Tag>
          </li>
        ))}
      </ul>
    )
  if (id === 'auction')
    return (
      <div>
        <p className="text-sm text-muted-foreground">Reverse auction 100.000 box karton: harga turun, supplier terbaik naik ke atas.</p>
        <ol className="mt-4 divide-y text-sm">
          {[['Supplier 4', 2_050, true], ['Supplier 7', 2_075, false], ['Supplier 2', 2_100, false]].map(([who, price, best]) => (
            <li key={String(who)} className="flex items-center gap-3 py-2.5">
              <span className="flex-1">{who}</span>
              {best && <Tag tone="green">Terbaik</Tag>}
              <span className="num font-medium">{formatIdr(Number(price))}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  return (
    <div>
      <p className="text-sm text-muted-foreground">500.000 unit dibagi ke tiga supplier berdasarkan harga, kapasitas, dan reputasi.</p>
      <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full">
        <div className="h-full" style={{ width: '50%', background: 'var(--chart-1)' }} />
        <div className="h-full" style={{ width: '30%', background: 'var(--chart-2)' }} />
        <div className="h-full" style={{ width: '20%', background: 'var(--chart-3)' }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {[['PT Kemas Prima', '50%', 'var(--chart-1)'], ['CV Plastik Jaya', '30%', 'var(--chart-2)'], ['UD Sinar Pack', '20%', 'var(--chart-3)']].map(([n, p, c]) => (
          <li key={n} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: c }} /> {n} <span className="num font-medium text-foreground">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EngineShowcase() {
  const [active, setActive] = useState(ENGINES[0].id)
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div role="tablist" aria-label="Engine" className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col">
        {ENGINES.map((e) => (
          <button
            key={e.id}
            role="tab"
            id={`engine-${e.id}`}
            aria-selected={active === e.id}
            aria-controls="engine-panel"
            onClick={() => setActive(e.id)}
            className={cn(
              'flex shrink-0 items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
              active === e.id ? 'border-foreground/20 bg-card font-medium shadow-sm' : 'border-transparent text-muted-foreground hover:bg-hover',
            )}
          >
            <IconChip icon={e.icon} tone={e.tone} size="sm" />
            {e.label}
          </button>
        ))}
      </div>
      <div id="engine-panel" role="tabpanel" aria-labelledby={`engine-${active}`} className="rounded-2xl border bg-linear-to-br from-card to-muted/50 p-5 shadow-sm md:p-6">
        <EngineDemo id={active} />
      </div>
    </div>
  )
}

function Rail({ children }: { children: ReactNode }) {
  return <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 *:w-[19rem] *:shrink-0 *:snap-start">{children}</div>
}

function Featured() {
  const opp = useOpportunities({ pageSize: 3, status: 'detected,forming,market_live' })
  const markets = useMarkets({ pageSize: 6, status: 'active' })
  const auctions = useAuctions({ pageSize: 6, status: 'live,extended' })
  const skel = <div className="flex gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52 w-[19rem] shrink-0 rounded-xl" />)}</div>
  return (
    <>
      <Section eyebrow="Featured opportunities" title="Peluang terbesar yang sedang terbuka">
        <AsyncView query={opp} skeleton={skel} isEmpty={(p) => !p.data.length} empty={<EmptyState icon={Sparkles} tone="lime" title="Belum ada opportunity terbuka" description="Peluang akan muncul saat engine menemukan kebutuhan dan supply yang bisa dipertemukan." action={<Button variant="outline" render={<Link to="/opportunities" />}>Jelajahi opportunities <ArrowRight /></Button>} />}>
          {(p) => <div className="grid gap-3 md:grid-cols-3">{p.data.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>}
        </AsyncView>
        <Button variant="outline" className="mt-6" render={<Link to="/opportunities" />}>Semua opportunity <ArrowRight /></Button>
      </Section>
      <Section eyebrow="Active auctions" title="Auction yang sedang berjalan" className="pt-0 md:pt-0">
        <AsyncView query={auctions} skeleton={skel} isEmpty={(p) => !p.data.length} empty={<EmptyState icon={Gavel} tone="orange" title="Belum ada auction yang berjalan" description="Auction aktif akan tampil di sini saat market membuka sesi penawaran." action={<Button variant="outline" render={<Link to="/auctions" />}>Lihat semua auction <ArrowRight /></Button>} />}>
          {(p) => <Rail>{p.data.map((a) => <AuctionCard key={a.id} a={a} />)}</Rail>}
        </AsyncView>
      </Section>
      <Section eyebrow="Active markets" title="Market yang aktif" className="pt-0 md:pt-0">
        <AsyncView query={markets} skeleton={skel} isEmpty={(p) => !p.data.length} empty={<EmptyState icon={Store} tone="blue" title="Belum ada market aktif" description="Market baru akan tampil setelah opportunity dibentuk dan mulai beroperasi." action={<Button variant="outline" render={<Link to="/markets" />}>Jelajahi market <ArrowRight /></Button>} />}>
          {(p) => <Rail>{p.data.map((m) => <MarketCard key={m.id} m={m} />)}</Rail>}
        </AsyncView>
      </Section>
    </>
  )
}

const AUDIENCES: [typeof UserRound, Tone, string, string, string, string][] = [
  [UserRound, 'teal', 'Participant', 'Freelancer, petani, pelaku UMKM. Satu akun untuk jual dan beli.', 'Daftarkan kapasitas', '/register'],
  [Building2, 'blue', 'Business', 'Procurement, collective demand, auction, dan manajemen supplier untuk tim.', 'Mulai untuk bisnis', '/register?goal=business'],
  [Compass, 'purple', 'Market Maker', 'Koperasi, asosiasi, aggregator: ubah opportunity jadi market yang berjalan.', 'Ajukan jadi market maker', '/register?goal=market_maker'],
]

function Audiences() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {AUDIENCES.map(([icon, tone, title, body, cta, to]) => (
        <div key={title} className="flex flex-col rounded-2xl border bg-card p-5 transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
          <IconChip icon={icon} tone={tone} size="lg" />
          <h3 className="mt-4 font-medium">{title}</h3>
          <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{body}</p>
          <Button variant="outline" className="mt-5 self-start" render={<Link to={to} />}>{cta} <ArrowRight /></Button>
        </div>
      ))}
    </div>
  )
}

export function LandingPage() {
  const activity = usePublicActivity(8)
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6">
      <Hero />
      <LiveStats />

      <Section id="concept" eyebrow="Apa itu Ecopurnity" title="Dari kapasitas yang tersebar menjadi market yang berjalan" className="py-16 md:py-20">
        <Concept />
      </Section>

      <Section id="how" eyebrow="Cara kerja" title="Empat langkah dari daftar sampai transaksi" className="pt-0 md:pt-0">
        <HowItWorks />
      </Section>

      <Section eyebrow="Di balik layar" title="Empat engine yang menggerakkan ekonomi" intro="Setiap keputusan engine bisa dijelaskan: data apa yang dipakai, kenapa mekanisme itu dipilih, dan bagaimana hasilnya dibagi.">
        <EngineShowcase />
      </Section>

      <Featured />

      <Section eyebrow="Economic activity" title="Aktivitas di seluruh jaringan" className="pt-0 md:pt-0">
        <div className="rounded-xl border bg-card px-4 md:px-5">
          <AsyncView query={activity} skeleton={<Skeleton className="my-4 h-64" />}>
            {(events) => <ActivityFeed events={events} />}
          </AsyncView>
        </div>
      </Section>

      <Section eyebrow="Untuk siapa" title="Satu jaringan, tiga cara ikut serta" className="pt-0 md:pt-0">
        <Audiences />
      </Section>

      <section className="relative mb-16 overflow-hidden rounded-[2rem] border bg-linear-to-br from-[#07566b] to-[#2f6fe0] p-8 text-white shadow-xl shadow-primary/15 dark:from-[#124452] dark:to-[#273d79] md:p-12">
        <div className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -right-2 -top-14 size-64 rounded-full border border-white/10" />
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mulai temukan market-mu</h2>
            <p className="mt-2 max-w-md text-white/80">Gratis untuk participant. Lihat opportunity di sekitarmu dalam kurang dari 3 menit.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="h-11 bg-white px-5 text-slate-950 hover:bg-white/90" render={<Link to="/register" />}>
              <ShoppingCart /> Daftar gratis
            </Button>
            <Button size="lg" variant="outline" className="h-11 border-white/40 bg-transparent px-5 text-white hover:bg-white/10" render={<Link to="/explore" />}>
              <PackageOpen /> Lihat explorer
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
