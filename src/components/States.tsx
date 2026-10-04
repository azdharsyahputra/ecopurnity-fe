import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Tone } from '@/domain/status'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { IconChip } from './IconChip'

/** Never a dead end: always say what to do next (PRD §5 principle 7). */
export function EmptyState({
  icon = Inbox,
  tone = 'gray',
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  tone?: Tone
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center', className)}>
      <IconChip icon={icon} tone={tone} size="lg" />
      <h3 className="mt-4 font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error?: unknown; onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="red"
      title="Gagal memuat data"
      description={error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi sebentar.'}
      action={onRetry && <Button variant="outline" onClick={onRetry}>Coba lagi</Button>}
      className={className}
    />
  )
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center" role="status" aria-label="Memuat">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Renders the three states every data view needs (PRD §14): loading → skeleton, error → retry, empty → next step.
 */
export function AsyncView<T>({
  query,
  skeleton,
  empty,
  emptyFallback = true,
  isEmpty = (d) => Array.isArray(d) && d.length === 0,
  children,
}: {
  query: UseQueryResult<T>
  skeleton: ReactNode
  empty?: ReactNode
  /** Set false when the child deliberately renders its own empty layout. */
  emptyFallback?: boolean
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (isEmpty(query.data)) {
    if (empty !== undefined) return <>{empty}</>
    if (emptyFallback) return <EmptyState title="Belum ada data" description="Data akan tampil di sini setelah tersedia." />
  }
  return <>{children(query.data)}</>
}
