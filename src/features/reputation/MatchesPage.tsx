import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Bookmark, BookmarkCheck, Handshake, MapPin, Undo2, X } from 'lucide-react'
import { CATEGORIES } from '@/domain/catalog'
import { MATCH_WEIGHTS } from '@/domain/matching'
import { formatIdr, formatQty } from '@/domain/format'
import { toast } from '@/stores/toast'
import { useMatchAction, useMatches } from './hooks'
import type { Match, MatchState } from './types'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { FormError, Segmented, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const TABS: [MatchState, string][] = [['new', 'Baru'], ['saved', 'Disimpan'], ['connected', 'Terhubung'], ['dismissed', 'Diabaikan']]
const PART_LABEL: Record<keyof typeof MATCH_WEIGHTS, string> = { category: 'Kategori', distance: 'Jarak', coverage: 'Kapasitas', confidence: 'Keyakinan engine' }

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center" aria-label={`Match score ${score} dari 100`}>
      <div className="grid size-14 place-items-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${score * 3.6}deg, var(--muted) 0)` }}>
        <span className="num grid size-11 place-items-center rounded-full bg-card text-base font-semibold">{score}</span>
      </div>
      <span className="mt-1 text-[11px] text-muted-foreground">match</span>
    </div>
  )
}

function MatchCard({ m, onDismiss }: { m: Match; onDismiss: () => void }) {
  const act = useMatchAction()
  const run = (action: 'connect' | 'save' | 'reset', title: string) => () => act.mutate({ id: m.id, action }, { onSuccess: () => toast({ title, body: m.need.title, tone: 'green' }) })
  return (
    <article className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="min-w-0 rounded-lg bg-muted p-2.5">
            <p className="text-xs text-muted-foreground">Kamu punya · {m.have.source === 'supply' ? 'Supply' : 'Identitas'}</p>
            <p className="truncate text-sm font-medium">{m.have.label}</p>
            <p className="truncate text-xs text-muted-foreground">{m.have.detail}</p>
          </div>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
          <div className="min-w-0 rounded-lg border p-2.5">
            <p className="text-xs text-muted-foreground">Opportunity butuh</p>
            <Link to={`/opportunities/${m.need.opportunityId}`} className="block truncate text-sm font-medium hover:underline">{m.need.title}</Link>
            <p className="truncate text-xs text-muted-foreground">Gap {formatQty(m.need.gap, { compact: true })}</p>
          </div>
        </div>
        <ScoreRing score={m.score} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Jarak</dt><dd className="num flex items-center gap-1 font-medium"><MapPin className="size-3.5 text-muted-foreground" /> {m.distanceKm} km · {m.need.region}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Estimasi nilai</dt><dd className="num font-medium">{formatIdr(m.estimatedValueIdr, { compact: true })}</dd></div>
      </dl>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Komponen skor">
        <li><Tag tone={CATEGORIES[m.need.categoryId].tone}>{CATEGORIES[m.need.categoryId].label}</Tag></li>
        {(Object.keys(PART_LABEL) as (keyof typeof PART_LABEL)[]).map((k) => (
          <li key={k}><Tag>{PART_LABEL[k]} {m.parts[k]}/{MATCH_WEIGHTS[k]}</Tag></li>
        ))}
      </ul>
      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{m.need.detail}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {m.state === 'connected' ? (
          <>
            {m.conversationId && <Button className="h-8" render={<Link to={`/app/messages/${m.conversationId}`} />}>Buka percakapan</Button>}
            <Button variant="outline" className="h-8" render={<Link to={`/opportunities/${m.need.opportunityId}`} />}>Buka opportunity</Button>
          </>
        ) : m.state === 'dismissed' ? (
          <Button variant="outline" className="h-8" disabled={act.isPending} onClick={run('reset', 'Match dikembalikan')}><Undo2 /> Kembalikan</Button>
        ) : (
          <>
            <Button className="h-8" disabled={act.isPending} onClick={run('connect', 'Terhubung')}><Handshake /> Connect</Button>
            {m.state === 'saved' ? (
              <Button variant="ghost" className="h-8" disabled={act.isPending} onClick={run('reset', 'Batal disimpan')}><BookmarkCheck /> Tersimpan</Button>
            ) : (
              <Button variant="ghost" className="h-8" disabled={act.isPending} onClick={run('save', 'Match disimpan')}><Bookmark /> Save</Button>
            )}
            <Button variant="ghost" className="h-8" onClick={onDismiss}><X /> Dismiss</Button>
          </>
        )}
      </div>
      <FormError error={act.error} />
    </article>
  )
}

/** Optional reason feeds the recommender; the dialog is `?dismiss=<matchId>`. */
function DismissDialog({ m, onClose }: { m: Match; onClose: () => void }) {
  const act = useMatchAction()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abaikan match ini?</DialogTitle>
          <DialogDescription>{m.have.label} → {m.need.title}. Kamu bisa mengembalikannya dari tab Diabaikan.</DialogDescription>
        </DialogHeader>
        <TextareaField label="Kenapa tidak cocok? (opsional)" hint="Membantu melatih rekomendasi supaya match berikutnya lebih tepat." value={reason} onChange={(e) => setReason(e.target.value)} />
        <FormError error={act.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ id: m.id, action: 'dismiss', reason }, { onSuccess: () => { toast({ title: 'Match diabaikan' }); onClose() } })}>Abaikan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MatchesPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as MatchState) || 'new'
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const query = useMatches()
  const dismissing = query.data?.find((m) => m.id === params.get('dismiss'))

  return (
    <>
      <PageHeader
        title="Matches"
        description="Smart Matching memasangkan apa yang kamu punya dengan apa yang dibutuhkan opportunity, lengkap dengan jarak, nilai, dan skor."
        icon={Handshake}
        tone="teal"
      />
      <AsyncView query={query} skeleton={<div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>} emptyFallback={false}>
        {(all) => {
          const rows = all.filter((m) => m.state === tab)
          return (
            <>
              <div className="mb-6 overflow-x-auto">
                <Segmented label="Kelompok match" value={tab} options={TABS.map(([k, l]): [MatchState, string] => [k, `${l} (${all.filter((m) => m.state === k).length})`])} onChange={(v) => set('tab', v)} />
              </div>
              {rows.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {rows.map((m) => <MatchCard key={m.id} m={m} onDismiss={() => set('dismiss', m.id)} />)}
                </div>
              ) : (
                <EmptyState
                  icon={Handshake}
                  tone="teal"
                  title={tab === 'new' ? 'Belum ada match baru' : `Tidak ada match ${TABS.find(([k]) => k === tab)![1].toLowerCase()}`}
                  description="Tambah supply atau isi kapasitas di identitasmu supaya engine bisa mencarikan pasangan."
                  action={<Button render={<Link to="/app/supply/new" />}>Tambah supply</Button>}
                />
              )}
            </>
          )
        }}
      </AsyncView>
      {dismissing && <DismissDialog m={dismissing} onClose={() => set('dismiss', null)} />}
    </>
  )
}
