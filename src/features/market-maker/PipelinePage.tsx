import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, ChevronRight, Cpu, Kanban, MapPin, Store, Users, UsersRound, X } from 'lucide-react'
import { PIPELINE_MOVES, PIPELINE_STAGES, type PipelineCard, type PipelineStage } from '@/domain/mm'
import { MECHANISMS, OPPORTUNITY_KINDS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useFormPoolMarket, useMoveOpportunity, useParam, usePipeline, usePoolRequests } from './hooks'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Tag } from '@/components/Tag'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const STAGES = Object.keys(PIPELINE_STAGES) as PipelineStage[]

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-background/70 px-2.5 py-2">
      <dt className="truncate text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 break-words text-sm font-semibold leading-tight">{value}</dd>
    </div>
  )
}

function Card({ o, onDismiss }: { o: PipelineCard; onDismiss: () => void }) {
  const move = useMoveOpportunity()
  const moves = PIPELINE_MOVES[o.stage].filter((s) => s !== 'dismissed')
  const formable = o.stage !== 'market_live' && o.stage !== 'dismissed'
  return (
    <article className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card p-3.5 shadow-sm shadow-foreground/[0.025] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md sm:p-4" aria-label={o.title}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Tag tone={OPPORTUNITY_KINDS[o.kind].tone}>{OPPORTUNITY_KINDS[o.kind].label}</Tag>
        <span className="ml-auto shrink-0 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{o.code}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 tracking-tight">
        <Link to={`/opportunities/${o.id}`} className="hover:underline">{o.title}</Link>
      </h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" /> <span className="truncate">{o.region}</span></p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Potensi demand" value={formatIdr(o.potentialValueIdr, { compact: true })} />
        <Metric label="Peserta" value={formatNumber(o.participants)} />
        <Metric label="Supply coverage" value={formatPercent(o.demand.value > 0 ? Math.min(1, o.supply.value / o.demand.value) : 0)} />
        <Metric label="Tingkat keyakinan mesin" value={formatPercent(o.confidence)} />
      </dl>
      <div className="mt-3 rounded-xl border border-purple-500/15 bg-purple-500/[0.045] p-3 text-xs dark:border-purple-400/15 dark:bg-purple-400/[0.06]">
        <p className="flex items-center gap-1.5 font-semibold text-purple-800 dark:text-purple-200"><Cpu className="size-3.5 shrink-0" /> Rekomendasi engine</p>
        <p className="mt-1 font-medium">{MECHANISMS[o.suggestedMechanism].label}</p>
        <p className="mt-1 line-clamp-3 leading-relaxed text-muted-foreground">{o.mechanismReason}</p>
      </div>
      {o.dismissReason && <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Alasan dismiss:</span> {o.dismissReason}</p>}
      <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-3">
        {formable && <Button size="sm" className="w-full" render={<Link to={`/mm/markets/new?opportunity=${o.id}`} />}><Store /> Form market</Button>}
        {o.stage === 'market_live' && o.marketId && <Button size="sm" variant="outline" className="w-full" render={<Link to={`/markets/${o.marketId}`} />}>Lihat market</Button>}
        {moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="w-full" aria-label={`Pindahkan ${o.title}`} disabled={move.isPending} />}>
              <ArrowRightLeft /> Pindahkan
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {moves.map((s) => (
                <DropdownMenuItem key={s} onClick={() => move.mutate({ id: o.id, stage: s }, { onSuccess: () => toast({ title: `${o.code} → ${PIPELINE_STAGES[s].label}`, tone: PIPELINE_STAGES[s].tone }) })}>
                  {PIPELINE_STAGES[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {PIPELINE_MOVES[o.stage].includes('dismissed') && (
          <Button size="sm" variant="ghost" className="w-full" onClick={onDismiss}><X /> Dismiss</Button>
        )}
      </div>
      <FormError error={move.error} />
    </article>
  )
}

function DismissDialog({ o, onClose }: { o: PipelineCard; onClose: () => void }) {
  const move = useMoveOpportunity()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss {o.title}?</DialogTitle>
          <DialogDescription>Opportunity keluar dari pipeline aktif. Bisa dikembalikan ke Detected kapan saja.</DialogDescription>
        </DialogHeader>
        <TextareaField label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(move.error, 'reason')} hint="Wajib; tercatat di audit log." />
        <FormError error={move.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || move.isPending}
            onClick={() => move.mutate({ id: o.id, stage: 'dismissed', reason }, { onSuccess: () => { toast({ title: `${o.code} di-dismiss`, tone: 'gray' }); onClose() } })}
          >
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'


function PoolRequests() {
  const query = usePoolRequests()
  const form = useFormPoolMarket()
  const navigate = useNavigate()
  const list = query.data ?? []
  if (!list.length) return null
  return (
    <section aria-labelledby="pool-requests" className="mb-6">
      <h2 id="pool-requests" className="mb-1 flex items-center gap-2 font-medium"><UsersRound className="size-4 text-muted-foreground" /> Permintaan pool kolektif</h2>
      <p className="mb-3 text-sm text-muted-foreground">Bisnis menggabungkan demand dan meminta market. Lot = total pool; hasil round dibagi pro-rata ke anggota.</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const total = p.members.reduce((s, m) => s + m.quantity, 0)
          const closed = p.round && !['live', 'extended'].includes(p.round.status)
          const ops = `/mm/markets/${p.marketId}?tab=rounds`
          return (
            <li key={p.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025]">
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryTag id={p.categoryId} />
                {p.status === 'market_requested' && <Tag tone="yellow">Menunggu market</Tag>}
                {p.status === 'market_live' && <Tag tone={closed ? 'orange' : 'lime'}>{closed ? 'Round ditutup' : 'Round berlangsung'}</Tag>}
                {p.status === 'settled' && <Tag tone="green">Settled</Tag>}
              </div>
              <h3 className="mt-2 text-sm font-medium leading-snug">{p.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.spec} · {p.region}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Jumlah demand" value={`${formatNumber(total, { compact: true })} ${p.unit}`} />
                <Metric label="Bisnis" value={formatNumber(p.members.length)} />
                <Metric label="Harga kini" value={formatIdr(p.baseUnitPriceIdr, { compact: true })} />
              </dl>
              {p.marketRequestedAt && <p className="mt-2 text-xs text-muted-foreground">Diminta {formatRelative(p.marketRequestedAt)}</p>}
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {p.status === 'market_requested' && (
                  <ConfirmDialog
                    trigger={<Button size="sm"><Store /> Bentuk market & buka round</Button>}
                    title={`Bentuk market untuk ${p.title}?`}
                    impact={
                      <ul className="list-disc space-y-1 pl-4">
                        <li>Market collective procurement di {p.region}, aturan v1 default</li>
                        <li>Round reverse auction langsung dibuka: lot {formatNumber(total)} {p.unit}, harga pembuka {formatIdr(p.baseUnitPriceIdr)}/{p.unit}, durasi {MOCKS ? '10 menit (demo)' : '24 jam'}</li>
                        <li>{p.members.length} bisnis anggota diberi tahu; setelah round ditutup, settle dari tab Rounds</li>
                      </ul>
                    }
                    confirmLabel="Bentuk market"
                    onConfirm={() => form.mutateAsync({ id: p.id, durationMinutes: MOCKS ? 10 : 1440 }).then((r) => {
                      toast({ title: 'Market dan round dibuka', body: p.title, tone: 'green' })
                      navigate(`/mm/markets/${r.marketId}?tab=rounds`)
                    })}
                  />
                )}
                {p.status === 'market_live' && closed && <Button size="sm" render={<Link to={`${ops}&round=settle:${p.auctionId}`} />}>Settlement</Button>}
                {p.status !== 'market_requested' && <Button size="sm" variant="outline" render={<Link to={ops} />}>Operasikan market</Button>}
              </div>
            </li>
          )
        })}
      </ul>
      <FormError error={form.error} />
    </section>
  )
}

export function PipelinePage() {
  const query = usePipeline()

  const [dismissId, setDismiss] = useParam('dismiss')
  const [stageParam, setStage] = useParam('stage')
  const selectedStage = STAGES.includes(stageParam as PipelineStage) ? stageParam as PipelineStage : null
  const dismissing = query.data?.find((o) => o.id === dismissId)
  return (
    <>
      <PageHeader
        title="Opportunity pipeline"
        description="Opportunity dari Market Formation Engine, dari terdeteksi sampai market berjalan."
        icon={Kanban}
        tone="purple"
        featured
        actions={selectedStage ? <Button variant="outline" className="h-9" onClick={() => setStage('')}><ArrowLeft /> Semua tahap</Button> : undefined}
      />
      <PoolRequests />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} emptyFallback={false}>
        {(cards) => (
          <>
          {selectedStage ? (
            <section aria-labelledby="stage-results">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Opportunity berdasarkan status</p>
                  <h2 id="stage-results" className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
                    <Tag tone={PIPELINE_STAGES[selectedStage].tone}>{PIPELINE_STAGES[selectedStage].label}</Tag>
                    <span className="text-base font-medium text-muted-foreground">{formatNumber(cards.filter((c) => c.stage === selectedStage).length)} item</span>
                  </h2>
                </div>
              </div>
              {cards.some((c) => c.stage === selectedStage) ? (
                <ul className="grid items-stretch gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {cards.filter((c) => c.stage === selectedStage).sort((a, b) => b.confidence - a.confidence).map((o) => (
                    <li key={o.id} className="flex"><Card o={o} onDismiss={() => setDismiss(o.id)} /></li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed bg-muted/15 px-5 py-10 text-center text-sm text-muted-foreground">Belum ada opportunity pada tahap {PIPELINE_STAGES[selectedStage].label}.</p>
              )}
            </section>
          ) : (
            <section aria-labelledby="pipeline-boards">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div><h2 id="pipeline-boards" className="text-lg font-semibold tracking-tight">Papan opportunity</h2><p className="mt-0.5 text-sm text-muted-foreground">Satu ringkasan terbaru per tahap. Buka daftar untuk melihat semuanya.</p></div>
                <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{formatNumber(cards.length)} opportunity</span>
              </div>
              <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {STAGES.map((stage) => {
                  const list = cards.filter((c) => c.stage === stage).sort((a, b) => b.confidence - a.confidence)
                  return (
                    <section key={stage} aria-labelledby={`stage-${stage}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-muted/20 p-3 shadow-sm shadow-foreground/[0.02]">
                      <header id={`stage-${stage}`} className="flex items-center gap-2 border-b px-1 pb-3">
                        <Tag tone={PIPELINE_STAGES[stage].tone}>{PIPELINE_STAGES[stage].label}</Tag>
                        <span className="ml-auto rounded-full border bg-card px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{formatNumber(list.length)}</span>
                      </header>
                      {list[0] ? <Card o={list[0]} onDismiss={() => setDismiss(list[0].id)} /> : (
                        <p className="flex min-h-32 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground"><Users className="size-3.5" />Belum ada opportunity</p>
                      )}
                      <Button variant="outline" size="sm" className="w-full justify-between bg-card" disabled={!list.length} onClick={() => setStage(stage)}>
                        <span>Lihat semua {formatNumber(list.length)}</span><ChevronRight />
                      </Button>
                    </section>
                  )
                })}
              </div>
            </section>
          )}
          </>
        )}
      </AsyncView>
      {dismissing && <DismissDialog o={dismissing} onClose={() => setDismiss('')} />}
    </>
  )
}
