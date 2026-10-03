import { useState, type ReactElement, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import type { MmAlert } from '@/domain/mm'
import { ALERT_TONE } from '@/domain/mm'
import { AWARD, ELIGIBILITY, VISIBILITY, type MarketRules } from '@/domain/marketRules'
import { REGIONS } from '@/domain/catalog'
import { fieldError } from '@/lib/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, SelectField, TextareaField } from '@/components/form'
import { Tag } from '@/components/Tag'

/** ConfirmDialog with a required reason; the mock rejects an empty one with a field error shown under the input. */
export function ReasonConfirm({
  trigger, title, description, impact, confirmLabel, destructive, error, field = 'reason', label = 'Alasan', onConfirm,
}: {
  trigger: ReactElement
  title: string
  description?: ReactNode
  impact: ReactNode
  confirmLabel: string
  destructive?: boolean
  error: unknown
  field?: string
  label?: string
  onConfirm: (reason: string) => unknown
}) {
  const [reason, setReason] = useState('')
  return (
    <ConfirmDialog
      trigger={trigger}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive={destructive}
      onConfirm={() => Promise.resolve(onConfirm(reason.trim())).then(() => setReason(''))}
      impact={
        <div className="flex flex-col gap-3">
          <div>{impact}</div>
          <TextareaField label={label} value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(error, field)} hint="Wajib diisi; tercatat di audit log." />
        </div>
      }
    />
  )
}

export function AlertTags({ alerts }: { alerts: MmAlert[] }) {
  if (!alerts.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {alerts.map((a) => (
        <Tag key={a.kind} tone={ALERT_TONE[a.kind]}><CircleAlert className="size-3" /> {a.label}</Tag>
      ))}
    </span>
  )
}

/** The rule form shared by the creation wizard and the rule editor. */
export function RulesFields({ value: r, onChange, unit, errors, serverError }: {
  value: MarketRules
  onChange: (r: MarketRules) => void
  unit: string
  /** Client-side validation (validateRules). */
  errors: Record<string, string>
  serverError?: unknown
}) {
  const set = <K extends keyof MarketRules>(k: K, v: MarketRules[K]) => onChange({ ...r, [k]: v })
  const err = (k: string) => errors[k] ?? fieldError(serverError, k)
  const num = (k: 'minStepPct' | 'minQuantity' | 'maxQuantity' | 'radiusKm') => ({
    type: 'number', inputMode: 'decimal' as const, min: 0, value: Number.isFinite(r[k]) ? String(r[k]) : '', error: err(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? NaN : Number(e.target.value)),
  })
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium text-muted-foreground">Eligibility & bid</legend>
        <SelectField label="Eligibility peserta" value={r.eligibility} onChange={(e) => set('eligibility', e.target.value as MarketRules['eligibility'])}>
          {Object.entries(ELIGIBILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectField>
        <SelectField label="Visibilitas bid" value={r.visibility} onChange={(e) => set('visibility', e.target.value as MarketRules['visibility'])}>
          {Object.entries(VISIBILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectField>
        <Field label="Langkah bid minimum (%)" step="0.5" hint="Dari harga pembuka tiap round" {...num('minStepPct')} />
        <SelectField label="Penetapan pemenang" value={r.award} onChange={(e) => set('award', e.target.value as MarketRules['award'])}>
          {Object.entries(AWARD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectField>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium text-muted-foreground">Kuantitas & waktu</legend>
        <Field label={`Kuantitas minimum per order (${unit || 'unit'})`} {...num('minQuantity')} />
        <Field label={`Kuantitas maksimum per peserta (${unit || 'unit'})`} {...num('maxQuantity')} />
        <Field label="Jendela mulai" type="date" value={r.windowStart} onChange={(e) => set('windowStart', e.target.value)} error={err('windowStart')} />
        <Field label="Jendela selesai" type="date" value={r.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} error={err('windowEnd')} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium text-muted-foreground">Batas geografis</legend>
        <SelectField label="Wilayah" value={r.region} onChange={(e) => set('region', e.target.value)} error={err('region')}>
          {!REGIONS.includes(r.region) && <option value={r.region}>{r.region || 'Pilih wilayah'}</option>}
          {REGIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </SelectField>
        <Field label="Radius dari pusat wilayah (km)" {...num('radiusKm')} />
      </fieldset>
    </div>
  )
}
