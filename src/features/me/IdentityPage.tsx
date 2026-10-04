import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Boxes, CircleDashed, Clock, IdCard, Package, Plus, Trash2, Wrench, Zap, type LucideIcon } from 'lucide-react'
import type { CapacityKind, CategoryId, Identity } from '@/domain/types'
import type { Tone } from '@/domain/status'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatIdr, formatPercent } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useIdentity, useKyc, useKycAction, useSaveIdentity } from './hooks'
import { uploadFile, uploadErrorMessage } from '@/lib/upload'
import { KYC_LEVELS, type KycLevel } from '@/domain/kyc'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { IconChip } from '@/components/IconChip'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Field, FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const KINDS: [CapacityKind, LucideIcon, Tone, string, string, string][] = [
  ['skill', Wrench, 'purple', 'Skills', 'mis. Backend Go', 'Level, mis. Mahir'],
  ['asset', Package, 'blue', 'Assets', 'mis. Truk engkel', 'Detail, mis. 1 unit, 2 ton'],
  ['capacity', Zap, 'lime', 'Capacity', 'mis. Produksi kemasan', 'mis. 500 unit/bulan'],
  ['resource', Boxes, 'orange', 'Resources', 'mis. Stok green bean', 'mis. 500 kg'],
]
const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const TABS = ['profile', 'capacity', 'preferences', 'verification'] as const
const TAB_LABEL = { profile: 'Profil', capacity: 'Kapasitas', preferences: 'Preferensi', verification: 'Verifikasi' }
type ItemDraft = { name: string; detail: string; categoryId: CategoryId | '' }
const blankItem = (): ItemDraft => ({ name: '', detail: '', categoryId: '' })
const selectClass = 'h-9 rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30'


function CategorySelect({ label, value, onChange, className }: { label: string; value: CategoryId | ''; onChange: (v: CategoryId | '') => void; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as CategoryId | '')} className={cn(selectClass, className)}>
      <option value="">Kategori…</option>
      {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
    </select>
  )
}

function IdentityDialog({ onClose }: { onClose: () => void }) {
  const act = useKycAction()
  const [f, setF] = useState({ nik: '', fullName: '' })
  const [files, setFiles] = useState<{ ktp?: File; selfie?: File }>({})
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<{ ktp?: string; selfie?: string }>({})
  const pick = (k: 'ktp' | 'selfie') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles({ ...files, [k]: e.target.files?.[0] })
    setUploadErr({ ...uploadErr, [k]: undefined })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.ktp || !files.selfie) {
      setUploadErr({ ktp: files.ktp ? undefined : 'Unggah foto KTP', selfie: files.selfie ? undefined : 'Unggah selfie dengan KTP' })
      return
    }
    setUploading(true)
    const [ktp, selfie] = await Promise.allSettled([uploadFile(files.ktp, 'kyc_ktp'), uploadFile(files.selfie, 'kyc_selfie')])
    setUploading(false)
    if (ktp.status === 'rejected' || selfie.status === 'rejected') {
      setUploadErr({
        ktp: ktp.status === 'rejected' ? uploadErrorMessage(ktp.reason) : undefined,
        selfie: selfie.status === 'rejected' ? uploadErrorMessage(selfie.reason) : undefined,
      })
      return
    }
    act.mutate(
      { type: 'identity', ...f, ktpUploadId: ktp.value, selfieUploadId: selfie.value },
      { onSuccess: () => { toast({ title: 'KTP diajukan', body: 'Kami kabari lewat notifikasi setelah ditinjau.', tone: 'green' }); onClose() } },
    )
  }

  const busy = uploading || act.isPending
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verifikasi KTP</DialogTitle>
          <DialogDescription>Ditinjau tim governance, biasanya kurang dari 1 hari kerja. Dokumen disimpan terenkripsi dan hanya dipakai untuk verifikasi.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 rounded-2xl border bg-muted/20 p-4 sm:p-5" onSubmit={submit}>
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">Siapkan data sesuai KTP. File hanya digunakan untuk proses verifikasi identitas.</div>
          <Field label="NIK" inputMode="numeric" maxLength={16} value={f.nik} onChange={(e) => setF({ ...f, nik: e.target.value.replace(/\D/g, '') })} error={fieldError(act.error, 'nik')} />
          <Field label="Nama lengkap sesuai KTP" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={fieldError(act.error, 'fullName')} />
          <Field label="Foto KTP" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick('ktp')}
            error={uploadErr.ktp ?? fieldError(act.error, 'ktpUploadId')} hint="JPG, PNG, atau WebP, maks. 8 MB" />
          <Field label="Selfie memegang KTP" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={pick('selfie')}
            error={uploadErr.selfie ?? fieldError(act.error, 'selfieUploadId')} />
          <FormError error={act.error} />
          <DialogFooter>
            <Button type="submit" disabled={busy}>{uploading ? 'Mengunggah foto…' : act.isPending ? 'Mengirim…' : 'Ajukan verifikasi'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Verification() {
  const query = useKyc()
  const [params, setParams] = useSearchParams()
  const open = params.get('verify')
  const setOpen = (v: string) => setParams((p) => (v ? p.set('verify', v) : p.delete('verify'), p), { replace: true })
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-60 max-w-2xl rounded-xl" />}>
      {(k) => {
        const v = k.verification
        const steps = [
          ['email', 'Email', v.email, 'Kode 6 digit dikirim ke email'],
          ['identity', 'Identitas (KTP)', v.identity === 'verified', v.identity === 'pending' ? 'Sedang ditinjau tim governance' : 'Foto KTP + selfie'],
        ] as const
        return (
          <div className="grid max-w-2xl gap-4">
            <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
              <h2 className="font-semibold">Batas transaksi</h2>
              <p className="text-sm text-muted-foreground">Batas per transaksi saat ini</p>
              <p className="num mt-1 text-2xl font-semibold">{formatIdr(k.limitIdr)}</p>
              <p className="mt-1 text-sm">Level <b>{k.label}</b>{k.next && <span className="text-muted-foreground"> · {k.next}</span>}</p>
              <ol className="mt-3 grid grid-cols-2 gap-1.5" aria-label="Level verifikasi">
                {([0, 1] as KycLevel[]).map((l) => (
                  <li key={l} className={cn('rounded-lg border px-3 py-2 text-xs', l <= k.level ? 'border-primary/30 bg-primary/10 text-foreground' : 'bg-muted/30 text-muted-foreground')}>
                    <span className="block font-medium">{KYC_LEVELS[l].label}</span>
                    <span className="num">s.d. {formatIdr(KYC_LEVELS[l].limitIdr, { compact: true })}</span>
                  </li>
                ))}
              </ol>
            </section>
            <ul className="grid gap-3">
              {steps.map(([id, label, ok, detail]) => (
                <li key={id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025]">
                  <IconChip icon={ok ? BadgeCheck : id === 'identity' && v.identity === 'pending' ? Clock : CircleDashed} tone={ok ? 'green' : 'gray'} />
                  <div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground">{detail}</p></div>
                  {ok ? <span className="text-sm font-medium" style={{ color: 'var(--tag-green-fg)' }}>Terverifikasi</span>
                    : id === 'email' ? <Button variant="outline" className="h-8" render={<Link to="/verify-email" />}>Verifikasi</Button>
                    : !(id === 'identity' && v.identity === 'pending') && <Button variant="outline" className="h-8" onClick={() => setOpen(id)}>Verifikasi</Button>}
                </li>
              ))}
            </ul>
            {open === 'identity' && v.identity === 'none' && <IdentityDialog onClose={() => setOpen('')} />}
          </div>
        )
      }}
    </AsyncView>
  )
}

