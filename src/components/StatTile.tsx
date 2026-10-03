import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/domain/status'
import { IconChip } from './IconChip'
import { Skeleton } from './ui/skeleton'

/** Key number with optional delta. Flashes once when `value` changes (live data). */
export function StatTile({
  label,
  value,
  icon,
  tone = 'gray',
  delta,
  hint,
  loading,
  className,
}: {
  label: string
  value: ReactNode
  icon?: LucideIcon
  tone?: Tone
  /** Fractional change, e.g. 0.12 = +12%. */
  delta?: number
  hint?: string
  loading?: boolean
  className?: string
}) {
  // "Previous value in state" pattern: bump a key when value changes so the flash replays.
  // Values seen while loading don't count, so the first real value doesn't flash.
  const [prev, setPrev] = useState<ReactNode>(loading ? undefined : value)
  const [flash, setFlash] = useState(0)
  if (!loading && prev !== value) {
    setPrev(value)
    if (prev !== undefined) setFlash(flash + 1)
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
        <span className="line-clamp-2">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <span key={flash} className={cn('num -mx-1 rounded px-1 text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl', flash > 0 && 'animate-live-flash')}>
            {value}
          </span>
          {delta !== undefined && (
            <span
              className="inline-flex items-center text-xs font-medium"
              style={{ color: `var(--tag-${delta >= 0 ? 'green' : 'red'}-fg)` }}
            >
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta * 100).toFixed(1).replace('.', ',')}%
            </span>
          )}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
