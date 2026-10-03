import { History } from 'lucide-react'
import type { AuditEntry } from '@/domain/types'
import { formatDateTime } from '@/domain/format'
import { EmptyState } from './States'

/** Who · what · when · before → after (PRD §12.6). One component for every entity's activity tab. */
export function AuditLog({ entries, showEntity = false }: { entries: AuditEntry[]; showEntity?: boolean }) {
  if (!entries.length) return <EmptyState icon={History} title="Belum ada aktivitas tercatat" />
  return (
    <ol className="flex flex-col gap-4 border-l pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background bg-primary" />
          <p>
            <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">·</span> {e.action}
            {showEntity && <span className="text-muted-foreground"> · {e.entity.label}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
          {e.reason && <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">Alasan: {e.reason}</p>}
          {e.changes && e.changes.length > 0 && (
            <dl className="mt-1.5 grid gap-1 text-xs">
              {e.changes.map((c) => (
                <div key={c.field} className="flex flex-wrap items-baseline gap-1.5">
                  <dt className="text-muted-foreground">{c.field}:</dt>
                  {c.before !== undefined && <dd className="rounded px-1 line-through" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>{c.before}</dd>}
                  {c.after !== undefined && <dd className="rounded px-1" style={{ background: 'var(--tag-green-bg)', color: 'var(--tag-green-fg)' }}>{c.after}</dd>}
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  )
}
