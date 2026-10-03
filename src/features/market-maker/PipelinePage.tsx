import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Cpu, Kanban, Store, Users, UsersRound, X } from 'lucide-react'
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

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/** Collective procurement pools that asked for a market: one click forms the market and opens its round (PRD F6). */
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
            <li key={p.id} className="flex flex-col rounded-xl border bg-card p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryTag id={p.categoryId} />
                {p.status === 'market_requested' && <Tag tone="yellow">Menunggu market</Tag>}
                {p.status === 'market_live' && <Tag tone={closed ? 'orange' : 'lime'}>{closed ? 'Round ditutup' : 'Round live'}</Tag>}
                {p.status === 'settled' && <Tag tone="green">Settled</Tag>}
              </div>
              <h3 className="mt-2 text-sm font-medium leading-snug">{p.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.spec} · {p.region}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Total demand" value={`${formatNumber(total, { compact: true })} ${p.unit}`} />
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
                        <li>Round reverse auction langsung live: lot {formatNumber(total)} {p.unit}, harga pembuka {formatIdr(p.baseUnitPriceIdr)}/{p.unit}, durasi {MOCKS ? '10 menit (demo)' : '24 jam'}</li>
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
      <PoolRequests />
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
