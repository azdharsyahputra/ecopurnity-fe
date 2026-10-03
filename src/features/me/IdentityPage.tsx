import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Boxes, CircleDashed, Clock, IdCard, Package, Plus, Trash2, Wrench, Zap, type LucideIcon } from 'lucide-react'
import type { CapacityKind, CategoryId, Identity } from '@/domain/types'
import type { Tone } from '@/domain/status'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatPercent } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useIdentity, useSaveIdentity } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { IconChip } from '@/components/IconChip'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Field, FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const KINDS: [CapacityKind, LucideIcon, Tone, string, string, string][] = [
  ['skill', Wrench, 'purple', 'Skills', 'mis. Backend Go', 'Level, mis. Mahir'],
  ['asset', Package, 'blue', 'Assets', 'mis. Truk engkel', 'Detail, mis. 1 unit, 2 ton'],
  ['capacity', Zap, 'lime', 'Capacity', 'mis. Produksi kemasan', 'mis. 500 unit/bulan'],
  ['resource', Boxes, 'orange', 'Resources', 'mis. Stok green bean', 'mis. 500 kg'],
]
const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const TABS = ['profile', 'capacity', 'preferences', 'verification'] as const
const TAB_LABEL = { profile: 'Profil', capacity: 'Kapasitas', preferences: 'Preferensi', verification: 'Verifikasi' }