function Editor({ initial }: { initial: Identity }) {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as (typeof TABS)[number]) || 'profile'
  const [d, setD] = useState(initial)
  const save = useSaveIdentity()
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const [draft, setDraft] = useState<Record<CapacityKind, ItemDraft>>({ skill: blankItem(), asset: blankItem(), capacity: blankItem(), resource: blankItem() })
  const profile = (k: keyof Identity['profile'], v: string) => setD({ ...d, profile: { ...d.profile, [k]: v } })
  const prefs = (patch: Partial<Identity['preferences']>) => setD({ ...d, preferences: { ...d.preferences, ...patch } })

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: String(v) }, { replace: true })}>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1">
          <TabsList className="h-auto min-w-max rounded-xl border bg-muted/50 p-1">{TABS.map((t) => <TabsTrigger key={t} value={t} className="rounded-lg px-4 py-2">{TAB_LABEL[t]}</TabsTrigger>)}</TabsList>
        </div>
      </Tabs>

      <div className="mt-6">
        {tab === 'profile' && (
          <section className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-6">
              <div className="mb-5"><h2 className="font-semibold tracking-tight">Informasi profil</h2><p className="mt-1 text-sm text-muted-foreground">Atur nama, lokasi, dan ringkasan yang tampil di profil publik.</p></div>
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
            </div>
            <aside className="rounded-2xl border bg-muted/25 p-4 text-sm lg:sticky lg:top-20">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Pratinjau publik</p>
              <div className="mt-3 flex items-center gap-3">
                <EntityAvatar name={d.profile.name || '?'} verified={d.profile.verification.identity === 'verified'} size={40} />
                <div className="min-w-0"><p className="truncate font-medium">{d.profile.name}</p><p className="truncate text-muted-foreground">@{d.profile.username} · {d.profile.location || '—'}</p></div>
              </div>
              <p className="mt-4 border-t border-border/70 pt-3 leading-relaxed text-muted-foreground">{d.profile.bio || 'Belum ada bio.'}</p>
              <Link to={`/u/${d.profile.username}`} className="mt-4 inline-flex items-center gap-1 font-medium text-primary hover:underline">Lihat profil publik</Link>
            </aside>
          </section>
        )}

        {tab === 'capacity' && (
          <div className="grid gap-4 md:grid-cols-2">
            {KINDS.map(([kind, icon, tone, title, ph, phDetail]) => (
              <section key={kind} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><IconChip icon={icon} tone={tone} size="sm" /> {title}</h2><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{d.items.filter((i) => i.kind === kind).length} item</span></div>
                <ul className="mt-3 divide-y">
                  {d.items.filter((i) => i.kind === kind).length === 0 && <li className="rounded-xl bg-muted/30 px-3 py-4 text-sm text-muted-foreground">Belum ada {title.toLowerCase()}. Tambahkan detail di bawah agar profilmu lebih informatif.</li>}
                  {d.items.filter((i) => i.kind === kind).map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                      <span className="min-w-0 flex-1"><span className="font-medium">{i.name}</span> <span className="text-muted-foreground">· {i.detail}</span></span>
                      <CategorySelect label={`Kategori ${i.name}`} className="h-9 min-w-28 text-xs" value={i.categoryId ?? ''} onChange={(v) => setD({ ...d, items: d.items.map((x) => (x.id === i.id ? { ...x, categoryId: v || undefined } : x)) })} />
                      <Button variant="ghost" size="icon-xs" aria-label={`Hapus ${i.name}`} onClick={() => setD({ ...d, items: d.items.filter((x) => x.id !== i.id) })}><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-3 grid gap-2 rounded-xl bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)]"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const { name, detail, categoryId } = draft[kind]
                    if (!name.trim()) return
                    setD({ ...d, items: [...d.items, { id: `cap-${Date.now()}`, kind, name, detail, categoryId: categoryId || undefined }] })
                    setDraft({ ...draft, [kind]: blankItem() })
                  }}
                >
                  <input aria-label={`${title} baru`} placeholder={ph} value={draft[kind].name} onChange={(e) => setDraft({ ...draft, [kind]: { ...draft[kind], name: e.target.value } })} className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm sm:col-span-2" />
                  <input aria-label={`Detail ${title}`} placeholder={phDetail} value={draft[kind].detail} onChange={(e) => setDraft({ ...draft, [kind]: { ...draft[kind], detail: e.target.value } })} className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm" />
                  <div className="flex gap-2"><CategorySelect label={`Kategori ${title} baru`} className="h-10 min-w-0 flex-1" value={draft[kind].categoryId} onChange={(v) => setDraft({ ...draft, [kind]: { ...draft[kind], categoryId: v } })} />
                  <Button type="submit" className="h-10 shrink-0" variant="outline" aria-label={`Tambah ${title}`}><Plus /> <span className="hidden sm:inline">Tambah</span></Button></div>
                </form>
              </section>
            ))}
            <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] md:col-span-2 sm:p-5">
              <h2 className="flex items-center gap-2 font-semibold"><IconChip icon={Clock} tone="teal" size="sm" /> Availability</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tentukan hari dan jam yang biasanya kamu siap dihubungi.</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hari tersedia">
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
            <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
              <p className="font-semibold">Kategori</p><p className="mt-1 text-sm text-muted-foreground">Pilih kategori yang sesuai dengan aktivitas dan kebutuhanmu.</p>
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
            </section>
            <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
              <p className="font-semibold">Lokasi preferensi</p><p className="mt-1 text-sm text-muted-foreground">Pilih wilayah yang dapat dijangkau untuk kegiatan dagang.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGIONS.map((r) => {
                  const on = d.preferences.locations.includes(r)
                  return <button key={r} type="button" aria-pressed={on} onClick={() => prefs({ locations: on ? d.preferences.locations.filter((x) => x !== r) : [...d.preferences.locations, r] })} className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-hover')}>{r}</button>
                })}
              </div>
            </section>
            <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:grid-cols-2 sm:p-5">
              <div className="sm:col-span-2"><p className="font-semibold">Rentang harga</p><p className="mt-1 text-sm text-muted-foreground">Batas ini membantu sistem memilih peluang yang relevan.</p></div>
              <Field label="Harga minimum (Rp)" type="number" min={0} value={d.preferences.minPriceIdr ?? ''} onChange={(e) => prefs({ minPriceIdr: e.target.value ? Number(e.target.value) : undefined })} />
              <Field label="Budget maksimum (Rp)" type="number" min={0} value={d.preferences.maxBudgetIdr ?? ''} onChange={(e) => prefs({ maxBudgetIdr: e.target.value ? Number(e.target.value) : undefined })} />
            </section>
            <label className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-sm font-medium shadow-sm shadow-foreground/[0.025] sm:p-5">
              <span className="flex justify-between">Radius pengiriman <span className="num text-muted-foreground">{d.preferences.deliveryRadiusKm} km</span></span>
              <input type="range" min={5} max={300} step={5} value={d.preferences.deliveryRadiusKm} onChange={(e) => prefs({ deliveryRadiusKm: Number(e.target.value) })} className="accent-primary" />
            </label>
          </div>
        )}

        {tab === 'verification' && <Verification />}
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
        featured
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-80 rounded-xl" />}>
        {(i) => <Editor key={JSON.stringify(i)} initial={i} />}
      </AsyncView>
    </>
  )
}
