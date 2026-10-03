import { useState } from 'react'
import { Building2, FileText, FileUp, ShieldCheck } from 'lucide-react'
import type { CategoryId } from '@/domain/types'
import type { OrgProfile, VerificationStatus } from '@/domain/org'
import type { Tone } from '@/domain/status'
import { CATEGORIES } from '@/domain/catalog'
import { formatDate } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useOrgAccess, useOrgSettings, useRequestVerification, useSaveProfile, useUploadDocument } from './hooks'
import { CheckChips, GuardedButton, Section } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { Tag } from '@/components/Tag'
import { Field, FormError, SelectField, TextareaField } from '@/components/form'
import { Skeleton } from '@/components/ui/skeleton'

const DAYS: [string, string][] = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, i) => [String(i), d])
const VERIFICATION: Record<VerificationStatus, [string, Tone, string]> = {
  unverified: ['Belum diverifikasi', 'gray', 'Unggah NIB, NPWP, dan akta lalu ajukan verifikasi.'],
  pending: ['Sedang direview', 'yellow', 'Tim Ecopurnity memeriksa dokumen, biasanya 1–2 hari kerja.'],
  verified: ['Terverifikasi', 'green', 'Badge terverifikasi tampil di profil publik dan auction.'],
  rejected: ['Ditolak', 'red', 'Perbaiki dokumen sesuai catatan lalu ajukan ulang.'],
}
const DOC_KINDS: [OrgProfile['documents'][number]['kind'], string][] = [['nib', 'NIB'], ['npwp', 'NPWP'], ['akta', 'Akta pendirian'], ['other', 'Lainnya']]

function ProfileForm({ initial, readOnly }: { initial: OrgProfile; readOnly?: string }) {
  const [d, setD] = useState(initial)
  const save = useSaveProfile()
  const set = <K extends keyof OrgProfile>(k: K, v: OrgProfile[K]) => setD({ ...d, [k]: v })
  const legal = (k: keyof OrgProfile['legal'], v: string) => setD({ ...d, legal: { ...d.legal, [k]: v } })
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(d, { onSuccess: () => toast({ title: 'Profil bisnis disimpan', tone: 'green' }) })
      }}
    >
      <fieldset disabled={!!readOnly} className="flex flex-col gap-6">
        <Section title="Identitas perusahaan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama perusahaan" value={d.name} onChange={(e) => set('name', e.target.value)} error={fieldError(save.error, 'name')} />
            <Field label="Industri" value={d.industry} onChange={(e) => set('industry', e.target.value)} />
            <Field label="Lokasi" value={d.location} onChange={(e) => set('location', e.target.value)} hint="Kota, provinsi" />
            <div className="sm:col-span-2">
              <TextareaField label="Deskripsi" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <CheckChips<CategoryId> label="Kategori" options={Object.entries(CATEGORIES).map(([k, c]) => [k as CategoryId, c.label])} value={d.categories} onChange={(v) => set('categories', v)} disabled={!!readOnly} />
            </div>
          </div>
        </Section>
        <Section title="Legalitas">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="NIB" inputMode="numeric" value={d.legal.nib} onChange={(e) => legal('nib', e.target.value)} error={fieldError(save.error, 'nib')} hint="13 digit" />
            <Field label="NPWP" value={d.legal.npwp} onChange={(e) => legal('npwp', e.target.value)} error={fieldError(save.error, 'npwp')} placeholder="00.000.000.0-000.000" />
            <div className="sm:col-span-2">
              <Field label="Akta pendirian" value={d.legal.akta} onChange={(e) => legal('akta', e.target.value)} placeholder="Nomor, tanggal, notaris" />
            </div>
          </div>
        </Section>
        <Section title="Jam operasional">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_8rem]">
            <CheckChips label="Hari" options={DAYS} value={d.hours.days.map(String)} onChange={(v) => set('hours', { ...d.hours, days: v.map(Number).sort() })} disabled={!!readOnly} />
            <Field label="Buka" type="time" value={d.hours.from} onChange={(e) => set('hours', { ...d.hours, from: e.target.value })} />
            <Field label="Tutup" type="time" value={d.hours.to} onChange={(e) => set('hours', { ...d.hours, to: e.target.value })} />
          </div>
        </Section>
      </fieldset>
      <FormError error={save.error} />
      <div className="flex items-center justify-end gap-3">
        {readOnly && <p className="text-sm text-muted-foreground">{readOnly}</p>}
        <GuardedButton type="submit" className="h-10 px-5" reason={readOnly} disabled={!dirty || save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan profil'}
        </GuardedButton>
      </div>
    </form>
  )
}

function Verification({ profile, readOnly }: { profile: OrgProfile; readOnly?: string }) {
  const upload = useUploadDocument()
  const request = useRequestVerification()
  const [kind, setKind] = useState<OrgProfile['documents'][number]['kind']>('nib')
  const [label, tone, hint] = VERIFICATION[profile.verification]
  return (
    <Section title="Verifikasi" actions={<Tag tone={tone}>{label}</Tag>}>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <ul className="mt-3 divide-y text-sm">
        {profile.documents.map((doc) => (
          <li key={doc.name} className="flex items-center gap-2 py-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{doc.name}</span>
            <Tag>{DOC_KINDS.find(([k]) => k === doc.kind)?.[1]}</Tag>
            <span className="text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="mt-4 flex flex-col gap-3">
          <SelectField label="Jenis dokumen" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectField>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-hover has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <FileUp className="size-4 text-muted-foreground" />
            <span className="flex-1">{upload.isPending ? 'Mengunggah…' : 'Unggah dokumen (PDF/JPG)'}</span>
            <input
              type="file"
              accept=".pdf,image/*"
              className="sr-only"
              onChange={(e) => {
                const name = e.target.files?.[0]?.name
                if (name) upload.mutate({ name, kind }, { onSuccess: () => toast({ title: 'Dokumen diunggah', body: name, tone: 'green' }) })
                e.target.value = ''
              }}
            />
          </label>
          {fieldError(upload.error, 'file') && <p className="text-xs text-destructive">{fieldError(upload.error, 'file')}</p>}
          {(profile.verification === 'unverified' || profile.verification === 'rejected') && (
            <GuardedButton className="h-9" disabled={request.isPending} onClick={() => request.mutate(undefined, { onSuccess: () => toast({ title: 'Verifikasi diajukan', tone: 'green' }) })}>
              <ShieldCheck /> Ajukan verifikasi
            </GuardedButton>
          )}
          <FormError error={request.error ?? upload.error} />
        </div>
      )}
    </Section>
  )
}

export function ProfilePage() {
  const access = useOrgAccess()
  const query = useOrgSettings()
  const readOnly = access.deny('profile', 'manage')
  return (
    <>
      <PageHeader title="Profil bisnis" description="Identitas, legalitas, dan jam operasional yang dilihat supplier dan pembeli." icon={Building2} tone="blue" />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(s) => (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <ProfileForm key={JSON.stringify({ ...s.profile, documents: 0, verification: 0 })} initial={s.profile} readOnly={readOnly} />
            <aside className="flex flex-col gap-6">
              <Verification profile={s.profile} readOnly={readOnly} />
            </aside>
          </div>
        )}
      </AsyncView>
    </>
  )
}
