import { BadgeCheck, CircleCheck, CircleX, ReceiptText, Scale } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReputationBreakdown } from '@/domain/reputation'
import { formatDate, formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { cn } from '@/lib/utils'
import { scoreBand, useReputation } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { ChartCard, ChartTooltip } from '@/components/Chart'
import { SERIES, axis, grid } from '@/components/chart-tokens'
import { Skeleton } from '@/components/ui/skeleton'

const month = (ym: string) => new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`))

/** [key, label, how to read it, higher is better?] */
const RATES: [keyof ReputationBreakdown, string, string, boolean][] = [
  ['fulfillmentRate', 'Fulfillment rate', 'Transaksi selesai dari semua yang berakhir', true],
  ['onTimeRate', 'On-time rate', 'Selesai sebelum jatuh tempo', true],
  ['cancellationRate', 'Cancellation rate', 'Dibatalkan dari semua transaksi', false],
  ['disputeRate', 'Dispute rate', 'Pernah didispute dari semua transaksi', false],
  ['repeatRate', 'Repeat transactions', 'Selesai dengan mitra yang kembali bertransaksi', true],
]

function RateRow({ label, hint, value, good }: { label: string; hint: string; value: number | null; good: boolean }) {
  const ok = value === null || (good ? value >= 0.8 : value <= 0.1)
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="num shrink-0 text-sm font-semibold">{value === null ? '–' : formatPercent(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((value ?? 0) * 100)}>
        <div className={cn('h-full rounded-full', ok ? 'bg-primary' : 'bg-destructive')} style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </li>
  )
}

export function ReputationPage() {
  const query = useReputation()
  return (
    <>
      <PageHeader title="Reputation" description="Skor dihitung dari riwayat transaksimu: ketepatan, pembatalan, dispute, volume, dan mitra yang kembali." icon={BadgeCheck} tone="yellow" />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(r) => (
          <div className="flex flex-col gap-6">
            <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
              <section className="flex items-center gap-4 rounded-xl border bg-card p-5">
                <div className="grid size-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${r.score * 3.6}deg, var(--muted) 0)` }}>
                  <span className="num grid size-20 place-items-center rounded-full bg-card text-3xl font-semibold">{r.score}</span>
                </div>
                <div>
                  <h2 className="text-sm text-muted-foreground">Skor reputasi</h2>
                  <p className="text-lg font-semibold">{scoreBand(r.score)}</p>
                  <p className="text-xs text-muted-foreground">dari 100 · tampil di profil publik</p>
                </div>
              </section>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Transaksi" value={formatNumber(r.counts.transactions)} icon={ReceiptText} tone="purple" />
                <StatTile label="Berhasil" value={formatNumber(r.counts.successful)} icon={CircleCheck} tone="green" />
                <StatTile label="Dispute" value={formatNumber(r.counts.disputes)} icon={Scale} tone="orange" />
                <StatTile label="Dibatalkan" value={formatNumber(r.counts.cancelled)} icon={CircleX} tone="gray" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <ChartCard
                title="Tren 12 bulan"
                subtitle="Skor di akhir tiap bulan"
                table={{ columns: ['Bulan', 'Skor'], rows: r.trend.map((t) => [month(t.month), formatNumber(t.score)]) }}
              >
                <ResponsiveContainer>
                  <LineChart data={r.trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="month" tickFormatter={month} {...axis} minTickGap={16} />
                    <YAxis width={32} domain={[(min: number) => Math.max(0, Math.floor((min - 5) / 10) * 10), 100]} {...axis} />
                    <Tooltip
                      cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                      content={(p) => <ChartTooltip {...p} formatLabel={(l) => month(String(l))} formatValue={(v) => formatNumber(v)} />}
                    />
                    <Line dataKey="score" name="Skor" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <section className="rounded-xl border bg-card p-4 md:p-5">
                <h2 className="font-medium">Rincian</h2>
                <ul className="divide-y">
                  {RATES.map(([k, label, hint, good]) => <RateRow key={k} label={label} hint={hint} value={r.breakdown[k] as number | null} good={good} />)}
                  <li className="flex justify-between gap-3 py-3 text-sm"><span className="font-medium">Transaction volume</span><span className="num font-semibold">{formatIdr(r.breakdown.volumeIdr, { compact: true })}</span></li>
                  <li className="flex justify-between gap-3 py-3 text-sm">
                    <span><span className="block font-medium">Response time</span><span className="text-xs text-muted-foreground">Agreement ke langkah berikutnya</span></span>
                    <span className="num font-semibold">{r.breakdown.responseHours === null ? '–' : `${formatNumber(r.breakdown.responseHours)} jam`}</span>
                  </li>
                </ul>
              </section>
            </div>

            <section className="rounded-xl border bg-card p-4 md:p-5">
              <h2 className="font-medium">Riwayat perubahan</h2>
              {r.events.length ? (
                <ul className="mt-2 divide-y">
                  {r.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(e.at)} · skor menjadi {e.score}</p>
                      </div>
                      <Tag tone={e.delta > 0 ? 'green' : e.delta < 0 ? 'red' : 'gray'}>{e.delta > 0 ? `+${e.delta}` : e.delta === 0 ? '±0' : `−${Math.abs(e.delta)}`}</Tag>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={BadgeCheck} title="Belum ada perubahan reputasi" description="Skor mulai bergerak setelah transaksi pertamamu selesai." className="mt-3" />
              )}
            </section>
          </div>
        )}
      </AsyncView>
    </>
  )
}
