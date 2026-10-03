import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, EyeOff, MapPin, Plus, Store, UsersRound } from 'lucide-react'
import type { CategoryId } from '@/domain/types'
import { poolTotals } from '@/domain/org'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatDate, formatIdr, formatNumber, formatPercent, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useCreatePool, useOrgAccess, usePoolAction, usePools, type PoolView } from './hooks'
import { fromDate, inDays, selectClass, toDate } from './utils'
import { GuardedButton, Section } from './ui'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Tag } from '@/components/Tag'
import { Field, FormError, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function JoinDialog({ pool, onClose }: { pool: PoolView; onClose: () => void }) {
  const act = usePoolAction()
  const mine = pool.members.find((m) => m.mine)
  const [qty, setQty] = useState(String(mine?.quantity ?? pool.refQty))
  const [optIn, setOptIn] = useState(mine?.optIn ?? false)
  const preview = poolTotals({ ...pool, members: [...pool.members.filter((m) => !m.mine), { name: 'Kamu', quantity: Number(qty) || 0, optIn, mine: true }] })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mine ? 'Ubah demand' : 'Gabung pool'}: {pool.title}</DialogTitle>
          <DialogDescription>Semakin besar demand gabungan, semakin rendah proyeksi harga satuan.</DialogDescription>
        </DialogHeader>
        <Field label={`Demand kamu (${pool.unit})`} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} error={fieldError(act.error, 'quantity')} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Tampilkan nama bisnis kami ke peserta lain. Jika tidak, kamu tampil sebagai &ldquo;Bisnis lain&rdquo;.
        </label>
        <div className="rounded-lg bg-muted p-3 text-sm">
          Proyeksi: <b className="num">{formatIdr(preview.unitPriceIdr)}/{pool.unit}</b> · hemat {formatPercent(preview.discount)} · total {formatQty({ value: preview.total, unit: pool.unit }, { compact: true })}
        </div>
        <FormError error={act.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ id: pool.id, type: 'join', quantity: Number(qty), optIn }, { onSuccess: () => { toast({ title: mine ? 'Demand diperbarui' : 'Bergabung ke pool', body: pool.title, tone: 'green' }); onClose() } })}>
            {mine ? 'Simpan' : 'Gabung'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePoolDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreatePool()
  const [f, setF] = useState({ title: '', categoryId: 'packaging' as CategoryId, spec: '', region: REGIONS[1], deadline: toDate(inDays(21)), unit: 'pcs', quantity: '', price: '', optIn: false })
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Buat pool collective</DialogTitle><DialogDescription>Bisnis lain dengan kebutuhan serupa di wilayahmu bisa ikut bergabung.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Kebutuhan" value={f.title} onChange={(e) => set('title', e.target.value)} error={fieldError(create.error, 'title')} /></div>
          <SelectField label="Kategori" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </SelectField>
          <SelectField label="Wilayah" value={f.region} onChange={(e) => set('region', e.target.value)}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</SelectField>
          <div className="sm:col-span-2"><Field label="Spesifikasi" value={f.spec} onChange={(e) => set('spec', e.target.value)} /></div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="Demand kamu" type="number" min={0} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} error={fieldError(create.error, 'quantity')} />
            <Field label="Satuan" value={f.unit} onChange={(e) => set('unit', e.target.value)} />
          </div>
          <Field label="Harga satuan saat ini (Rp)" type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} error={fieldError(create.error, 'baseUnitPriceIdr')} />
          <Field label="Deadline" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-primary" checked={f.optIn} onChange={(e) => set('optIn', e.target.checked)} /> Tampilkan nama bisnis kami ke peserta lain</label>
        <FormError error={create.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={create.isPending} onClick={() => create.mutate(
            { title: f.title, categoryId: f.categoryId, spec: f.spec, region: f.region, deadline: fromDate(f.deadline), unit: f.unit, quantity: Number(f.quantity), baseUnitPriceIdr: Number(f.price), optIn: f.optIn },
            { onSuccess: (p) => { toast({ title: 'Pool dibuat', body: p.title, tone: 'green' }); onCreated(p.id) } },
          )}>Buat pool</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** After a market maker picks the pool up: its round, then the pro-rata split with this org's own sub-PO (PRD F6). */
function PoolMarket({ pool }: { pool: PoolView }) {
  const access = useOrgAccess()
  const s = pool.settlement
  const live = pool.round && (pool.round.status === 'live' || pool.round.status === 'extended')
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: s ? 'var(--tag-green-bg)' : 'var(--tag-teal-bg)', color: s ? 'var(--tag-green-fg)' : 'var(--tag-teal-fg)' }}>
          <Store className="size-4" />
          {s ? `Di-settle ${formatRelative(s.at)} oleh ${s.by}` : live ? <>Round berjalan · selesai {formatRelative(pool.round!.endsAt)}</> : 'Round ditutup · menunggu settlement market maker'}
        </p>
        {pool.auctionId && <Button variant="outline" className="h-9" render={<Link to={`/auctions/${pool.auctionId}`} />}>Lihat round</Button>}
        {pool.marketId && <Button variant="ghost" className="h-9" render={<Link to={`/markets/${pool.marketId}`} />}>Lihat market</Button>}
      </div>
      {s && (
        <div>
          <h3 className="text-sm font-medium">Pembagian pro-rata · {s.winner} · {formatIdr(s.priceIdr)}/{pool.unit}</h3>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {s.lines.map((l) => (
              <li key={l.name} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', l.mine && 'bg-primary/5')}>
                <span className="font-medium">{l.mine ? 'Kamu' : l.name}</span>
                {l.mine && l.transactionId && <Link to={`${access.base}/transactions/${l.transactionId}`} className="text-xs text-primary hover:underline">Buka sub-PO</Link>}
                <span className="ml-auto num text-muted-foreground">{formatNumber(l.quantity)} {pool.unit} · {Math.round(l.share * 100)}%</span>
                <span className="num w-28 text-right font-medium">{formatIdr(l.amountIdr, { compact: true })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Tiap bisnis anggota mendapat PO, invoice, dan pengiriman sendiri ke titik tujuannya.</p>
        </div>
      )}
    </div>
  )
}

/** Your demand + other businesses = collective demand (PRD §9.5). */
function Aggregation({ pool, marketDeny, onJoin }: { pool: PoolView; marketDeny?: string; onJoin: () => void }) {
  const act = usePoolAction()
  const t = poolTotals(pool)
  const unit = pool.unit
  const qty = (v: number) => formatQty({ value: v, unit }, { compact: true })
  return (
    <Section title={pool.title} actions={<span className="flex flex-wrap gap-1.5"><CategoryTag id={pool.categoryId} /><Tag tone="gray">{pool.region}</Tag></span>}>
      <div className="grid items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Demand kamu</p><p className="num text-lg font-semibold">{t.mine ? qty(t.mine) : '—'}</p></div>
        <span aria-hidden className="text-muted-foreground">+</span>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Bisnis lain ({t.businesses - (t.mine ? 1 : 0)})</p><p className="num text-lg font-semibold">{qty(t.others)}</p></div>
        <span aria-hidden className="text-muted-foreground">=</span>
        <div className="rounded-lg p-3" style={{ background: 'var(--tag-blue-bg)', color: 'var(--tag-blue-fg)' }}><p className="text-xs">Collective demand</p><p className="num text-lg font-semibold">{qty(t.total)}</p></div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Bisnis</dt><dd className="num font-medium">{t.businesses}</dd></div>
        <div><dt className="text-muted-foreground">Harga sendiri</dt><dd className="num font-medium">{formatIdr(pool.baseUnitPriceIdr)}</dd></div>
        <div><dt className="text-muted-foreground">Proyeksi harga skala</dt><dd className="num font-medium" style={{ color: 'var(--tag-green-fg)' }}>{formatIdr(t.unitPriceIdr)}</dd></div>
        <div><dt className="text-muted-foreground">Hemat</dt><dd className="num font-medium">{formatPercent(t.discount)}{t.mine > 0 && <> · {formatIdr((pool.baseUnitPriceIdr - t.unitPriceIdr) * t.mine, { compact: true })}</>}</dd></div>
      </dl>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground"><span>Menuju ambang market</span><span className="num">{qty(t.total)} / {qty(pool.thresholdQty)}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.progress * 100)} aria-label="Progres menuju ambang market">
          <div className="h-full rounded-full bg-primary" style={{ width: `${t.progress * 100}%` }} />
        </div>
      </div>
      <h3 className="mt-5 text-sm font-medium">Peserta</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {pool.members.map((m) => (
          <li key={m.name}><Tag tone={m.mine ? 'blue' : 'gray'}>{!m.optIn && !m.mine && <EyeOff className="size-3" aria-label="Identitas disembunyikan" />}{m.mine ? 'Kamu' : m.name} · <span className="num">{formatNumber(m.quantity, { compact: true })}</span></Tag></li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Nama bisnis lain hanya tampil jika mereka mengizinkan.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        {pool.status === 'open' && <Button variant="outline" className="h-9" onClick={onJoin}>{t.mine ? 'Ubah demand' : 'Gabung pool'}</Button>}
        {pool.status === 'market_live' || pool.status === 'settled' ? (
          <PoolMarket pool={pool} />
        ) : pool.status === 'market_requested' ? (
          <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tag-yellow-bg)', color: 'var(--tag-yellow-fg)' }}>
            <Clock className="size-4" /> Menunggu market maker membentuk market · diminta {formatRelative(pool.marketRequestedAt!)}
          </p>
        ) : t.ready ? (
          marketDeny || !t.mine ? (
            <GuardedButton className="h-9" reason={marketDeny ?? 'Gabung pool dulu untuk meminta market'}><Store /> Create Market</GuardedButton>
          ) : (
            <ConfirmDialog
              trigger={<Button className="h-9"><Store /> Create Market</Button>}
              title="Minta market maker membentuk market?"
              impact={<>Demand gabungan {qty(t.total)} dari {t.businesses} bisnis dikirim ke market maker. Saat market terbentuk, supplier bersaing di harga sekitar <b>{formatIdr(t.unitPriceIdr)}/{unit}</b>. Pool dikunci selama menunggu.</>}
              confirmLabel="Kirim permintaan"
              onConfirm={() => act.mutateAsync({ id: pool.id, type: 'market' }).then(() => toast({ title: 'Permintaan market terkirim', tone: 'green' }))}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">Butuh {qty(pool.thresholdQty - t.total)} lagi untuk bisa membentuk market sendiri.</p>
        )}
        {t.mine > 0 && pool.status === 'open' && (
          <ConfirmDialog trigger={<Button variant="ghost" className="h-9">Keluar dari pool</Button>} title="Keluar dari pool?" destructive confirmLabel="Keluar"
            impact={`Demand ${qty(t.mine)} ditarik; proyeksi harga untuk peserta lain naik. Procurement terkait kembali ke status Approved.`}
            onConfirm={() => act.mutateAsync({ id: pool.id, type: 'leave' })} />
        )}
      </div>
      <FormError error={act.error} />
    </Section>
  )
}

export function CollectivePage() {
  const access = useOrgAccess()
  const query = usePools()
  const [params, setParams] = useSearchParams()
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const category = params.get('category') ?? ''
  const region = params.get('region') ?? ''
  const all = params.get('all') === '1'
  const joinDeny = access.deny('collective', 'create')
  return (
    <>
      <PageHeader
        title="Collective procurement"
        description="Gabungkan demand dengan bisnis lain untuk harga skala. Identitas bisnis lain hanya tampil jika mereka mengizinkan."
        icon={UsersRound}
        tone="blue"
        actions={<GuardedButton className="h-9" reason={joinDeny} onClick={() => set('dialog', 'create')}><Plus /> Buat pool</GuardedButton>}
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} empty={<EmptyState icon={UsersRound} title="Belum ada pool" />}>
        {(list) => {
          const visible = list.filter((p) => (all || p.match) && (!category || p.categoryId === category) && (!region || p.region === region))
          const selected = list.find((p) => p.id === params.get('pool')) ?? list.find((p) => p.members.some((m) => m.mine)) ?? visible[0]
          const joining = list.find((p) => p.id === params.get('join'))
          return (
            <div className="flex flex-col gap-6">
              {selected && <Aggregation key={selected.id} pool={selected} marketDeny={access.deny('collective', 'manage')} onJoin={() => set('join', selected.id)} />}

              <section>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <h2 className="font-medium sm:mr-auto">Pool yang cocok</h2>
                  <select aria-label="Kategori" className={selectClass} value={category} onChange={(e) => set('category', e.target.value || null)}>
                    <option value="">Semua kategori</option>
                    {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </select>
                  <select aria-label="Wilayah" className={selectClass} value={region} onChange={(e) => set('region', e.target.value || null)}>
                    <option value="">Semua wilayah</option>
                    {REGIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={all} onChange={(e) => set('all', e.target.checked ? '1' : null)} /> Di luar kategori bisnis</label>
                </div>
                {visible.length ? (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {visible.map((p) => {
                      const t = poolTotals(p)
                      return (
                        <li key={p.id} className={cn('flex flex-col rounded-xl border bg-card p-4', selected?.id === p.id && 'border-primary')}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <CategoryTag id={p.categoryId} />
                            {t.mine > 0 && <Tag tone="blue">Kamu ikut</Tag>}
                            {p.status === 'market_requested' && <Tag tone="yellow">Menunggu market</Tag>}
                            {p.status === 'market_live' && <Tag tone="teal">Market live</Tag>}
                            {p.status === 'settled' && <Tag tone="green">Settled</Tag>}
                            {t.ready && p.status === 'open' && <Tag tone="green">Siap jadi market</Tag>}
                          </div>
                          <h3 className="mt-2 font-medium">{p.title}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">{p.spec}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{p.region}</span><span>Deadline {formatDate(p.deadline)}</span></p>
                          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Demand</dt><dd className="num font-semibold">{formatQty({ value: t.total, unit: p.unit }, { compact: true })}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Bisnis</dt><dd className="num font-semibold">{t.businesses}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Proyeksi</dt><dd className="num font-semibold">{formatIdr(t.unitPriceIdr, { compact: true })}</dd></div>
                          </dl>
                          <div className="mt-auto flex flex-wrap gap-2 pt-4">
                            <Button variant="outline" size="sm" onClick={() => set('pool', p.id)}>Lihat agregasi</Button>
                            {p.status === 'open' && <GuardedButton size="sm" reason={joinDeny} onClick={() => set('join', p.id)}>{t.mine ? 'Ubah demand' : 'Join pool'}</GuardedButton>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <EmptyState title="Tidak ada pool yang cocok" description="Buat pool baru supaya bisnis lain dengan kebutuhan serupa bisa bergabung." action={<GuardedButton reason={joinDeny} onClick={() => set('dialog', 'create')}><Plus /> Buat pool</GuardedButton>} />
                )}
              </section>
              {joining && !joinDeny && <JoinDialog pool={joining} onClose={() => set('join', null)} />}
            </div>
          )
        }}
      </AsyncView>
      {params.get('dialog') === 'create' && !joinDeny && (
        <CreatePoolDialog onClose={() => set('dialog', null)} onCreated={(id) => setParams((p) => (p.delete('dialog'), p.set('pool', id), p), { replace: true })} />
      )}
    </>
  )
}
