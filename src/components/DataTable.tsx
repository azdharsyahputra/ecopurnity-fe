import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from './States'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** Makes the column sortable. */
  sortValue?: (row: T) => number | string
  align?: 'right'
  /** Shown as the card title on small screens (exactly one column should set this). */
  primary?: boolean
  className?: string
}

/**
 * Sortable table on desktop, stacked cards on mobile (PRD §14: no horizontal scroll at 375 px).
 * Rows link to `rowHref` when given; the whole row/card is the hit target.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
  initialSort,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  rowHref?: (row: T) => string
  caption: string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
}) {
  const navigate = useNavigate()
  const [sort, setSort] = useState(initialSort)
  const col = columns.find((c) => c.key === sort?.key)
  const sorted = col?.sortValue
    ? [...rows].sort((a, b) => {
        const [x, y] = [col.sortValue!(a), col.sortValue!(b)]
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'id')
        return sort!.dir === 'asc' ? cmp : -cmp
      })
    : rows
  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary)

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  if (!rows.length) return <EmptyState title="Belum ada data" description="Data akan tampil di tabel ini setelah tersedia." />

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025] md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b bg-muted/40 text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-5 py-3 font-semibold', c.align === 'right' && 'text-right')}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-1 hover:text-foreground', c.align === 'right' && 'flex-row-reverse')}>
                      <span>{c.header}</span>
                      {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {sorted.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={rowHref ? () => navigate(rowHref(r)) : undefined}
                className={cn('transition-colors', rowHref && 'group cursor-pointer hover:bg-muted/35')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-5 py-4', c.align === 'right' && 'num text-right', c.className)}>
                    {c === primary && rowHref ? (
                      <Link to={rowHref(r)} onClick={(e) => e.stopPropagation()} className="font-semibold decoration-primary/50 underline-offset-4 group-hover:text-primary group-hover:underline">
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {sorted.map((r) => (
          <li key={rowKey(r)}>
            <div
              role={rowHref ? 'link' : undefined}
              tabIndex={rowHref ? 0 : undefined}
              onClick={rowHref ? () => navigate(rowHref(r)) : undefined}
              onKeyDown={rowHref ? (e) => e.key === 'Enter' && navigate(rowHref(r)) : undefined}
              className={cn('rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] transition-colors', rowHref && 'cursor-pointer hover:border-primary/25 hover:bg-muted/15 active:bg-muted/35')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-semibold leading-snug">{primary.cell(r)}</div>
                {rowHref && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0 rounded-xl bg-muted/35 px-2.5 py-2">
                    <dt className="truncate text-[11px] font-medium text-muted-foreground">{c.header}</dt>
                    <dd className="mt-1 truncate text-sm font-medium">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
