import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bell, BellOff, List, MapPin, Network, Sparkles, Waypoints } from 'lucide-react'
import type { PersonalOpportunity } from '@/domain/types'
import { CATEGORIES, OPPORTUNITY_KINDS } from '@/domain/catalog'
import { formatIdr, formatNumber, formatQty } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useListings, useOpportunityAction, usePersonalOpportunities } from './hooks'
import { GapMeter } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const TABS: [string, string][] = [
  ['for_you', 'For you'], ['nearby', 'Nearby'], ['market_gap', 'Market gaps'], ['collective', 'Collective demand'],
  ['supply_gap', 'Supply gaps'], ['joined', 'Joined'], ['following', 'Following'],
]

/** Join = contribute one of my listings (or a new quantity) to the opportunity (PRD §8.5). */
function JoinDialog({ o, onClose }: { o: PersonalOpportunity; onClose: () => void }) {
  const [kind, setKind] = useState<'supply' | 'demand'>(o.kind === 'collective_demand' ? 'demand' : 'supply')
  const listings = useListings(kind)
  const matching = (listings.data ?? []).filter((l) => l.categoryId === o.categoryId && !['sold', 'expired', 'fulfilled', 'cancelled'].includes(l.status))
  const [listingId, setListingId] = useState('')
  const [qty, setQty] = useState('')
  const join = useOpportunityAction()
  const chosen = matching.find((l) => l.id === listingId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join {o.title}</DialogTitle>
          <DialogDescription>Kontribusimu dihitung ke {kind === 'demand' ? 'demand kolektif' : 'supply'} opportunity ini.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Segmented label="Jenis kontribusi" value={kind} options={[['demand', 'Kontribusi demand'], ['supply', 'Kontribusi supply']]} onChange={(v) => { setKind(v); setListingId('') }} />
          <SelectField label="Dari listing" value={listingId} onChange={(e) => { setListingId(e.target.value); const l = matching.find((x) => x.id === e.target.value); if (l) setQty(String(l.quantity.value)) }}>
            <option value="">{matching.length ? 'Pilih listing' : `Belum ada ${kind} di kategori ${CATEGORIES[o.categoryId].label}`}</option>
            {matching.map((l) => <option key={l.id} value={l.id}>{l.item} · {formatQty(l.quantity, { compact: true })}</option>)}
          </SelectField>
          {!matching.length && (
            <Link to={`/app/${kind}/new`} className="text-sm font-medium text-primary hover:underline">Buat {kind} baru</Link>
          )}
          <Field label={`Kuantitas (${chosen?.quantity.unit ?? o.demand.unit})`} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} error={fieldError(join.error, 'quantity')} />
        </div>
        <FormError error={join.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={!listingId || !(Number(qty) > 0) || join.isPending}
            onClick={() =>
              join.mutate(
                { type: 'join', id: o.id, kind, listingId, quantity: { value: Number(qty), unit: chosen?.quantity.unit ?? o.demand.unit } },
                { onSuccess: () => { toast({ title: `Bergabung ke ${o.title}`, tone: 'green' }); onClose() } },
              )
            }
          >
            {join.isPending ? 'Menyimpan…' : 'Join'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PersonalCard({ o, onJoin }: { o: PersonalOpportunity; onJoin: () => void }) {
  const action = useOpportunityAction()
  return (
    <article className="group flex min-w-0 flex-col rounded-2xl border bg-linear-to-br from-card via-card to-lime/5 p-4 shadow-sm shadow-foreground/[0.025] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md hover:shadow-primary/[0.04] sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag tone={OPPORTUNITY_KINDS[o.kind].tone}>{OPPORTUNITY_KINDS[o.kind].label}</Tag>
        <StatusBadge entity="opportunity" status={o.status} />
        {o.relation === 'joined' && <Tag tone="green">Joined</Tag>}
        {o.relation === 'following' && <Tag tone="blue">Following</Tag>}
      </div>
      <Link to={`/opportunities/${o.id}`} className="mt-3 font-semibold leading-snug decoration-primary/50 underline-offset-4 group-hover:text-primary group-hover:underline">{o.title}</Link>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" /> {o.region} · {o.distanceKm} km</p>

      {o.reasons.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/10 bg-primary/[0.035] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="size-3.5 text-primary" /> Kenapa cocok</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
            {o.reasons.map((r) => <li key={r.label}><span className="font-medium text-foreground">{r.label}:</span> {r.detail}</li>)}
          </ul>
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/45 p-3"><dt className="text-[11px] font-medium text-muted-foreground">Nilai untukmu</dt><dd className="num mt-1 font-semibold">{formatIdr(o.personalValueIdr, { compact: true })}/bln</dd></div>
        <div className="rounded-xl bg-muted/45 p-3"><dt className="text-[11px] font-medium text-muted-foreground">Peserta</dt><dd className="num mt-1 font-semibold">{formatNumber(o.participants)}</dd></div>
      </dl>
      {o.contribution && <p className="mt-2 text-xs text-muted-foreground">Kontribusimu: {formatQty(o.contribution.quantity)} ({o.contribution.kind})</p>}
      <GapMeter demand={o.demand} supply={o.supply} className="mt-3" />
      <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-4">
        {o.relation === 'joined' ? (
          <Button variant="outline" className="h-8" onClick={() => action.mutate({ type: 'leave', id: o.id }, { onSuccess: () => toast({ title: `Keluar dari ${o.title}` }) })}>Leave</Button>
        ) : (
          <>
            <Button className="h-8" onClick={onJoin}>Join</Button>
            {o.relation === 'following' ? (
              <Button variant="ghost" className="h-8" onClick={() => action.mutate({ type: 'leave', id: o.id })}><BellOff /> Unfollow</Button>
            ) : (
              <Button variant="ghost" className="h-8" onClick={() => action.mutate({ type: 'follow', id: o.id }, { onSuccess: () => toast({ title: 'Kamu mengikuti opportunity ini', tone: 'blue' }) })}><Bell /> Follow</Button>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/** Me in the middle, opportunities around, linked by why they matched (PRD §8.5 graph view). */
function OpportunityGraph({ items }: { items: PersonalOpportunity[] }) {
  const navigate = useNavigate()
  const { nodes, edges } = useMemo(() => {
    const r = 260
    const nodes: Node[] = [
      { id: 'me', position: { x: 0, y: 0 }, data: { label: 'Kamu' }, style: { background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', borderRadius: 999, width: 90, fontWeight: 600 } },
      ...items.map((o, i) => {
        const a = (i / items.length) * Math.PI * 2
        return {
          id: o.id,
          position: { x: Math.cos(a) * r, y: Math.sin(a) * r },
          data: { label: `${o.title} · ${formatIdr(o.personalValueIdr, { compact: true })}` },
          style: { background: `var(--tag-${OPPORTUNITY_KINDS[o.kind].tone}-bg)`, color: `var(--tag-${OPPORTUNITY_KINDS[o.kind].tone}-fg)`, border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, width: 180 },
        }
      }),
    ]
    const edges: Edge[] = items.map((o) => ({
      id: `me-${o.id}`, source: 'me', target: o.id, label: o.relation !== 'none' ? o.relation : o.reasons[0]?.label,
      animated: o.relation === 'joined', style: { stroke: 'var(--muted-foreground)', strokeWidth: o.relation === 'joined' ? 2 : 1 },
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 }, labelBgStyle: { fill: 'var(--card)' },
    }))
    return { nodes, edges }
  }, [items])
  return (
    <div className="h-[520px] overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesConnectable={false} onNodeClick={(_, n) => n.id !== 'me' && navigate(`/opportunities/${n.id}`)}>
        <Background color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function MyOpportunitiesPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'for_you'
  const view = params.get('view') ?? 'list'
  const query = usePersonalOpportunities(tab)
  const follow = useOpportunityAction()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })

  // The join dialog is URL state (?join=<id>), so the public page's "Join" lands straight in it.
  const all = usePersonalOpportunities('all')
  const joining = all.data?.find((o) => o.id === params.get('join'))
  const followId = params.get('follow')
  useEffect(() => {
    if (!followId) return
    follow.mutate({ type: 'follow', id: followId }, { onSuccess: () => toast({ title: 'Kamu mengikuti opportunity ini', tone: 'blue' }) })
    setParams((p) => (p.delete('follow'), p), { replace: true })
  }, [followId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Peluang yang cocok dengan kapasitas, lokasi, dan preferensimu, lengkap dengan alasannya."
        icon={Sparkles}
        tone="lime"
        featured
        actions={
          <div role="group" aria-label="Tampilan opportunity" className="inline-flex rounded-xl border bg-muted/55 p-1">
            {([['list', List, 'List'], ['graph', Network, 'Graph']] as const).map(([mode, Icon, label]) => (
              <button key={mode} type="button" aria-pressed={view === mode} onClick={() => set('view', mode)}
                className={cn('inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors', view === mode ? 'border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/15' : 'border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground')}>
                <Icon className="size-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        }
      />
      <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4" role="tablist" aria-label="Kelompok opportunity">
        <div className="flex w-max gap-1 rounded-2xl border bg-muted/35 p-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => set('tab', id)}
            className={cn('shrink-0 rounded-xl border border-transparent px-3.5 py-2 text-sm transition-colors', tab === id ? 'border-border/70 bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground')}
          >
            {label}
          </button>
        ))}
        </div>
      </div>
      <AsyncView
        query={query}
        skeleton={<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}</div>}
        empty={
          <EmptyState
            icon={tab === 'joined' || tab === 'following' ? Waypoints : Network}
            title={tab === 'joined' ? 'Belum join opportunity' : tab === 'following' ? 'Belum mengikuti opportunity' : 'Belum ada yang cocok'}
            description="Lengkapi identitas dan tambah supply/demand supaya engine bisa mencarikan peluang."
            action={<Button render={<Link to="/app/identity" />}>Lengkapi identitas</Button>}
          />
        }
      >
        {(items) =>
          view === 'graph' ? (
            <OpportunityGraph items={items} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2 rounded-2xl border bg-card px-4 py-3.5 shadow-sm shadow-foreground/[0.02]">
                <div><h2 className="font-semibold tracking-tight">{TABS.find(([id]) => id === tab)?.[1] ?? 'Peluang untukmu'}</h2><p className="mt-0.5 text-sm text-muted-foreground">Peluang dicocokkan berdasarkan kapasitas, lokasi, dan preferensimu.</p></div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{formatNumber(items.length)} peluang</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((o) => <PersonalCard key={o.id} o={o} onJoin={() => set('join', o.id)} />)}
              </div>
            </>
          )
        }
      </AsyncView>
      {joining && <JoinDialog o={joining} onClose={() => set('join', null)} />}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground"><List className="size-3.5" /> Tampilan peta menyusul setelah keputusan library peta (lihat open questions PRD).</p>
    </>
  )
}
