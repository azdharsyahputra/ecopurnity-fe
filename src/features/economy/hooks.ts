import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useChannel } from '@/lib/realtime'
import type {
  AggregateRow, Auction, AuctionDetail, AuctionEvent, ExplorerOverview, ExplorerRange, Market, MarketDetail, Opportunity,
  OpportunityDetail, Page, PublicListing, SearchHit,
} from '@/domain/types'
import type { PriceSuggestion } from '@/domain/pricing'

// Public economy reads (PRD §6). Filters live in the URL, so every list is shareable.

export interface ListFilters {
  q?: string
  category?: string
  region?: string
  status?: string
  page?: number
  pageSize?: number
}

const qs = (params: object) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]),
  ).toString()
  return s ? `?${s}` : ''
}

export function useOpportunities(f: ListFilters = {}) {
  return useQuery({
    queryKey: ['opportunities', 'list', f],
    queryFn: () => api<Page<Opportunity>>(`/opportunities${qs(f)}`),
    placeholderData: keepPreviousData,
  })
}

export function useOpportunity(id: string) {
  return useQuery({ queryKey: ['opportunities', 'detail', id], queryFn: () => api<OpportunityDetail>(`/opportunities/${id}`) })
}

export function useMarkets(f: ListFilters = {}) {
  return useQuery({
    queryKey: ['markets', 'list', f],
    queryFn: () => api<Page<Market>>(`/markets${qs(f)}`),
    placeholderData: keepPreviousData,
  })
}

export function useMarket(id: string) {
  return useQuery({ queryKey: ['markets', 'detail', id], queryFn: () => api<MarketDetail>(`/markets/${id}`) })
}

export function useAuctions(f: ListFilters = {}) {
  return useQuery({
    queryKey: ['auctions', 'list', f],
    queryFn: () => api<Page<Auction>>(`/auctions${qs(f)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
}

/** Auction room state, patched live from `auction:{id}` (PRD §12.2). */
export function useAuction(id: string) {
  const qc = useQueryClient()
  const key = ['auctions', 'detail', id]
  useChannel<AuctionEvent>(`auction:${id}`, ({ payload: e }) =>
    qc.setQueryData<AuctionDetail>(key, (a) => {
      if (!a) return a
      switch (e.kind) {
        case 'bid':
          return {
            ...a,
            bidCount: e.bidCount,
            participants: e.participants,
            currentPriceIdr: e.currentPriceIdr ?? a.currentPriceIdr,
            bids: a.visibility === 'full' ? [e.bid, ...a.bids].slice(0, 30) : a.bids,
          }
        case 'extended':
          return { ...a, endsAt: e.endsAt, status: 'extended' }
        case 'price':
          return { ...a, currentPriceIdr: e.currentPriceIdr }
        case 'closed':
          return { ...a, status: e.status }
      }
    }),
  )
  return useQuery({ queryKey: key, queryFn: () => api<AuctionDetail>(`/auctions/${id}`) })
}

export function useExplorerOverview(range: ExplorerRange, category?: string) {
  return useQuery({
    queryKey: ['explorer', 'overview', range, category],
    queryFn: () => api<ExplorerOverview>(`/explorer/overview${qs({ range, category })}`),
    placeholderData: keepPreviousData,
  })
}

export function useAggregates(side: 'demand' | 'supply', category?: string) {
  return useQuery({
    queryKey: ['explorer', side, category],
    queryFn: () => api<AggregateRow[]>(`/explorer/${side}${qs({ category })}`),
    placeholderData: keepPreviousData,
  })
}

export function useSearch(q: string, opts: { type?: string; limit?: number } = {}) {
  const term = q.trim()
  return useQuery({
    queryKey: ['search', term, opts],
    queryFn: () => api<SearchHit[]>(`/search${qs({ q: term, ...opts })}`),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  })
}

/** Public catalog; the list's status filter selects supply or demand. */
export function useListings({ status, ...f }: ListFilters = {}) {
  return useQuery({
    queryKey: ['listings', 'public', f, status],
    queryFn: () => api<Page<PublicListing>>(`/listings${qs({ ...f, kind: status })}`),
    placeholderData: keepPreviousData,
  })
}

export function usePriceSuggestion(category: string, unit: string, item: string, exclude?: string) {
  return useQuery({
    queryKey: ['listings', 'price', category, unit, item, exclude],
    queryFn: () => api<(PriceSuggestion & { unit: string; markets: { id: string; name: string }[] }) | null>(`/listings/price-suggestion${qs({ category, unit, item, exclude })}`),
    enabled: !!category && !!unit.trim(),
    staleTime: 60_000,
  })
}
