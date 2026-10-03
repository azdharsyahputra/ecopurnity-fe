import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Cpu, SquarePlus } from 'lucide-react'
import type { CategoryId, MarketMechanism, MarketObjective, OpportunityDetail } from '@/domain/types'
import { CATEGORIES, MECHANISMS, OBJECTIVES } from '@/domain/catalog'
import { MECHANISM_GUIDE, simulateMarket, SUPPLIER_VERIFICATION, type CreateMarketInput, type SupplierVerification } from '@/domain/mm'
import { defaultRules, rulesToLabeled, validateRules } from '@/domain/marketRules'
import { formatIdr, formatNumber, formatQty } from '@/domain/format'
import { ApiError, fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useCreateMarket, useMmOpportunity } from './hooks'
import { RulesFields } from './ui'
import { RulesList } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { SummaryRow, Wizard } from '@/components/Wizard'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const OBJECTIVE_HINT: Record<MarketObjective, string> = {
  procurement: 'Pembeli mencari pasokan; supplier bersaing.',
  selling: 'Penjual mencari pembeli dengan harga terbaik.',
  resource_exchange: 'Tukar kapasitas atau aset yang menganggur.',
  service_exchange: 'Jasa dipertemukan dengan kebutuhan rutin.',
}

const objectiveFor = (o: OpportunityDetail): MarketObjective =>
  o.kind === 'collective_demand' ? 'procurement'
    : o.kind === 'capacity_match' ? (o.categoryId === 'logistics' || o.categoryId === 'it' ? 'service_exchange' : 'resource_exchange')
      : 'selling'

function initial(o?: OpportunityDetail): CreateMarketInput {
  const mechanism = o?.suggestedMechanism ?? 'reverse_auction'
  const demand = o?.demand ?? { value: NaN, unit: 'unit' }
  const supply = o?.supply ?? { value: NaN, unit: 'unit' }
  return {
    opportunityId: o?.id, name: o?.title ?? '', objective: o ? objectiveFor(o) : 'procurement', mechanism, categoryId: o?.categoryId ?? 'agri',
    unit: demand.unit, demand: demand.value, supply: supply.value, referencePriceIdr: o ? Math.round(o.potentialValueIdr / o.demand.value) : NaN,
    rules: defaultRules({ demand: { ...demand, value: demand.value || 0 }, supply: { ...supply, value: supply.value || 0 }, region: o?.region ?? 'Jawa Barat', mechanism }),
    autoInvite: !!o, approval: 'manual', supplierVerification: 'documents',
  }
}

