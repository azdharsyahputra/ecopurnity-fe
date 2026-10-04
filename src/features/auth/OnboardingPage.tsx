import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, Compass, PackageOpen, PartyPopper, ShoppingCart, Store } from 'lucide-react'
import type { CategoryId, OnboardingGoal, OnboardingInput } from '@/domain/types'
import { CATEGORIES, REGIONS } from '@/domain/catalog'
import { formatNumber } from '@/domain/format'
import { cn } from '@/lib/utils'
import { ONBOARDING_GOAL_KEY, ONBOARDING_RETURN_KEY, useCompleteOnboarding, useMe } from './hooks'
import { useOpportunities } from '@/features/economy/hooks'
import { OpportunityCard } from '@/features/economy/components'
import { Field, FormError } from '@/components/form'
import { Logo } from '@/components/Logo'
import { IconChip } from '@/components/IconChip'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AsyncView, EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

type Draft = OnboardingInput & { listingKind: 'supply' | 'demand'; listingItem: string; listingQty: string; listingUnit: string }

const GOALS: [OnboardingGoal, typeof Store, string, string][] = [
  ['sell', PackageOpen, 'Menjual / menyediakan', 'Produk, jasa, kapasitas, atau aset'],
  ['buy', ShoppingCart, 'Membeli / mencari', 'Bahan baku, jasa, atau pasokan rutin'],
  ['business', Building2, 'Mengelola bisnis', 'Procurement dan tim untuk organisasi'],
  ['market_maker', Compass, 'Mengoperasikan market', 'Koperasi, asosiasi, aggregator'],
]
const STEP_LABELS: Record<string, string> = {
  goals: 'Tujuan', location: 'Wilayah', capacity: 'Kapasitas', preferences: 'Preferensi', business: 'Bisnis', market_maker: 'Market maker',
}

const EMPTY: Draft = {
  goals: [], location: '', radiusKm: 25, categories: [], listingKind: 'supply', listingItem: '', listingQty: '', listingUnit: 'kg',
}

function readGoal(): OnboardingGoal[] {
  try {
    const g = sessionStorage.getItem(ONBOARDING_GOAL_KEY) as OnboardingGoal | null
    return g && GOALS.some(([id]) => id === g) ? [g] : []
  } catch {
    return []
  }
}


function useDraft(userId: string) {
  const key = `ecp-onboarding-${userId}`
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? (JSON.parse(saved) as Draft) : { ...EMPTY, goals: readGoal() }
    } catch {
      return { ...EMPTY, goals: readGoal() }
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft))
    } catch {
      // per-session only
    }
  }, [key, draft])
  const clear = () => {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(ONBOARDING_GOAL_KEY)
      // ONBOARDING_RETURN_KEY is read by the done screen; it expires with the tab.
    } catch {
      // nothing to clear
    }
  }
  return [draft, (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), clear] as const
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

const selectClass = 'h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

function StepShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Siapkan profilmu</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-7">{children}</div>
    </div>
  )
}

function readReturnTo() {
  try {
    return sessionStorage.getItem(ONBOARDING_RETURN_KEY)
  } catch {
    return null
  }
}

