import type { ActivityEvent } from '@/domain/types'
import { formatIdr, formatRelative } from '@/domain/format'
import { ACTIVITY_META } from './activity'
import { IconChip } from './IconChip'
import { EmptyState } from './States'

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (!events.length) return <EmptyState title="Belum ada aktivitas" description="Aktivitas terbaru akan muncul di sini saat ada kegiatan di jaringan." className="border-0 py-8" />
  return (
    <ol className="divide-y" aria-live="polite" aria-relevant="additions">
      {events.map((e) => {
        const [icon, tone] = ACTIVITY_META[e.type]
        return (
          <li key={e.id} className="flex items-start gap-3 py-3 animate-in fade-in slide-in-from-top-1">
            <IconChip icon={icon} tone={tone} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelative(e.at)}
                {e.amountIdr !== undefined && <> · {formatIdr(e.amountIdr, { compact: true })}</>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
