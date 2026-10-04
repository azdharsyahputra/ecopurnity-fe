import { FileQuestion, Gavel, LayoutGrid, MessageSquare, SearchX, Sparkles, Store } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Page } from '@/domain/types'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuctions, useListings, useMarkets, useOpportunities } from './hooks'
import type { PublicListing } from '@/domain/types'
import { useMe } from '@/features/auth/hooks'
import { useStartConversation } from '@/features/rfq/hooks'
import { Button } from '@/components/ui/button'
import { useUrlFilters } from './utils'
import { AuctionCard, CardGrid, FilterBar, ListingCard, MarketCard, OpportunityCard, Pagination } from './components'

function ListShell<T>({
  header,
  filters,
  query,
  render,
}: {
  header: ReactNode
  filters: ReactNode
  query: UseQueryResult<Page<T>>
  render: (item: T) => ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      {header}
      <div className="rounded-2xl border bg-muted/35 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Persempit hasil</span><span className="hidden sm:inline">Filter dapat digabungkan</span>
        </div>
        {filters}
      </div>
      <div className="mt-6">
        <h2 className="sr-only">Hasil</h2>
        <AsyncView
          query={query}
          isEmpty={(p) => p.data.length === 0}
          skeleton={
            <CardGrid>
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
            </CardGrid>
          }
          empty={<EmptyState icon={SearchX} title="Tidak ada yang cocok" description="Coba ubah kata kunci atau hapus beberapa filter." />}
        >
          {(page) => (
            <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              <CardGrid>{page.data.map(render)}</CardGrid>
              <Pagination meta={page.meta} />
            </div>
          )}
        </AsyncView>
      </div>
    </div>
  )
}

export function OpportunitiesPage() {
  const { filters } = useUrlFilters()
  return (
    <ListShell
      header={
        <PageHeader
          title="Opportunities"
          description="Peluang ekonomi yang dideteksi dari supply, demand, jaringan, dan lokasi. Lihat insight-nya gratis, masuk untuk ikut."
          icon={Sparkles}
          tone="lime"
          featured
        />
      }
      filters={
        <FilterBar
          placeholder="Cari opportunity…"
          statuses={[['detected', 'Detected'], ['forming', 'Forming'], ['market_live', 'Market live']]}
        />
      }
      query={useOpportunities(filters)}
      render={(o) => <OpportunityCard key={o.id} o={o} />}
    />
  )
}

export function MarketsPage() {
  const { filters } = useUrlFilters()
  return (
    <ListShell
      header={
        <PageHeader
          title="Markets"
          description="Market aktif yang dioperasikan market maker, lengkap dengan harga, volume, dan aturan mainnya."
          icon={Store}
          tone="blue"
          featured
        />
      }
      filters={
        <FilterBar placeholder="Cari market atau market maker…" statuses={[['active', 'Active'], ['formation', 'Formation'], ['paused', 'Paused']]} />
      }
      query={useMarkets(filters)}
      render={(m) => <MarketCard key={m.id} m={m} />}
    />
  )
}

export function AuctionsPage() {
  const { filters } = useUrlFilters()
  return (
    <ListShell
      header={
        <PageHeader
          title="Auctions"
          description="Auction yang sedang berjalan dan akan dimulai. Pantau harga dan aktivitas bid secara langsung."
          icon={Gavel}
          tone="orange"
          featured
        />
      }
      filters={
        <FilterBar
          placeholder="Cari auction…"
          showRegion={false}
          statuses={[['live,extended', 'Live'], ['qualification', 'Qualification'], ['scheduled', 'Scheduled'], ['closed,awarded', 'Selesai']]}
        />
      }
      query={useAuctions(filters)}
      render={(a) => <AuctionCard key={a.id} a={a} />}
    />
  )
}

function ListingAction({ l }: { l: PublicListing }) {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const start = useStartConversation()
  if (me && l.owner.userId === me.id) return <Button size="sm" variant="ghost" className="w-full" render={<Link to={`/app/${l.kind}/${l.id}`} />}>Listing kamu</Button>
  if (l.kind === 'supply') {
    const q = new URLSearchParams({ listing: l.id, item: l.item, category: l.categoryId, qty: String(l.quantity.value), unit: l.quantity.unit, inviteName: l.owner.name, ...(l.owner.userId && { inviteUserId: l.owner.userId }) })
    return <Button size="sm" variant="outline" className="w-full" render={<Link to={`/app/rfq/new?${q}`} />}><FileQuestion /> Minta penawaran</Button>
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      disabled={start.isPending}
      onClick={() => {
        if (!me) return navigate(`/login?returnTo=${encodeURIComponent('/listings')}`)
        start.mutate(
          { subject: `Penawaran untuk ${l.code} · ${l.item}`, with: { name: l.owner.name, userId: l.owner.userId, kind: 'business', verified: l.owner.verified }, text: `Halo, saya bisa memenuhi ${l.item} (${l.quantity.value.toLocaleString('id-ID')} ${l.quantity.unit}). Boleh diskusi spesifikasi dan harga?` },
          { onSuccess: (c) => navigate(`/app/messages/${c.id}`) },
        )
      }}
    >
      <MessageSquare /> Kirim penawaran
    </Button>
  )
}

export function ListingsPage() {
  const { filters } = useUrlFilters()
  return (
    <ListShell
      header={
        <PageHeader
          title="Katalog"
          description="Supply dan demand yang dibuka pelaku usaha. Minta penawaran ke supplier atau tawarkan barangmu ke pembeli, langsung tanpa market."
          icon={LayoutGrid}
          tone="green"
          featured
        />
      }
      filters={<FilterBar placeholder="Cari barang atau pelaku usaha…" statuses={[['supply', 'Supply'], ['demand', 'Demand']]} statusLabel={['Jenis', 'Semua jenis']} />}
      query={useListings(filters)}
      render={(l) => <ListingCard key={l.id} l={l} action={<ListingAction l={l} />} />}
    />
  )
}
