import { useSearchParams } from 'react-router-dom'
import type { Auction } from '@/domain/types'
import { formatIdr } from '@/domain/format'

export function auctionPriceLabel(a: Auction) {
  if (a.type === 'sealed' || a.visibility === 'sealed') return 'Tertutup'
  if (a.currentPriceIdr === undefined) return a.visibility === 'rank_only' ? 'Disembunyikan' : formatIdr(a.openingPriceIdr)
  return formatIdr(a.currentPriceIdr)
}




export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) ?? ''
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        if (v) p.set(k, v)
        else p.delete(k)
        if (k !== 'page') p.delete('page')
        return p
      },
      { replace: true },
    )
  const filters = { q: get('q'), category: get('category'), region: get('region'), status: get('status'), page: Number(get('page') || 1) }
  return { filters, set }
}

