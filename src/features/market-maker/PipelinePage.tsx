import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, Cpu, Kanban, Store, Users, X } from 'lucide-react'
import { PIPELINE_MOVES, PIPELINE_STAGES, type PipelineCard, type PipelineStage } from '@/domain/mm'
import { MECHANISMS, OPPORTUNITY_KINDS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatPercent } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useMoveOpportunity, useParam, usePipeline } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { Tag } from '@/components/Tag'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const STAGES = Object.keys(PIPELINE_STAGES) as PipelineStage[]

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="num truncate text-sm font-semibold">{value}</dd>
    </div>
  )
}

function Card({ o, onDismiss }: { o: PipelineCard; onDismiss: () => void }) {
  const move = useMoveOpportunity()
  const moves = PIPELINE_MOVES[o.stage].filter((s) => s !== 'dismissed')
  const formable = o.stage !== 'market_live' && o.stage !== 'dismissed'
  return (
    <article className="rounded-xl border bg-card p-3.5" aria-label={o.title}>
      <div className="flex items-center gap-1.5">
        <Tag tone={OPPORTUNITY_KINDS[o.kind].tone}>{OPPORTUNITY_KINDS[o.kind].label}</Tag>
        <span className="ml-auto text-xs text-muted-foreground">{o.code}</span>
      </div>
      <h3 className="mt-2 text-sm font-medium leading-snug">
        <Link to={`/opportunities/${o.id}`} className="hover:underline">{o.title}</Link>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{o.region}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Potensi demand" value={formatIdr(o.potentialValueIdr, { compact: true })} />
        <Metric label="Peserta" value={formatNumber(o.participants)} />
        <Metric label="Supply coverage" value={formatPercent(Math.min(1, o.supply.value / o.demand.value))} />
        <Metric label="Confidence" value={formatPercent(o.confidence)} />
      </dl>
      <div className="mt-3 rounded-lg bg-muted p-2.5 text-xs">
        <p className="flex items-center gap-1 font-medium"><Cpu className="size-3.5" /> Engine: {MECHANISMS[o.suggestedMechanism].label}</p>
        <p className="mt-1 text-muted-foreground">{o.mechanismReason}</p>
      </div>
      {o.dismissReason && <p className="mt-2 text-xs text-muted-foreground">Alasan dismiss: {o.dismissReason}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {formable && <Button size="sm" render={<Link to={`/mm/markets/new?opportunity=${o.id}`} />}><Store /> Form market</Button>}
        {o.stage === 'market_live' && o.marketId && <Button size="sm" variant="outline" render={<Link to={`/markets/${o.marketId}`} />}>Lihat market</Button>}
        {moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label={`Pindahkan ${o.title}`} disabled={move.isPending} />}>
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
          <Button size="sm" variant="ghost" onClick={onDismiss}><X /> Dismiss</Button>
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

export function PipelinePage() {
  const query = usePipeline()
  // Dismiss dialog is URL state (?dismiss=<opportunityId>).
  const [dismissId, setDismiss] = useParam('dismiss')
  const dismissing = query.data?.find((o) => o.id === dismissId)
  return (
    <>
      <PageHeader
        title="Opportunity pipeline"
        description="Opportunity dari Market Formation Engine, dari terdeteksi sampai market berjalan."
        icon={Kanban}
        tone="purple"
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(cards) => (
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:-mx-10 md:px-10">
            {STAGES.map((stage) => {
              const list = cards.filter((c) => c.stage === stage).sort((a, b) => b.confidence - a.confidence)
              return (
                <section key={stage} aria-labelledby={`stage-${stage}`} className="flex w-[17.5rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/50 p-2">
                  <h2 id={`stage-${stage}`} className="flex items-center gap-2 px-1.5 py-1 text-sm font-medium">
                    <Tag tone={PIPELINE_STAGES[stage].tone}>{PIPELINE_STAGES[stage].label}</Tag>
                    <span className="num text-muted-foreground">{list.length}</span>
                  </h2>
                  {list.map((o) => <Card key={o.id} o={o} onDismiss={() => setDismiss(o.id)} />)}
                  {!list.length && (
                    <p className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-6 text-xs text-muted-foreground">
                      <Users className="size-3.5" /> Kosong
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </AsyncView>
      {dismissing && <DismissDialog o={dismissing} onClose={() => setDismiss('')} />}
    </>
  )
}
