import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp } from 'lucide-react'
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
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-4 py-2.5 font-medium', c.align === 'right' && 'text-right')}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-1 hover:text-foreground', c.align === 'right' && 'flex-row-reverse')}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={rowHref ? () => navigate(rowHref(r)) : undefined}
                className={cn(rowHref && 'cursor-pointer hover:bg-hover')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3', c.align === 'right' && 'num text-right', c.className)}>
                    {c === primary && rowHref ? (
                      <Link to={rowHref(r)} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
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

      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {sorted.map((r) => (
          <li key={rowKey(r)}>
            <div
              role={rowHref ? 'link' : undefined}
              tabIndex={rowHref ? 0 : undefined}
              onClick={rowHref ? () => navigate(rowHref(r)) : undefined}
              onKeyDown={rowHref ? (e) => e.key === 'Enter' && navigate(rowHref(r)) : undefined}
              className={cn('rounded-xl border bg-card p-3.5', rowHref && 'cursor-pointer active:bg-hover')}
            >
              <div className="font-medium">{primary.cell(r)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{c.header}</dt>
                    <dd className="truncate">{c.cell(r)}</dd>
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
