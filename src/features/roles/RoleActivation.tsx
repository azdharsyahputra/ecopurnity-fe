import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Compass, MailPlus, Plus } from 'lucide-react'
import type { CategoryId } from '@/domain/types'
import { CATEGORIES } from '@/domain/catalog'
import { formatRelative } from '@/domain/format'
import { MM_STATUS, ORG_TYPES, type MmApplication, type MmApplicationInput, type NewOrgInput } from '@/domain/roles'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useMe } from '@/features/auth/hooks'
import { useParam } from '@/features/market-maker/hooks'
import { CheckChips } from '@/features/org/ui'
import { useAnswerInvitation, useApplyMm, useCreateOrg, useInvitations, useMmApplication } from './hooks'
import { Field, FormError, SelectField, TextareaField } from '@/components/form'
import { Tag } from '@/components/Tag'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'




const CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([id, c]): [CategoryId, string] => [id as CategoryId, c.label])


export function ActivationMenuItems({ onOpen }: { onOpen?: () => void }) {
  const { data: me } = useMe()
  const invitations = useInvitations().data ?? []
  const application = useMmApplication().data
  const [, setActivate] = useParam('activate')
  const [, setInvitation] = useParam('invitation')
  const open = (set: (v: string) => void, v: string) => {
    onOpen?.()
    set(v)
  }
  const isMm = me?.capabilities.includes('market_maker')
  return (
    <>
      <DropdownMenuSeparator />
      {invitations.length > 0 && (
        <DropdownMenuGroup>
          <DropdownMenuLabel>Undangan organisasi</DropdownMenuLabel>
          {invitations.map((i) => (
            <DropdownMenuItem key={i.id} onClick={() => open(setInvitation, i.id)} className="gap-2">
              <MailPlus />
              <span className="flex-1 truncate">{i.orgName}</span>
              <Tag tone="blue">{i.roleLabel}</Tag>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      )}
      <DropdownMenuItem onClick={() => open(setActivate, 'org')}>
        <Plus /> Buat organisasi
      </DropdownMenuItem>
      {!isMm && (
        <DropdownMenuItem onClick={() => open(setActivate, 'mm')} className="gap-2">
          <Compass />
          <span className="flex-1">Jadi Market Maker</span>
          {application && application.status !== 'approved' && <Tag tone={MM_STATUS[application.status][1]}>{MM_STATUS[application.status][0]}</Tag>}
        </DropdownMenuItem>
      )}
    </>
  )
}

function NewOrgDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateOrg()
  const navigate = useNavigate()
  const [f, setF] = useState<NewOrgInput>({ name: '', type: 'PT', npwp: '', categoryId: 'agri' })
  const submit = () =>
    create.mutate(f, {
      onSuccess: ({ orgId }) => {
        toast({ title: 'Organisasi dibuat', body: `${f.name.trim()} siap dipakai. Kamu Owner-nya.`, tone: 'green' })
        navigate(`/org/${orgId}`)
      },
    })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat organisasi</DialogTitle>
          <DialogDescription>Workspace bisnis baru dengan kamu sebagai Owner. Undang tim dan lengkapi verifikasi setelahnya.</DialogDescription>
        </DialogHeader>
        <Field label="Nama organisasi" placeholder="mis. CV Maju Bersama" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fieldError(create.error, 'name')} />
        <SelectField label="Jenis" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as NewOrgInput['type'] })} error={fieldError(create.error, 'type')}>
          {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
        </SelectField>
        <SelectField label="Kategori utama" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value as CategoryId })} error={fieldError(create.error, 'categoryId')}>
          {CATEGORY_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </SelectField>
        <Field label="NPWP (opsional)" inputMode="numeric" placeholder="15 atau 16 digit" value={f.npwp} onChange={(e) => setF({ ...f, npwp: e.target.value })} error={fieldError(create.error, 'npwp')} hint="Bisa dilengkapi nanti di Profil bisnis." />
        <FormError error={create.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!f.name.trim() || create.isPending} onClick={submit}>{create.isPending ? 'Membuat…' : 'Buat organisasi'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MmForm({ rejected, onClose }: { rejected?: MmApplication; onClose: () => void }) {
  const { data: me } = useMe()
  const apply = useApplyMm()
  const [f, setF] = useState<MmApplicationInput>({
    organization: rejected?.organization ?? me?.orgs[0]?.orgName ?? '', categories: rejected?.categories ?? [], experience: rejected?.experience ?? '', documents: rejected?.documents ?? '',
  })
  return (
    <>
      {rejected && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          <span className="font-medium">Pengajuan sebelumnya ditolak</span> {rejected.decision && formatRelative(rejected.decision.at)}: {rejected.decision?.reason}. Perbaiki lalu ajukan lagi.
        </p>
      )}
      <Field label="Organisasi" placeholder="Koperasi, asosiasi, atau aggregator" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} error={fieldError(apply.error, 'organization')} />
      <div className="flex flex-col gap-1">
        <CheckChips label="Fokus kategori" options={CATEGORY_OPTIONS} value={f.categories} onChange={(categories) => setF({ ...f, categories })} />
        {fieldError(apply.error, 'categories') && <p className="text-xs text-destructive">{fieldError(apply.error, 'categories')}</p>}
      </div>
      <TextareaField label="Pengalaman & motivasi" rows={4} placeholder="Siapa yang sudah kamu agregasi, volume, dan market apa yang ingin kamu bentuk" value={f.experience} onChange={(e) => setF({ ...f, experience: e.target.value })} error={fieldError(apply.error, 'experience')} />
      <TextareaField label="Catatan dokumen (opsional)" rows={2} placeholder="mis. SK koperasi, daftar anggota, tautan profil" value={f.documents} onChange={(e) => setF({ ...f, documents: e.target.value })} hint="Tim governance bisa meminta dokumennya saat review." />
      <FormError error={apply.error} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Batal</Button>
        <Button
          disabled={apply.isPending}
          onClick={() => apply.mutate(f, { onSuccess: () => toast({ title: 'Pengajuan Market Maker terkirim', body: 'Tim governance akan meninjau dan memberi kabar lewat notifikasi.', tone: 'green' }) })}
        >
          {apply.isPending ? 'Mengirim…' : 'Kirim pengajuan'}
        </Button>
      </DialogFooter>
    </>
  )
}

