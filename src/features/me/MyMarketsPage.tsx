import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BellRing, LogOut, Store } from 'lucide-react'
import type { MyMarket } from '@/domain/types'
import { MECHANISMS } from '@/domain/catalog'
import { formatIdr, formatNumber } from '@/domain/format'
import { toast } from '@/stores/toast'
import { useListingAction, useListings, useMarketAction, useMyMarkets } from './hooks'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Submit an existing supply/demand listing into a market (PRD §8.7). */
function SubmitDialog({ m, kind, onClose }: { m: MyMarket; kind: 'supply' | 'demand'; onClose: () => void }) {
  const listings = useListings(kind)
  const options = (listings.data ?? []).filter((l) => l.categoryId === m.categoryId && ['available', 'open', 'matched'].includes(l.status))
  const [id, setId] = useState('')
  const action = useListingAction(id)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit {kind} ke {m.name}</DialogTitle>
          <DialogDescription>Listing ikut round berikutnya dan terlihat oleh peserta market.</DialogDescription>
        </DialogHeader>
        <SelectField label={`Pilih ${kind}`} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">{options.length ? 'Pilih listing' : 'Belum ada listing yang cocok di kategori ini'}</option>
          {options.map((l) => <option key={l.id} value={l.id}>{l.item}</option>)}
        </SelectField>
        <Link to={`/app/${kind}/new`} className="text-sm font-medium text-primary hover:underline">Buat {kind} baru</Link>
        <FormError error={action.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!id || action.isPending} onClick={() => action.mutate({ type: 'market', marketId: m.id }, { onSuccess: () => { toast({ title: `Listing masuk ke ${m.name}`, tone: 'green' }); onClose() } })}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WatchDialog({ m, onClose }: { m: MyMarket; onClose: () => void }) {
  const action = useMarketAction()
  const [price, setPrice] = useState(String(m.watchPriceIdr ?? Math.round((m.priceRange.minIdr + m.priceRange.maxIdr) / 2)))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pantau harga {m.name}</DialogTitle>
          <DialogDescription>Kami kirim notifikasi saat median harga melewati angka ini. Rentang 30 hari: {formatIdr(m.priceRange.minIdr)}–{formatIdr(m.priceRange.maxIdr)}.</DialogDescription>
        </DialogHeader>
        <Field label={`Harga per ${m.priceRange.unit} (Rp)`} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        <DialogFooter>
          {m.watchPriceIdr && <Button variant="ghost" onClick={() => action.mutate({ type: 'watch', id: m.id }, { onSuccess: onClose })}>Hapus alert</Button>}
          <Button disabled={!(Number(price) > 0)} onClick={() => action.mutate({ type: 'watch', id: m.id, priceIdr: Number(price) }, { onSuccess: () => { toast({ title: 'Alert harga disimpan', tone: 'blue' }); onClose() } })}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MyMarketsPage() {
  const query = useMyMarkets()
  const action = useMarketAction()
  const [params, setParams] = useSearchParams()
  const [scope, setScope] = useState<'joined' | 'browse'>('joined')
  // Dialogs are URL state (?supply= / ?demand= / ?watch=<marketId>), so public "Submit" buttons land in them.
  const dialog = (['supply', 'demand', 'watch'] as const)
    .map((type) => ({ type, m: query.data?.find((m) => m.id === params.get(type)) }))
    .find((d): d is { type: 'supply' | 'demand' | 'watch'; m: MyMarket } => !!d.m)
  const open = (type: string, id: string) => setParams({ [type]: id }, { replace: true })
  const close = () => setParams({}, { replace: true })

  const joinId = params.get('join')
  useEffect(() => {
    if (!joinId) return
    action.mutate({ type: 'join', id: joinId }, { onSuccess: () => toast({ title: 'Bergabung ke market', tone: 'green' }) })
    setParams({}, { replace: true })
  }, [joinId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title="Markets"
        description="Market yang kamu ikuti, plus market lain yang bisa kamu masuki."
        icon={Store}
        tone="blue"
        actions={<Segmented label="Cakupan" value={scope} options={[['joined', 'Diikuti'], ['browse', 'Jelajah']]} onChange={setScope} />}
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />}>
        {(all) => {
          const rows = scope === 'joined' ? all.filter((m) => m.joined) : all.filter((m) => !m.joined)
          if (!rows.length)
            return (
              <EmptyState
                icon={Store}
                tone="blue"
                title={scope === 'joined' ? 'Belum mengikuti market' : 'Semua market sudah kamu ikuti'}
                action={scope === 'joined' && <Button onClick={() => setScope('browse')}>Jelajah market</Button>}
              />
            )
          return (
            <DataTable
              caption="Market"
              rows={rows}
              rowKey={(m) => m.id}
              rowHref={(m) => `/markets/${m.id}`}
              initialSort={{ key: 'volume', dir: 'desc' }}
              columns={[
                {
                  key: 'name', header: 'Market', primary: true, sortValue: (m) => m.name,
                  cell: (m) => <span>{m.name} {m.approval === 'pending' && <Tag tone="yellow">Menunggu approval</Tag>}{m.approval === 'suspended' && <Tag tone="red">Disuspend</Tag>}</span>,
                },
                { key: 'cat', header: 'Kategori', cell: (m) => <CategoryTag id={m.categoryId} /> },
                { key: 'mech', header: 'Mekanisme', cell: (m) => <span className="text-muted-foreground">{MECHANISMS[m.mechanism].label}</span> },
                { key: 'price', header: 'Harga', align: 'right', cell: (m) => `${formatNumber(m.priceRange.minIdr, { compact: true })}–${formatNumber(m.priceRange.maxIdr, { compact: true })}`, sortValue: (m) => m.priceRange.minIdr },
                { key: 'volume', header: 'Volume 30h', align: 'right', cell: (m) => formatIdr(m.volume30dIdr, { compact: true }), sortValue: (m) => m.volume30dIdr },
                { key: 'status', header: 'Status', cell: (m) => <StatusBadge entity="market" status={m.status} /> },
                {
                  key: 'actions', header: 'Aksi',
                  cell: (m) => (
                    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                      {m.joined ? (
                        <>
                          <Button size="xs" variant="outline" onClick={() => open('supply', m.id)}>Supply</Button>
                          <Button size="xs" variant="outline" onClick={() => open('demand', m.id)}>Demand</Button>
                          <Button size="xs" variant="ghost" aria-label={`Pantau harga ${m.name}`} onClick={() => open('watch', m.id)}>
                            <BellRing className={m.watchPriceIdr ? 'text-primary' : undefined} />
                          </Button>
                          <Button size="xs" variant="ghost" aria-label={`Keluar dari ${m.name}`} onClick={() => action.mutate({ type: 'leave', id: m.id })}><LogOut /></Button>
                        </>
                      ) : (
                        <Button size="xs" onClick={() => action.mutate({ type: 'join', id: m.id }, { onSuccess: () => toast({ title: `Bergabung ke ${m.name}`, tone: 'green' }) })}>Join</Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )
        }}
      </AsyncView>
      {dialog && (dialog.type === 'watch' ? <WatchDialog m={dialog.m} onClose={close} /> : <SubmitDialog m={dialog.m} kind={dialog.type} onClose={close} />)}
    </>
  )
}