function Editor({ initial }: { initial: Identity }) {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as (typeof TABS)[number]) || 'profile'
  const [d, setD] = useState(initial)
  const save = useSaveIdentity()
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const [draft, setDraft] = useState<Record<CapacityKind, { name: string; detail: string }>>({ skill: { name: '', detail: '' }, asset: { name: '', detail: '' }, capacity: { name: '', detail: '' }, resource: { name: '', detail: '' } })
  const profile = (k: keyof Identity['profile'], v: string) => setD({ ...d, profile: { ...d.profile, [k]: v } })
  const prefs = (patch: Partial<Identity['preferences']>) => setD({ ...d, preferences: { ...d.preferences, ...patch } })

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: String(v) }, { replace: true })}>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <TabsList>{TABS.map((t) => <TabsTrigger key={t} value={t} className="px-3">{TAB_LABEL[t]}</TabsTrigger>)}</TabsList>
        </div>
      </Tabs>

      <div className="mt-6">
        {tab === 'profile' && (
          <section className="grid gap-6 md:grid-cols-[1fr_16rem]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama" value={d.profile.name} onChange={(e) => profile('name', e.target.value)} error={fieldError(save.error, 'name')} />
              <Field label="Username" value={d.profile.username} onChange={(e) => profile('username', e.target.value)} hint={`ecopurnity.id/u/${d.profile.username}`} />
              <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                Lokasi
                <select value={d.profile.location} onChange={(e) => profile('location', e.target.value)} className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30">
                  <option value="">Pilih wilayah</option>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2">
                <TextareaField label="Bio" rows={4} value={d.profile.bio} onChange={(e) => profile('bio', e.target.value)} hint="Ceritakan apa yang kamu kerjakan dan cari." />
              </div>
            </div>
            <aside className="rounded-xl border bg-card p-4 text-sm">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pratinjau publik</p>
              <div className="mt-3 flex items-center gap-3">
                <EntityAvatar name={d.profile.name || '?'} verified={d.profile.verification.identity === 'verified'} size={40} />
                <div className="min-w-0"><p className="truncate font-medium">{d.profile.name}</p><p className="truncate text-muted-foreground">@{d.profile.username} · {d.profile.location || '—'}</p></div>
              </div>
              <p className="mt-3 text-muted-foreground">{d.profile.bio || 'Belum ada bio.'}</p>
              <Link to={`/u/${d.profile.username}`} className="mt-3 inline-block text-primary hover:underline">Lihat profil publik</Link>
            </aside>
          </section>
        )}

        {tab === 'capacity' && (
          <div className="grid gap-4 md:grid-cols-2">
            {KINDS.map(([kind, icon, tone, title, ph, phDetail]) => (
              <section key={kind} className="rounded-xl border bg-card p-4">
                <h2 className="flex items-center gap-2 font-medium"><IconChip icon={icon} tone={tone} size="sm" /> {title}</h2>
                <ul className="mt-3 divide-y">
                  {d.items.filter((i) => i.kind === kind).map((i) => (
                    <li key={i.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="font-medium">{i.name}</span> <span className="text-muted-foreground">· {i.detail}</span></span>
                      <Button variant="ghost" size="icon-xs" aria-label={`Hapus ${i.name}`} onClick={() => setD({ ...d, items: d.items.filter((x) => x.id !== i.id) })}><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!draft[kind].name.trim()) return
                    setD({ ...d, items: [...d.items, { id: `cap-${Date.now()}`, kind, ...draft[kind] }] })
                    setDraft({ ...draft, [kind]: { name: '', detail: '' } })
                  }}
                >
                  <input aria-label={`${title} baru`} placeholder={ph} value={draft[kind].name} onChange={(e) => setDraft({ ...draft, [kind]: { ...draft[kind], name: e.target.value } })} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm" />
                  <input aria-label={`Detail ${title}`} placeholder={phDetail} value={draft[kind].detail} onChange={(e) => setDraft({ ...draft, [kind]: { ...draft[kind], detail: e.target.value } })} className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-sm" />
                  <Button type="submit" size="icon-sm" variant="outline" aria-label={`Tambah ${title}`}><Plus /></Button>
                </form>
              </section>
            ))}
            <section className="rounded-xl border bg-card p-4 md:col-span-2">
              <h2 className="flex items-center gap-2 font-medium"><IconChip icon={Clock} tone="teal" size="sm" /> Availability</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex gap-1" role="group" aria-label="Hari tersedia">
                  {DAYS.map((day, i) => {
                    const on = d.availability.days.includes(i)
                    return (
                      <button key={day} type="button" aria-pressed={on} onClick={() => setD({ ...d, availability: { ...d.availability, days: on ? d.availability.days.filter((x) => x !== i) : [...d.availability.days, i].sort() } })}
                        className={cn('size-9 rounded-lg border text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-hover')}>{day}</button>
                    )
                  })}
                </div>
                <label className="flex items-center gap-2 text-sm">Dari <input type="time" value={d.availability.from} onChange={(e) => setD({ ...d, availability: { ...d.availability, from: e.target.value } })} className="h-9 rounded-md border border-input bg-transparent px-2" /></label>
                <label className="flex items-center gap-2 text-sm">sampai <input type="time" value={d.availability.to} onChange={(e) => setD({ ...d, availability: { ...d.availability, to: e.target.value } })} className="h-9 rounded-md border border-input bg-transparent px-2" /></label>
              </div>
            </section>
          </div>
        )}

        {tab === 'preferences' && (
          <div className="grid max-w-2xl gap-6">
            <div>
              <p className="text-sm font-medium">Kategori</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => {
                  const on = d.preferences.categories.includes(c)
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => prefs({ categories: on ? d.preferences.categories.filter((x) => x !== c) : [...d.preferences.categories, c] })}
                      className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-transparent font-medium' : 'text-muted-foreground hover:bg-hover')}
                      style={on ? { background: `var(--tag-${CATEGORIES[c].tone}-bg)`, color: `var(--tag-${CATEGORIES[c].tone}-fg)` } : undefined}>{CATEGORIES[c].label}</button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Lokasi preferensi</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGIONS.map((r) => {
                  const on = d.preferences.locations.includes(r)
                  return <button key={r} type="button" aria-pressed={on} onClick={() => prefs({ locations: on ? d.preferences.locations.filter((x) => x !== r) : [...d.preferences.locations, r] })} className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-hover')}>{r}</button>
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Harga minimum (Rp)" type="number" min={0} value={d.preferences.minPriceIdr ?? ''} onChange={(e) => prefs({ minPriceIdr: e.target.value ? Number(e.target.value) : undefined })} />
              <Field label="Budget maksimum (Rp)" type="number" min={0} value={d.preferences.maxBudgetIdr ?? ''} onChange={(e) => prefs({ maxBudgetIdr: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span className="flex justify-between">Radius pengiriman <span className="num text-muted-foreground">{d.preferences.deliveryRadiusKm} km</span></span>
              <input type="range" min={5} max={300} step={5} value={d.preferences.deliveryRadiusKm} onChange={(e) => prefs({ deliveryRadiusKm: Number(e.target.value) })} className="accent-primary" />
            </label>
          </div>
        )}

        {tab === 'verification' && (
          <ul className="grid max-w-2xl gap-3">
            {([
              ['Email', d.profile.verification.email, 'Diverifikasi lewat link email'],
              ['Nomor HP', d.profile.verification.phone, 'Kode OTP ke WhatsApp/SMS'],
              ['Identitas (KTP)', d.profile.verification.identity === 'verified', d.profile.verification.identity === 'pending' ? 'Sedang ditinjau' : 'Foto KTP + selfie; wajib untuk transaksi besar'],
            ] as const).map(([label, ok, detail]) => (
              <li key={label} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <IconChip icon={ok ? BadgeCheck : CircleDashed} tone={ok ? 'green' : 'gray'} />
                <div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground">{detail}</p></div>
                {ok ? <span className="text-sm font-medium" style={{ color: 'var(--tag-green-fg)' }}>Terverifikasi</span> : (
                  <Button variant="outline" className="h-8" onClick={() => toast({ title: `Verifikasi ${label.toLowerCase()} dibuka`, body: 'Alur verifikasi nyata menyambung ke provider KYC/OTP saat backend siap.' })}>Verifikasi</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn('sticky bottom-0 z-10 -mx-4 mt-8 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-10 md:px-10', !dirty && 'hidden')}>
        <FormError error={save.error} />
        <p className="flex-1 text-sm text-muted-foreground">Ada perubahan yang belum disimpan.</p>
        <Button variant="ghost" onClick={() => setD(initial)}>Batal</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate(d, { onSuccess: () => toast({ title: 'Identitas disimpan', tone: 'green' }) })}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
      </div>
    </>
  )
}

export function IdentityPage() {
  const query = useIdentity()
  return (
    <>
      <PageHeader
        title="Economic Identity"
        description={query.data ? `Profil ${formatPercent(query.data.completeness)} lengkap. Dipakai engine untuk mencocokkan opportunity dan oleh market untuk kualifikasi.` : undefined}
        icon={IdCard}
        tone="teal"
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-80 rounded-xl" />}>
        {(i) => <Editor key={JSON.stringify(i)} initial={i} />}
      </AsyncView>
    </>
  )
}