function MmDialog({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe()
  const query = useMmApplication()
  const a = query.data
  const isMm = me?.capabilities.includes('market_maker')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jadi Market Maker</DialogTitle>
          <DialogDescription>Market Maker membentuk market dari opportunity, mengatur aturan, dan menjalankan round auction. Pengajuan direview tim governance.</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : isMm || a?.status === 'approved' ? (
          <>
            <p className="text-sm">Akunmu sudah Market Maker. Workspace Market Ops ada di pemilih workspace.</p>
            <DialogFooter><Button render={<Link to="/mm" />}>Buka Market Ops</Button></DialogFooter>
          </>
        ) : a?.status === 'pending' ? (
          <>
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm">
              <p className="flex items-center gap-2"><Tag tone={MM_STATUS.pending[1]}>{MM_STATUS.pending[0]}</Tag> Diajukan {formatRelative(a.submittedAt)}</p>
              <p><span className="text-muted-foreground">Organisasi:</span> {a.organization}</p>
              <p><span className="text-muted-foreground">Kategori:</span> {a.categories.map((c) => CATEGORIES[c].label).join(', ')}</p>
            </div>
            <p className="text-sm text-muted-foreground">Kami kabari lewat notifikasi begitu ada keputusan.</p>
            <DialogFooter><Button variant="outline" onClick={onClose}>Tutup</Button></DialogFooter>
          </>
        ) : (
          <MmForm rejected={a ?? undefined} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InvitationDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useInvitations()
  const answer = useAnswerInvitation()
  const navigate = useNavigate()
  const inv = query.data?.find((i) => i.id === id)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undangan organisasi</DialogTitle>
          <DialogDescription>Bergabung memberi akses workspace bisnis sesuai peran yang diberikan Owner.</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : !inv ? (
          <>
            <p className="text-sm text-muted-foreground">Undangan ini sudah dijawab atau dibatalkan.</p>
            <DialogFooter><Button variant="outline" onClick={onClose}>Tutup</Button></DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
              <Building2 className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">{inv.orgName}</p>
                <p className="text-muted-foreground">{inv.roleLabel} · {inv.department} · diundang {formatRelative(inv.invitedAt)}</p>
              </div>
            </div>
            <FormError error={answer.error} />
            <DialogFooter>
              <Button
                variant="outline"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ id, action: 'decline' }, { onSuccess: () => { toast({ title: 'Undangan ditolak', body: inv.orgName, tone: 'gray' }); onClose() } })}
              >
                Tolak
              </Button>
              <Button
                disabled={answer.isPending}
                onClick={() => answer.mutate({ id, action: 'accept' }, { onSuccess: () => { toast({ title: `Bergabung ke ${inv.orgName}`, body: `Sebagai ${inv.roleLabel}.`, tone: 'green' }); navigate(`/org/${inv.orgId}`) } })}
              >
                {answer.isPending ? 'Memproses…' : 'Terima & buka'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}


export function ActivationDialogs() {
  const [activate, setActivate] = useParam('activate')
  const [invitation, setInvitation] = useParam('invitation')
  return (
    <>
      {activate === 'org' && <NewOrgDialog onClose={() => setActivate('')} />}
      {activate === 'mm' && <MmDialog onClose={() => setActivate('')} />}
      {invitation && <InvitationDialog id={invitation} onClose={() => setInvitation('')} />}
    </>
  )
}