/** Native radios styled as cards: keyboard and screen-reader behaviour for free. */
function Choice<T extends string>({ name, legend, value, options, onChange }: {
  name: string
  legend: string
  value: T
  options: { value: T; title: string; body: string; badge?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 text-sm transition-colors hover:bg-hover has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
              value === o.value && 'border-primary',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 accent-primary" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5 font-medium">{o.title} {o.badge && <Tag tone="purple"><Cpu className="size-3" /> {o.badge}</Tag>}</span>
              <span className="mt-0.5 block text-muted-foreground">{o.body}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const numValue = (n: number) => (Number.isFinite(n) ? String(n) : '')
const toNum = (s: string) => (s === '' ? NaN : Number(s))

function MarketWizard({ o }: { o?: OpportunityDetail }) {
  const navigate = useNavigate()
  const create = useCreateMarket()
  const [f, setF] = useState(() => initial(o))
  const [confirming, setConfirming] = useState(false)
  const set = <K extends keyof CreateMarketInput>(k: K, v: CreateMarketInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const err = (k: string) => fieldError(create.error, k)
  const ruleErrors = validateRules(f.rules)
  const sim = simulateMarket({
    invited: f.autoInvite && o ? o.participants : 0, demand: f.demand || 0, supply: f.supply || 0, referencePriceIdr: f.referencePriceIdr || 0,
    mechanism: f.mechanism, rules: f.rules, approval: f.approval, supplierVerification: f.supplierVerification,
  })
  const basicsBlocker = !f.name.trim() ? 'Isi nama market' : !f.unit.trim() ? 'Isi satuan' : !(f.demand > 0) ? 'Isi perkiraan demand' : !(f.referencePriceIdr > 0) ? 'Isi harga acuan' : undefined

  function publish() {
    create.mutate(f, {
      onSuccess: ({ id }) => {
        toast({ title: 'Market dipublikasikan', body: f.name, tone: 'green', href: `/markets/${id}` })
        navigate(`/mm/markets/${id}`)
      },
      onSettled: () => setConfirming(false),
    })
  }

  const fieldMessages = create.error instanceof ApiError && create.error.fields ? Object.values(create.error.fields) : []

  return (
    <>
      <Wizard
        submitLabel="Publish market"
        submitting={create.isPending}
        onSubmit={() => setConfirming(true)}
        error={
          <>
            <FormError error={create.error} />
            {fieldMessages.length > 0 && (
              <div role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
                {create.error instanceof Error && create.error.message}
                <ul className="mt-1 list-disc pl-5">{fieldMessages.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </>
        }
        steps={[
          {
            id: 'objective', title: 'Objective', blocker: basicsBlocker,
            content: (
              <div className="flex flex-col gap-6">
                <Choice name="objective" legend="Tujuan market" value={f.objective} onChange={(v) => set('objective', v)}
                  options={(Object.keys(OBJECTIVES) as MarketObjective[]).map((k) => ({ value: k, title: OBJECTIVES[k], body: OBJECTIVE_HINT[k] }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Nama market" value={f.name} onChange={(e) => set('name', e.target.value)} error={err('name')} /></div>
                  <SelectField label="Kategori" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
                    {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                  </SelectField>
                  <Field label="Satuan" value={f.unit} onChange={(e) => set('unit', e.target.value)} error={err('unit')} placeholder="kg, unit, trip, jam" />
                  <Field label={`Perkiraan demand per bulan (${f.unit || 'unit'})`} type="number" min={0} value={numValue(f.demand)} onChange={(e) => set('demand', toNum(e.target.value))} error={err('demand')} />
                  <Field label={`Supply tersedia per bulan (${f.unit || 'unit'})`} type="number" min={0} value={numValue(f.supply)} onChange={(e) => set('supply', toNum(e.target.value))} />
                  <Field label={`Harga acuan per ${f.unit || 'unit'} (Rp)`} type="number" min={0} value={numValue(f.referencePriceIdr)} onChange={(e) => set('referencePriceIdr', toNum(e.target.value))} error={err('referencePriceIdr')} hint={o ? 'Dari nilai potensi opportunity ÷ demand' : undefined} />
                </div>
              </div>
            ),
          },
          {
            id: 'mechanism', title: 'Mekanisme',
            content: (
              <div className="flex flex-col gap-4">
                {o && (
                  <div className="rounded-xl border p-4 text-sm" style={{ background: 'var(--tag-purple-bg)' }}>
                    <p className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--tag-purple-fg)' }}>
                      <Cpu className="size-4" /> Market Formation Engine merekomendasikan {MECHANISMS[o.suggestedMechanism].label}
                    </p>
                    <p className="mt-1">{o.mechanismReason}</p>
                  </div>
                )}
                <Choice name="mechanism" legend="Mekanisme market" value={f.mechanism} onChange={(v) => set('mechanism', v)}
                  options={(Object.keys(MECHANISMS) as MarketMechanism[]).map((k) => ({
                    value: k, title: MECHANISMS[k].label, body: `${MECHANISMS[k].hint} ${MECHANISM_GUIDE[k]}`, badge: o?.suggestedMechanism === k ? 'Rekomendasi' : undefined,
                  }))} />
              </div>
            ),
          },
          {
            id: 'rules', title: 'Aturan', blocker: Object.values(ruleErrors)[0],
            content: <RulesFields value={f.rules} onChange={(r) => set('rules', r)} unit={f.unit} errors={ruleErrors} serverError={create.error} />,
          },
          {
            id: 'participants', title: 'Peserta',
            content: (
              <div className="flex flex-col gap-6">
                <div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-primary" checked={f.autoInvite} disabled={!o} onChange={(e) => set('autoInvite', e.target.checked)} />
                    <span>
                      <span className="font-medium">Undang otomatis peserta opportunity</span>
                      <span className="block text-muted-foreground">
                        {o ? `${formatNumber(o.participants)} peserta ${o.code}; ${o.participantsPreview.length} teratas masuk daftar participant market.` : 'Tersedia saat market dibentuk dari opportunity.'}
                      </span>
                    </span>
                  </label>
                  {o && f.autoInvite && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {o.participantsPreview.map((p) => (
                        <li key={p.name} className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs">
                          <EntityAvatar name={p.name} kind={p.kind} verified={p.verified} size={20} /> {p.name} <span className="text-muted-foreground">· {p.role === 'buyer' ? 'pembeli' : 'supplier'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Mode approval</span>
                  <Segmented label="Mode approval" value={f.approval} options={[['manual', 'Manual (review dulu)'], ['auto', 'Otomatis']]} onChange={(v) => set('approval', v)} />
                  <p className="text-xs text-muted-foreground">{f.approval === 'manual' ? 'Peserta baru masuk antrean approval di tab Participants.' : 'Peserta yang memenuhi eligibility langsung aktif.'}</p>
                </div>
                <SelectField label="Syarat verifikasi supplier" value={f.supplierVerification} onChange={(e) => set('supplierVerification', e.target.value as SupplierVerification)}>
                  {Object.entries(SUPPLIER_VERIFICATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectField>
              </div>
            ),
          },
          {
            id: 'review', title: 'Review',
            content: (
              <div className="flex flex-col gap-6">
                <section aria-labelledby="sim" className="rounded-xl border bg-card p-4">
                  <h3 id="sim" className="font-medium">Simulasi</h3>
                  <p className="text-xs text-muted-foreground">Perkiraan kasar dari aturan dan peserta yang diundang.</p>
                  <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Estimasi peserta</dt><dd className="num text-lg font-semibold">{formatNumber(sim.participants)}</dd><dd className="text-xs text-muted-foreground">{sim.buyers} pembeli · {sim.suppliers} supplier</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Likuiditas</dt><dd className="text-lg font-semibold capitalize">{sim.liquidity}</dd><dd className="num text-xs text-muted-foreground">{sim.ratio.toFixed(1).replace('.', ',')} pembeli per supplier</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Estimasi harga</dt><dd className="num text-lg font-semibold">{formatNumber(sim.priceLowIdr, { compact: true })}–{formatNumber(sim.priceHighIdr, { compact: true })}</dd><dd className="text-xs text-muted-foreground">Rp per {f.unit || 'unit'}</dd></div>
                  </dl>
                </section>
                <section aria-labelledby="rules-v1">
                  <h3 id="rules-v1" className="font-medium">Aturan v1 (berlaku mulai round 1)</h3>
                  <RulesList rules={rulesToLabeled(f.rules, f.unit || 'unit')} />
                </section>
              </div>
            ),
          },
        ]}
        summary={
          <>
            <SummaryRow label="Market" value={f.name} />
            <SummaryRow label="Objective" value={OBJECTIVES[f.objective]} />
            <SummaryRow label="Mekanisme" value={MECHANISMS[f.mechanism].label} />
            <SummaryRow label="Kategori" value={CATEGORIES[f.categoryId].label} />
            <SummaryRow label="Demand/bln" value={f.demand > 0 ? formatQty({ value: f.demand, unit: f.unit }, { compact: true }) : ''} />
            <SummaryRow label="Harga acuan" value={f.referencePriceIdr > 0 ? formatIdr(f.referencePriceIdr) : ''} />
            <SummaryRow label="Undangan" value={f.autoInvite && o ? `${formatNumber(o.participants)} peserta` : 'Terbuka'} />
            <SummaryRow label="Approval" value={f.approval === 'manual' ? 'Manual' : 'Otomatis'} />
          </>
        }
      />

      <Dialog open={confirming} onOpenChange={(v) => !create.isPending && setConfirming(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish {f.name}?</DialogTitle>
            <DialogDescription>Market langsung tampil publik dan bisa diikuti peserta.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 rounded-lg bg-muted p-3 pl-7 text-sm">
            <li>Tampil di halaman publik Markets dengan status Active</li>
            {o && <li>Opportunity {o.code} pindah ke <b>Market Live</b></li>}
            {f.autoInvite && o && <li>{o.participantsPreview.length} peserta diundang ({f.approval === 'manual' ? 'menunggu approval kamu' : 'langsung aktif'})</li>}
            <li>Aturan v1 berlaku mulai round 1; perubahan nanti hanya berlaku untuk round berikutnya</li>
            <li>Tercatat di audit log market</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={create.isPending}>Batal</Button>
            <Button onClick={publish} disabled={create.isPending}>{create.isPending ? 'Memproses…' : 'Publish market'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CreateMarketPage() {
  const [params] = useSearchParams()
  const oppId = params.get('opportunity')
  const opp = useMmOpportunity(oppId)
  return (
    <>
      <PageHeader
        title="Buat market"
        description={oppId ? 'Dibentuk dari opportunity; isian sudah diisi dari rekomendasi engine.' : 'Ubah kebutuhan atau peluang menjadi market dengan aturan yang transparan.'}
        icon={SquarePlus}
        tone="purple"
      />
      {oppId ? (
        <AsyncView query={opp} skeleton={<Skeleton className="h-96 rounded-xl" />}>
          {(o) => <MarketWizard key={o.id} o={o} />}
        </AsyncView>
      ) : (
        <MarketWizard />
      )}
    </>
  )
}
