import { useState, type ReactNode } from 'react'
import { Table2, ChartSpline } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from './ui/skeleton'

// Shared chart chrome (dataviz skill): validated categorical tokens in fixed order, recessive axes,
// value-first tooltips with line keys, a legend for ≥ 2 series, and a table view for every chart.

export interface LegendItem {
  label: string
  color: string
  shape?: 'line' | 'rect'
}

function Key({ color, shape = 'line' }: { color: string; shape?: 'line' | 'rect' }) {
  return shape === 'line' ? (
    <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
  ) : (
    <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
  )
}

interface TooltipRow {
  name?: string | number
  value?: unknown
  color?: string
  dataKey?: unknown
}

/** Values lead, series names follow, keyed by a short line in the series color. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = String,
  formatLabel = String,
}: {
  active?: boolean
  payload?: readonly TooltipRow[]
  label?: unknown
  formatValue?: (v: number, row: TooltipRow) => string
  formatLabel?: (l: unknown) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{formatLabel(label)}</p>
      {payload.map((row) => (
        <p key={String(row.dataKey)} className="flex items-center gap-2">
          <Key color={row.color ?? 'currentColor'} />
          <span className="num font-semibold text-foreground">
            {Array.isArray(row.value) ? row.value.map((v) => formatValue(v as number, row)).join(' – ') : formatValue(Number(row.value), row)}
          </span>
          <span className="text-muted-foreground">{row.name}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  loading,
  refetching,
  height = 260,
  className,
  children,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  /** Same data as the chart, for screen readers and anyone who prefers numbers. */
  table: { columns: string[]; rows: ReactNode[][] }
  loading?: boolean
  /** Keeps the previous render dimmed instead of flashing a skeleton. */
  refetching?: boolean
  height?: number
  className?: string
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={cn('rounded-xl border bg-card p-4 md:p-5', className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-hover hover:text-foreground"
          aria-pressed={asTable}
        >
          {asTable ? <ChartSpline className="size-3.5" /> : <Table2 className="size-3.5" />}
          {asTable ? 'Grafik' : 'Tabel'}
        </button>
      </header>

      {legend && legend.length > 1 && !asTable && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <Key color={l.color} shape={l.shape} /> {l.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {loading ? (
          <Skeleton style={{ height }} />
        ) : asTable ? (
          <div className="overflow-auto" style={{ maxHeight: height }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={cn('py-1.5 font-medium', i > 0 && 'text-right')}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="num divide-y">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={cn('py-1.5', j > 0 && 'text-right')}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cn('transition-opacity', refetching && 'opacity-50')} style={{ height }}>
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
