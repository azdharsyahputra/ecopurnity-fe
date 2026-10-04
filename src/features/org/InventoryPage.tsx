import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Download, Factory, FileUp, Plus, Truck, Warehouse } from 'lucide-react'
import type { CategoryId } from '@/domain/types'
import { INVENTORY_CSV_HEADER, inventoryFromCsv, parseCsv, type InventoryData, type InventoryItem } from '@/domain/org'
import { CATEGORIES } from '@/domain/catalog'
import { formatDate, formatNumber, formatPercent, formatQty } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useAddItem, useAddSchedule, useImportItems, useInventory, useOrgAccess } from './hooks'
import { downloadCsv, fromDate, inDays, toDate } from './utils'
import { FilterPills, GuardedButton, Section } from './ui'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { Tag } from '@/components/Tag'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const CATS = Object.keys(CATEGORIES) as CategoryId[]

function AddItemDialog({ warehouses, onClose }: { warehouses: string[]; onClose: () => void }) {
  const add = useAddItem()
  const [f, setF] = useState({ sku: '', name: '', categoryId: 'packaging' as CategoryId, warehouse: warehouses[0] ?? 'Gudang utama', qty: '', unit: 'pcs', moq: '', lead: '', spec: '' })
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Tambah item inventory</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama item" value={f.name} onChange={(e) => set('name', e.target.value)} error={fieldError(add.error, 'name')} />
          <Field label="SKU" value={f.sku} onChange={(e) => set('sku', e.target.value)} />
          <SelectField label="Kategori" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {CATS.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
          </SelectField>
          <Field label="Gudang" list="org-warehouses" value={f.warehouse} onChange={(e) => set('warehouse', e.target.value)} />
          <datalist id="org-warehouses">{warehouses.map((w) => <option key={w} value={w} />)}</datalist>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Field label="Jumlah" type="number" min={0} value={f.qty} onChange={(e) => set('qty', e.target.value)} error={fieldError(add.error, 'quantity')} />
            <Field label="Satuan" value={f.unit} onChange={(e) => set('unit', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="MOQ" type="number" min={0} value={f.moq} onChange={(e) => set('moq', e.target.value)} />
            <Field label="Lead time (hari)" type="number" min={0} value={f.lead} onChange={(e) => set('lead', e.target.value)} />
          </div>
          <div className="sm:col-span-2"><Field label="Spesifikasi kualitas" value={f.spec} onChange={(e) => set('spec', e.target.value)} /></div>
        </div>
        <FormError error={add.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={add.isPending} onClick={() => add.mutate(
            { sku: f.sku || `SKU-${Date.now().toString(36).toUpperCase()}`, name: f.name, categoryId: f.categoryId, warehouse: f.warehouse, quantity: { value: f.qty === '' ? NaN : Number(f.qty), unit: f.unit }, moq: Number(f.moq) || 0, leadTimeDays: Number(f.lead) || 0, qualitySpec: f.spec },
            { onSuccess: () => { toast({ title: 'Item ditambahkan', body: f.name, tone: 'green' }); onClose() } },
          )}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const imp = useImportItems()
  const [file, setFile] = useState<{ name: string; items: Omit<InventoryItem, 'id'>[]; errors: string[] } | null>(null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import inventory dari CSV</DialogTitle>
          <DialogDescription>
            Kolom: {INVENTORY_CSV_HEADER.join(', ')}. Kategori memakai kode ({CATS.join(', ')}).{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => downloadCsv('template-inventory.csv', [INVENTORY_CSV_HEADER, ['KRF-150', 'Kertas kraft liner 150 gsm', 'packaging', 'Gudang utama', 10, 'ton', 5, 7, 'RCT ≥ 1,6 kN/m']])}>Unduh template</button>
          </DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-hover has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <FileUp className="size-5 text-muted-foreground" />
          <span className="flex-1 truncate">{file?.name ?? 'Pilih file .csv'}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const parsed = inventoryFromCsv(parseCsv(await f.text()), CATS)
            setFile({ name: f.name, ...parsed })
          }} />
        </label>
        {file && (
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-sm"><b className="num">{file.items.length}</b> item siap diimpor{file.errors.length > 0 && <>, <span className="text-destructive">{file.errors.length} baris dilewati</span></>}.</p>
            {file.errors.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{file.errors.slice(0, 5).map((er) => <li key={er}>{er}</li>)}</ul>}
            {file.items.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Pratinjau import</caption>
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Gudang</th><th className="px-3 py-2 text-right font-medium">Jumlah</th></tr></thead>
                  <tbody className="divide-y">
                    {file.items.map((i) => <tr key={i.sku + i.name}><td className="px-3 py-1.5">{i.name} <span className="text-xs text-muted-foreground">{i.sku}</span></td><td className="px-3 py-1.5">{i.warehouse}</td><td className="num px-3 py-1.5 text-right">{formatQty(i.quantity)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <FormError error={imp.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!file?.items.length || imp.isPending} onClick={() => imp.mutate({ items: file!.items, fileName: file!.name }, { onSuccess: (r) => { toast({ title: `${r.imported} item diimpor`, tone: 'green' }); onClose() } })}>
            {imp.isPending ? 'Mengimpor…' : `Tambahkan ${file?.items.length ?? 0} item`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const add = useAddSchedule()
  const [f, setF] = useState({ item: '', qty: '', unit: 'pcs', every: 'monthly' as 'weekly' | 'monthly', direction: 'in' as 'in' | 'out', counterparty: '', next: toDate(inDays(7)) })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Jadwal pasokan rutin</DialogTitle><DialogDescription>Pasokan masuk dari supplier atau pengiriman rutin ke pelanggan.</DialogDescription></DialogHeader>
        <Segmented label="Arah" value={f.direction} options={[['in', 'Pasokan masuk'], ['out', 'Kirim ke pelanggan']]} onChange={(v) => setF({ ...f, direction: v })} />
        <Field label="Item" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} error={fieldError(add.error, 'item')} />
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Jumlah per kirim" type="number" min={0} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} error={fieldError(add.error, 'quantity')} />
          <Field label="Satuan" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Frekuensi" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as 'weekly' | 'monthly' })}><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></SelectField>
          <Field label="Kirim berikutnya" type="date" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </div>
        <Field label={f.direction === 'in' ? 'Supplier' : 'Pelanggan'} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} />
        <FormError error={add.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={add.isPending} onClick={() => add.mutate({ item: f.item, quantity: { value: Number(f.qty), unit: f.unit }, every: f.every, direction: f.direction, counterparty: f.counterparty, nextAt: fromDate(f.next) }, { onSuccess: () => { toast({ title: 'Jadwal ditambahkan', tone: 'green' }); onClose() } })}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Body({ inv }: { inv: InventoryData }) {
  const [params, setParams] = useSearchParams()
  const wh = params.get('warehouse') ?? ''
  const rows = wh ? inv.items.filter((i) => i.warehouse === wh) : inv.items
  const whs = [...new Set([...inv.warehouses.map((w) => w.name), ...inv.items.map((i) => i.warehouse)])]
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="sr-only">Stok per gudang</h2>
        <FilterPills label="Gudang" value={wh} onChange={(v) => setParams((p) => (v ? p.set('warehouse', v) : p.delete('warehouse'), p), { replace: true })}
          options={[['', 'Semua gudang', inv.items.length], ...whs.map((w) => [w, w, inv.items.filter((i) => i.warehouse === w).length] as [string, string, number])]} />
        {rows.length ? (
          <DataTable
            caption="Inventory"
            rows={rows}
            rowKey={(i) => i.id}
            initialSort={{ key: 'item', dir: 'asc' }}
            columns={[
              { key: 'item', header: 'Item', primary: true, cell: (i) => <span>{i.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{i.sku}</span></span>, sortValue: (i) => i.name },
              { key: 'cat', header: 'Kategori', cell: (i) => <CategoryTag id={i.categoryId} /> },
              { key: 'wh', header: 'Gudang', cell: (i) => i.warehouse },
              { key: 'qty', header: 'Stok', align: 'right', cell: (i) => <span style={i.moq && i.quantity.value < i.moq ? { color: 'var(--tag-red-fg)' } : undefined}>{formatQty(i.quantity, { compact: true })}</span>, sortValue: (i) => i.quantity.value },
              { key: 'moq', header: 'MOQ', align: 'right', cell: (i) => (i.moq ? formatNumber(i.moq) : '—') },
              { key: 'lead', header: 'Lead time', align: 'right', cell: (i) => `${i.leadTimeDays} hari`, sortValue: (i) => i.leadTimeDays },
              { key: 'spec', header: 'Spesifikasi', cell: (i) => <span className="text-muted-foreground">{i.qualitySpec || '—'}</span> },
            ]}
          />
        ) : <EmptyState icon={Warehouse} title="Belum ada item di gudang ini" />}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Kapasitas produksi">
          {inv.capacity.length ? (
            <ul className="flex flex-col gap-3 text-sm">
              {inv.capacity.map((c) => (
                <li key={c.line}>
                  <div className="flex justify-between gap-2"><span className="truncate">{c.line}</span><span className="num shrink-0 text-muted-foreground">{formatQty(c.outputPerMonth, { compact: true })}/bln</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.utilization * 100)} aria-label={`Utilisasi ${c.line}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${c.utilization * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Utilisasi {formatPercent(c.utilization)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Belum ada lini produksi.</p>}
        </Section>
        <Section title="Logistik">
          <ul className="flex flex-col gap-2 text-sm">
            {inv.logistics.fleet.map((f) => <li key={f.type} className="flex items-center gap-2"><Truck className="size-4 text-muted-foreground" /><span className="flex-1">{f.type}</span><span className="num">{f.count} × {f.capacity}</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Wilayah layanan</p>
          <div className="mt-1 flex flex-wrap gap-1">{inv.logistics.regions.map((r) => <Tag key={r} tone="blue">{r}</Tag>)}</div>
          <p className="mt-3 text-xs text-muted-foreground">Gudang</p>
          <ul className="mt-1 text-sm">{inv.warehouses.map((w) => <li key={w.name} className="flex justify-between gap-2"><span className="truncate">{w.name}</span><span className="num shrink-0 text-muted-foreground">{formatNumber(w.capacityM2)} m²</span></li>)}</ul>
        </Section>
        <Section title="Jadwal pasokan rutin">
          {inv.schedules.length ? (
            <ul className="divide-y text-sm">
              {inv.schedules.map((s) => (
                <li key={s.id} className="flex items-start gap-2 py-2">
                  {s.direction === 'in' ? <ArrowDownLeft className="mt-0.5 size-4 text-primary" aria-label="Masuk" /> : <ArrowUpRight className="mt-0.5 size-4" style={{ color: 'var(--tag-orange-fg)' }} aria-label="Keluar" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.item}</p>
                    <p className="text-xs text-muted-foreground">{formatQty(s.quantity)} · {s.every === 'weekly' ? 'mingguan' : 'bulanan'} · {s.counterparty || '—'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(s.nextAt)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Belum ada jadwal rutin.</p>}
        </Section>
      </div>
    </div>
  )
}

export function InventoryPage() {
  const access = useOrgAccess()
  const query = useInventory()
  const [params, setParams] = useSearchParams()
  const dialog = params.get('dialog')
  const open = (v: string | null) => setParams((p) => (v ? p.set('dialog', v) : p.delete('dialog'), p), { replace: true })
  const createDeny = access.deny('inventory', 'create')
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stok per gudang, kapasitas produksi, logistik, dan pasokan rutin."
        icon={Warehouse}
        tone="blue"
        featured
        actions={
          <>
            <GuardedButton variant="outline" className="h-9" reason={createDeny} onClick={() => open('import')}><FileUp /> Import CSV</GuardedButton>
            <GuardedButton variant="outline" className="h-9" reason={access.deny('inventory', 'manage')} onClick={() => open('schedule')}><CalendarClock /> Jadwal rutin</GuardedButton>
            <GuardedButton className="h-9" reason={createDeny} onClick={() => open('add')}><Plus /> Tambah item</GuardedButton>
          </>
        }
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}
        isEmpty={(d) => !d.items.length && !d.capacity.length}
        empty={<EmptyState icon={Factory} tone="blue" title="Inventory masih kosong" description="Tambah item satu per satu atau import dari spreadsheet." action={<Button onClick={() => open('import')} disabled={!!createDeny}><Download /> Import CSV</Button>} />}
      >
        {(inv) => <Body inv={inv} />}
      </AsyncView>
      {/* Outside AsyncView: the first item is added from the empty state too. */}
      {dialog === 'add' && !createDeny && query.data && <AddItemDialog warehouses={query.data.warehouses.map((w) => w.name)} onClose={() => open(null)} />}
      {dialog === 'import' && !createDeny && <ImportDialog onClose={() => open(null)} />}
      {dialog === 'schedule' && !access.deny('inventory', 'manage') && <ScheduleDialog onClose={() => open(null)} />}
    </>
  )
}
