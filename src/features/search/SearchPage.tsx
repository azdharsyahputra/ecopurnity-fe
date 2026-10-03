import { Link, useSearchParams } from 'react-router-dom'
import { Search, SearchX } from 'lucide-react'
import type { SearchHit, SearchType } from '@/domain/types'
import { SEARCH_TYPES } from '@/domain/catalog'
import { cn } from '@/lib/utils'
import { useSearch } from '@/features/economy/hooks'
import { SEARCH_META, SEARCH_ORDER } from './searchMeta'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { IconChip } from '@/components/IconChip'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export function SearchHitRow({ hit }: { hit: SearchHit }) {
  const [icon, tone] = SEARCH_META[hit.type]
  return (
    <Link to={hit.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover">
      <IconChip icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{hit.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
      </span>
    </Link>
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') as SearchType | null) ?? undefined
  const query = useSearch(q, { type })
  const set = (k: string, v?: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <PageHeader title="Pencarian" icon={Search} tone="gray" />
      <label className="relative block">
        <span className="sr-only">Cari</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
          defaultValue={q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Produk, jasa, bisnis, market, opportunity, auction…"
          className="h-11 pl-9 text-base"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipe hasil">
        {[undefined, ...SEARCH_ORDER].map((t) => (
          <button
            key={t ?? 'all'}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => set('type', t)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              type === t ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            {t ? SEARCH_TYPES[t] : 'Semua'}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {q.trim().length < 2 ? (
          <p className="text-sm text-muted-foreground">Ketik minimal 2 huruf untuk mencari.</p>
        ) : (
          <AsyncView
            query={query}
            skeleton={<Skeleton className="h-48 rounded-xl" />}
            empty={<EmptyState icon={SearchX} title={`Tidak ada hasil untuk “${q}”`} description="Coba kata lain atau hapus filter tipe." />}
          >
            {(hits) => (
              <div className="flex flex-col gap-6">
                {SEARCH_ORDER.filter((t) => hits.some((h) => h.type === t)).map((t) => (
                  <section key={t}>
                    <h2 className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{SEARCH_TYPES[t]}</h2>
                    {hits.filter((h) => h.type === t).map((h) => <SearchHitRow key={h.id} hit={h} />)}
                  </section>
                ))}
              </div>
            )}
          </AsyncView>
        )}
      </div>
    </div>
  )
}
