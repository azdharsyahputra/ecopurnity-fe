import { Gavel, SearchX, Sparkles, Store } from 'lucide-react'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Page } from '@/domain/types'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuctions, useMarkets, useOpportunities } from './hooks'
import { useUrlFilters } from './utils'
import { AuctionCard, CardGrid, FilterBar, MarketCard, OpportunityCard, Pagination } from './components'

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
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      {header}
      {filters}
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