function Done({ categories }: { categories: CategoryId[] }) {
  const matches = useOpportunities({ category: categories[0], pageSize: 3 })
  const [returnTo] = useState(readReturnTo)
  return (
    <div>
      <IconChip icon={PartyPopper} tone="lime" size="lg" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Profilmu siap</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ini opportunity yang cocok dengan kategori pilihanmu. Lengkapi profil supaya rekomendasinya makin tepat.</p>
      <div className="mt-6">
        <AsyncView query={matches} skeleton={<Skeleton className="h-52 rounded-xl" />} isEmpty={(p) => !p.data.length} empty={<EmptyState title="Belum ada rekomendasi opportunity" description="Profilmu sudah siap. Rekomendasi akan muncul setelah ada peluang yang sesuai dengan kategori pilihanmu." />}>
          {(p) => <div className="grid gap-3 md:grid-cols-3">{p.data.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>}
        </AsyncView>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {returnTo && <Button className="h-10 px-5" render={<Link to={returnTo} />}>Kembali ke halaman tadi <ArrowRight /></Button>}
        <Button variant={returnTo ? 'outline' : 'default'} className="h-10 px-5" render={<Link to="/app" />}>Ke My Economy {!returnTo && <ArrowRight />}</Button>
        <Button variant="outline" className="h-10" render={<Link to="/app/identity" />}>Lengkapi profil</Button>
      </div>
    </div>
  )
}

export function OnboardingPage() {
  const { data: me } = useMe()
  const [draft, update, clear] = useDraft(me!.id)
  const complete = useCompleteOnboarding()
  const [step, setStep] = useState(0)

  const wantsBusiness = draft.goals.includes('business')
  const wantsMm = draft.goals.includes('market_maker')
  const steps = ['goals', 'location', 'capacity', 'preferences', ...(wantsBusiness ? ['business'] : []), ...(wantsMm ? ['market_maker'] : [])]
  const current = steps[step]
  const last = step === steps.length - 1
  const canNext = current !== 'goals' || draft.goals.length > 0

  function finish() {
    const qty = Number(draft.listingQty)
    const input: OnboardingInput = {
      goals: draft.goals,
      location: draft.location,
      radiusKm: draft.radiusKm,
      categories: draft.categories,
      minPriceIdr: draft.minPriceIdr,
      maxBudgetIdr: draft.maxBudgetIdr,
      firstListing: draft.listingItem && qty > 0 ? { kind: draft.listingKind, item: draft.listingItem, quantity: { value: qty, unit: draft.listingUnit } } : undefined,
      organization: wantsBusiness ? draft.organization : undefined,
      marketMakerApplication: wantsMm ? draft.marketMakerApplication : undefined,
    }
    complete.mutate(input, { onSuccess: clear })
  }

  const next = () => (last ? finish() : setStep(step + 1))

  if (me!.onboarded && !complete.isSuccess) return <Navigate to="/app" replace />

  return (
    <div className="relative min-h-svh overflow-hidden bg-muted/30">
      <div className="pointer-events-none absolute -right-36 -top-40 size-[32rem] rounded-full bg-primary/8 blur-3xl" />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-6">
        <Logo />
        <div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">Profil awal · sekitar 2 menit</span><ThemeToggle /></div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 pb-16 md:px-6">
        {complete.isSuccess ? (
          <div className="rounded-3xl border bg-card p-5 shadow-xl shadow-foreground/[0.035] sm:p-8"><Done categories={draft.categories} /></div>
        ) : (
          <>
            <div className="grid overflow-hidden rounded-3xl border bg-card shadow-xl shadow-foreground/[0.035] lg:grid-cols-[15rem_1fr]">
              <aside className="border-b bg-muted/35 p-5 sm:p-7 lg:border-r lg:border-b-0">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground"><span>LANGKAH {step + 1} DARI {steps.length}</span><span>{Math.round(((step + 1) / steps.length) * 100)}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-label="Langkah onboarding">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
                </div>
                <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  {steps.map((s, i) => (
                    <li key={s} className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs sm:text-sm', i === step ? 'bg-background font-semibold text-foreground shadow-sm' : i < step ? 'text-primary' : 'text-muted-foreground')}>
                      <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary/10 text-primary' : 'bg-muted')}>{i < step ? '✓' : i + 1}</span>
                      {STEP_LABELS[s]}
                    </li>
                  ))}
                </ol>
                <p className="mt-6 hidden text-xs leading-relaxed text-muted-foreground lg:block">Informasi ini membantu kami menampilkan peluang dan mitra yang paling relevan untukmu.</p>
              </aside>

              <div className="min-w-0 p-5 sm:p-8">

            {current === 'goals' && (
              <StepShell title={`Halo ${me!.name.split(' ')[0]}, apa tujuanmu?`} description="Pilih satu atau lebih. Ini menentukan apa yang kamu lihat pertama kali.">
                <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Tujuan">
                  {GOALS.map(([id, icon, title, sub]) => {
                    const on = draft.goals.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ goals: toggle(draft.goals, id) })}
                        className={cn('flex items-start gap-3 rounded-2xl border p-4 text-left transition duration-200', on ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/50' : 'bg-background hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md')}
                      >
                        <IconChip icon={icon} tone={on ? 'teal' : 'gray'} />
                        <span>
                          <span className="block font-medium">{title}</span>
                          <span className="block text-sm text-muted-foreground">{sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </StepShell>
            )}

            {current === 'location' && (
              <StepShell title="Di mana kamu beroperasi?" description="Dipakai untuk mencari opportunity dan mitra terdekat.">
                <div className="flex max-w-md flex-col gap-5">
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Wilayah
                    <select className={selectClass} value={draft.location} onChange={(e) => update({ location: e.target.value })}>
                      <option value="">Pilih wilayah</option>
                      {REGIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    <span className="flex justify-between">Radius jangkauan <span className="num text-muted-foreground">{draft.radiusKm} km</span></span>
                    <input type="range" min={5} max={200} step={5} value={draft.radiusKm} onChange={(e) => update({ radiusKm: Number(e.target.value) })} className="accent-primary" />
                  </label>
                </div>
              </StepShell>
            )}

            {current === 'capacity' && (
              <StepShell title="Apa yang kamu tawarkan atau cari?" description="Pilih kategori, lalu isi satu supply atau demand pertama (opsional).">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Kategori">
                  {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => {
                    const on = draft.categories.includes(c)
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ categories: toggle(draft.categories, c) })}
                        className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-transparent font-medium' : 'text-muted-foreground hover:bg-hover')}
                        style={on ? { background: `var(--tag-${CATEGORIES[c].tone}-bg)`, color: `var(--tag-${CATEGORIES[c].tone}-fg)` } : undefined}
                      >
                        {CATEGORIES[c].label}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-8 rounded-2xl border bg-muted/25 p-4 sm:p-5">
                  <div role="radiogroup" aria-label="Jenis" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
                    {(['supply', 'demand'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={draft.listingKind === k}
                        onClick={() => update({ listingKind: k })}
                        className={cn('rounded-md px-3 py-1', draft.listingKind === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
                      >
                        {k === 'supply' ? 'Saya punya' : 'Saya butuh'}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_6rem]">
                    <Field label="Item" placeholder="mis. biji kopi arabika" value={draft.listingItem} onChange={(e) => update({ listingItem: e.target.value })} />
                    <Field label="Jumlah" type="number" min={0} inputMode="numeric" value={draft.listingQty} onChange={(e) => update({ listingQty: e.target.value })} />
                    <Field label="Satuan" value={draft.listingUnit} onChange={(e) => update({ listingUnit: e.target.value })} />
                  </div>
                </div>
              </StepShell>
            )}

            {current === 'preferences' && (
              <StepShell title="Preferensi harga" description="Opsional. Kami pakai untuk menyaring opportunity yang tidak masuk hitungan.">
                <div className="grid max-w-md gap-4">
                  {(draft.goals.includes('sell') || !draft.goals.includes('buy')) && (
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      Harga minimum yang kamu terima (Rp)
                      <Input type="number" min={0} inputMode="numeric" className="h-10" value={draft.minPriceIdr ?? ''} onChange={(e) => update({ minPriceIdr: e.target.value ? Number(e.target.value) : undefined })} />
                    </label>
                  )}
                  {(draft.goals.includes('buy') || draft.goals.includes('business')) && (
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      Anggaran maksimum per bulan (Rp)
                      <Input type="number" min={0} inputMode="numeric" className="h-10" value={draft.maxBudgetIdr ?? ''} onChange={(e) => update({ maxBudgetIdr: e.target.value ? Number(e.target.value) : undefined })} />
                    </label>
                  )}
                  {(draft.minPriceIdr || draft.maxBudgetIdr) && (
                    <p className="text-xs text-muted-foreground">
                      {draft.minPriceIdr ? `Minimum Rp ${formatNumber(draft.minPriceIdr)}. ` : ''}
                      {draft.maxBudgetIdr ? `Anggaran Rp ${formatNumber(draft.maxBudgetIdr)}.` : ''}
                    </p>
                  )}
                </div>
              </StepShell>
            )}

            {current === 'business' && (
              <StepShell title="Buat organisasi" description="Kamu jadi Owner. Dokumen verifikasi bisa diunggah nanti dari Profil bisnis.">
                <div className="grid max-w-md gap-4">
                  <Field label="Nama perusahaan" required value={draft.organization?.name ?? ''} onChange={(e) => update({ organization: { industry: '', location: draft.location, ...draft.organization, name: e.target.value } })} />
                  <Field label="Industri" placeholder="mis. Makanan & minuman" value={draft.organization?.industry ?? ''} onChange={(e) => update({ organization: { name: '', location: draft.location, ...draft.organization, industry: e.target.value } })} />
                  <Field label="Lokasi" value={draft.organization?.location ?? draft.location} onChange={(e) => update({ organization: { name: '', industry: '', ...draft.organization, location: e.target.value } })} />
                </div>
              </StepShell>
            )}

            {current === 'market_maker' && (
              <StepShell title="Ajukan jadi market maker" description="Tim governance meninjau aplikasi dalam 2–3 hari kerja. Sementara itu kamu tetap bisa memakai akun seperti biasa.">
                <div className="grid max-w-md gap-4">
                  <Field label="Organisasi" placeholder="Koperasi, asosiasi, atau aggregator" value={draft.marketMakerApplication?.organization ?? ''} onChange={(e) => update({ marketMakerApplication: { reason: '', ...draft.marketMakerApplication, organization: e.target.value } })} />
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Market apa yang ingin kamu operasikan?
                    <textarea
                      rows={4}
                      value={draft.marketMakerApplication?.reason ?? ''}
                      onChange={(e) => update({ marketMakerApplication: { organization: '', ...draft.marketMakerApplication, reason: e.target.value } })}
                      className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                  </label>
                </div>
              </StepShell>
            )}

            <div className="mt-6"><FormError error={complete.error} /></div>

            <div className="mt-10 flex items-center gap-2 border-t pt-6">
              {step > 0 && (
                <Button variant="ghost" className="h-10" onClick={() => setStep(step - 1)}>
                  <ArrowLeft /> Kembali
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                {current !== 'goals' && !last && (
                  <Button variant="ghost" className="h-10" onClick={next}>Lewati</Button>
                )}
                <Button className="h-10 px-5" onClick={next} disabled={!canNext || complete.isPending}>
                  {last ? (complete.isPending ? 'Menyimpan…' : 'Selesai') : 'Lanjut'} {!last && <ArrowRight />}
                </Button>
              </div>
            </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
