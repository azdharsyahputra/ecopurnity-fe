import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { ACTIONS, MODULES, can, type Action, type ApprovalRule, type ApprovalSubject, type Module, type OrgSettings, type TeamData } from '@/domain/org'
import { formatIdr, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useInvite, useMemberAction, useOrgAccess, useSaveTeamSettings, useTeam } from './hooks'
import { CheckChips, GuardedButton, Section } from './ui'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Tag } from '@/components/Tag'
import { Field, FormError, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const TABS = ['members', 'roles', 'departments', 'approval'] as const
const TAB_LABEL = { members: 'Anggota', roles: 'Peran & izin', departments: 'Departemen', approval: 'Aturan approval' }
const inline = 'h-8 rounded-md border border-input bg-background px-2 text-sm dark:bg-input/30'

function InviteDialog({ team, onClose }: { team: TeamData; onClose: () => void }) {
  const invite = useInvite()
  const [f, setF] = useState({ email: '', role: 'procurement', department: team.departments[0] ?? '' })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Undang anggota</DialogTitle>
          <DialogDescription>Undangan dikirim ke email. Izin mengikuti peran yang kamu pilih.</DialogDescription>
        </DialogHeader>
        <Field label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fieldError(invite.error, 'email')} />
        <SelectField label="Peran" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} error={fieldError(invite.error, 'role')}>
          {team.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </SelectField>
        <SelectField label="Departemen" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
          {team.departments.map((d) => <option key={d}>{d}</option>)}
        </SelectField>
        <FormError error={invite.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!f.email || invite.isPending} onClick={() => invite.mutate(f, { onSuccess: () => { toast({ title: 'Undangan terkirim', body: f.email, tone: 'green' }); onClose() } })}>
            {invite.isPending ? 'Mengirim…' : 'Kirim undangan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Members({ team, readOnly }: { team: TeamData; readOnly?: string }) {
  const act = useMemberAction()
  const roleLabel = (id: string) => team.roles.find((r) => r.id === id)?.label ?? id
  return (
    <>
      <DataTable
        caption="Anggota tim"
        rows={team.members}
        rowKey={(m) => m.id}
        columns={[
          { key: 'name', header: 'Anggota', primary: true, cell: (m) => <span className="inline-flex min-w-0 items-center gap-2"><EntityAvatar name={m.name} size={24} /><span className="min-w-0"><span className="block truncate">{m.name}</span>{m.name !== m.email && <span className="block truncate text-xs font-normal text-muted-foreground">{m.email}</span>}</span></span>, sortValue: (m) => m.name },
          {
            key: 'role', header: 'Peran',
            cell: (m) => readOnly ? <Tag tone="blue">{roleLabel(m.role)}</Tag> : (
              <select aria-label={`Peran ${m.name}`} className={inline} value={m.role} onChange={(e) => act.mutate({ id: m.id, role: e.target.value }, { onSuccess: () => toast({ title: `Peran ${m.name} diubah`, tone: 'green' }) })}>
                {team.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            ),
          },
          {
            key: 'dept', header: 'Departemen',
            cell: (m) => readOnly ? m.department : (
              <select aria-label={`Departemen ${m.name}`} className={inline} value={m.department} onChange={(e) => act.mutate({ id: m.id, department: e.target.value })}>
                {[...new Set([m.department, ...team.departments])].map((d) => <option key={d}>{d}</option>)}
              </select>
            ),
          },
          { key: 'status', header: 'Status', cell: (m) => (m.status === 'active' ? <Tag tone="green">Aktif</Tag> : <Tag tone="yellow">Diundang {formatRelative(m.joinedAt)}</Tag>) },
          {
            key: 'act', header: 'Aksi',
            cell: (m) => readOnly ? '—' : (
              <ConfirmDialog
                trigger={<Button variant="ghost" size="icon-sm" aria-label={`Keluarkan ${m.name}`}><Trash2 /></Button>}
                title={`Keluarkan ${m.name}?`}
                impact={<>Akses ke workspace ini dicabut segera. Approval yang menunggu peran <b>{roleLabel(m.role)}</b> tetap menunggu anggota lain dengan peran yang sama.</>}
                confirmLabel="Keluarkan"
                destructive
                onConfirm={() => act.mutateAsync({ id: m.id, remove: true }).then(() => toast({ title: `${m.name} dikeluarkan`, tone: 'gray' }))}
              />
            ),
          },
        ]}
      />
      <FormError error={act.error} />
      {fieldError(act.error, 'role') && <p className="mt-2 text-sm text-destructive">{fieldError(act.error, 'role')}</p>}
    </>
  )
}

type Draft = Pick<OrgSettings, 'roles' | 'permissions' | 'departments' | 'approvalRules'>

function SettingsEditor({ team, tab, readOnly }: { team: TeamData; tab: (typeof TABS)[number]; readOnly?: string }) {
  const initial: Draft = { roles: team.roles, permissions: team.permissions, departments: team.departments, approvalRules: team.approvalRules }
  const [d, setD] = useState(initial)
  const [role, setRole] = useState('procurement')
  const [newRole, setNewRole] = useState('')
  const [newDept, setNewDept] = useState('')
  const save = useSaveTeamSettings()
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const roleOpts = d.roles.map((r) => [r.id, r.label] as [string, string])
  const toggle = (m: Module, a: Action) => {
    const cur = d.permissions[role]?.[m] ?? []
    const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]
    setD({ ...d, permissions: { ...d.permissions, [role]: { ...d.permissions[role], [m]: next } } })
  }
  const rule = (i: number, patch: Partial<ApprovalRule>) => setD({ ...d, approvalRules: d.approvalRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={!!readOnly} className="min-w-0">
        {tab === 'roles' && (
          <Section title="Matriks izin" actions={
            <select aria-label="Peran yang diatur" className={inline} value={role} onChange={(e) => setRole(e.target.value)}>
              {d.roles.map((r) => <option key={r.id} value={r.id}>{r.label}{r.custom ? ' (custom)' : ''}</option>)}
            </select>
          }>
            {role === 'owner' && <p className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Info className="size-4" /> Owner selalu punya semua izin.</p>}
            <table className="w-full text-sm">
              <caption className="sr-only">Izin peran {d.roles.find((r) => r.id === role)?.label}</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th scope="col" className="py-2 font-medium">Modul</th>{(Object.keys(ACTIONS) as Action[]).map((a) => <th key={a} scope="col" className="py-2 text-center font-medium">{ACTIONS[a]}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {(Object.keys(MODULES) as Module[]).map((m) => (
                  <tr key={m}>
                    <th scope="row" className="py-2 text-left font-normal">{MODULES[m]}</th>
                    {(Object.keys(ACTIONS) as Action[]).map((a) => (
                      <td key={a} className="py-2 text-center">
                        <input type="checkbox" className="size-4 accent-primary" aria-label={`${MODULES[m]}: ${ACTIONS[a]}`} disabled={role === 'owner'} checked={can(d.permissions, role, m, a)} onChange={() => toggle(m, a)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
              <div className="flex-1"><Field label="Peran custom baru" placeholder="mis. Quality Control" value={newRole} onChange={(e) => setNewRole(e.target.value)} error={fieldError(save.error, 'roles')} /></div>
              <Button variant="outline" className="h-10" disabled={!newRole.trim()} onClick={() => {
                const id = `custom-${newRole.trim().toLowerCase().replace(/\W+/g, '-')}`
                setD({ ...d, roles: [...d.roles, { id, label: newRole.trim(), custom: true }], permissions: { ...d.permissions, [id]: { procurement: ['view'], inventory: ['view'] } } })
                setRole(id)
                setNewRole('')
              }}><Plus /> Tambah peran</Button>
            </div>
          </Section>
        )}

        {tab === 'departments' && (
          <Section title="Departemen">
            <ul className="flex flex-wrap gap-1.5">
              {d.departments.map((x) => (
                <li key={x}><Tag>{x} {!readOnly && <button type="button" aria-label={`Hapus departemen ${x}`} onClick={() => setD({ ...d, departments: d.departments.filter((y) => y !== x) })}>×</button>}</Tag></li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1"><Field label="Departemen baru" value={newDept} onChange={(e) => setNewDept(e.target.value)} /></div>
              <Button variant="outline" className="h-10" disabled={!newDept.trim() || d.departments.includes(newDept.trim())} onClick={() => { setD({ ...d, departments: [...d.departments, newDept.trim()] }); setNewDept('') }}><Plus /> Tambah</Button>
            </div>
          </Section>
        )}

        {tab === 'approval' && (
          <Section title="Aturan approval" actions={!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setD({ ...d, approvalRules: [...d.approvalRules, { id: `rule-${Date.now().toString(36)}`, label: 'Aturan baru', minAmountIdr: 100_000_000, approvers: ['owner'], appliesTo: ['procurement'] }] })}><Plus /> Aturan</Button>
          )}>
            <p className="mb-4 text-sm text-muted-foreground">Nilai di atas ambang butuh persetujuan setiap peran yang dipilih. Beberapa aturan bisa berlaku sekaligus.</p>
            <ol className="flex flex-col gap-4">
              {d.approvalRules.map((r, i) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                    <Field label="Nama aturan" value={r.label} onChange={(e) => rule(i, { label: e.target.value })} error={fieldError(save.error, `rule-${i}`)} />
                    <Field label="Ambang (Rp)" type="number" min={0} value={String(r.minAmountIdr)} onChange={(e) => rule(i, { minAmountIdr: Number(e.target.value) })} hint={`> ${formatIdr(r.minAmountIdr, { compact: true })}`} />
                    {!readOnly && <Button variant="ghost" size="icon" aria-label={`Hapus aturan ${r.label}`} onClick={() => setD({ ...d, approvalRules: d.approvalRules.filter((_, j) => j !== i) })}><Trash2 /></Button>}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <CheckChips label="Wajib disetujui" options={roleOpts} value={r.approvers} onChange={(v) => rule(i, { approvers: v })} disabled={!!readOnly} />
                    <CheckChips<ApprovalSubject> label="Berlaku untuk" options={[['procurement', 'Procurement'], ['auction', 'Auction']]} value={r.appliesTo} onChange={(v) => rule(i, { appliesTo: v })} disabled={!!readOnly} />
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </fieldset>
      <FormError error={save.error} />
      <div className="flex items-center justify-end gap-3">
        {dirty && <Button variant="ghost" className="h-10" onClick={() => setD(initial)}>Batalkan perubahan</Button>}
        <GuardedButton className="h-10 px-5" reason={readOnly} disabled={!dirty || save.isPending} onClick={() => save.mutate(d, { onSuccess: () => toast({ title: 'Pengaturan tim disimpan', tone: 'green' }) })}>
          {save.isPending ? 'Menyimpan…' : 'Simpan pengaturan'}
        </GuardedButton>
      </div>
    </div>
  )
}

export function TeamPage() {
  const access = useOrgAccess()
  const query = useTeam()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as (typeof TABS)[number]) : 'members'
  const set = (k: string, v: string | null) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const readOnly = access.deny('team', 'manage')
  return (
    <>
      <PageHeader
        title="Tim"
        description="Anggota, peran, izin per modul, departemen, dan aturan approval."
        icon={Users}
        tone="blue"
        featured
        actions={<GuardedButton className="h-9" reason={readOnly} onClick={() => set('invite', '1')}><UserPlus /> Undang anggota</GuardedButton>}
      />
      {readOnly && <p className="-mt-4 mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"><Info className="size-4" /> Hanya Owner yang bisa mengubah tim. Kamu melihat dalam mode baca.</p>}
      <Tabs value={tab} onValueChange={(v) => set('tab', v === 'members' ? null : String(v))}>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
          <TabsList>{TABS.map((t) => <TabsTrigger key={t} value={t} className="px-3">{TAB_LABEL[t]}</TabsTrigger>)}</TabsList>
        </div>
      </Tabs>
      <div className="mt-6">
        <AsyncView query={query} skeleton={<Skeleton className="h-80 rounded-xl" />}>
          {(team) => (
            <>
              {tab === 'members' ? <Members team={team} readOnly={readOnly} /> : <SettingsEditor key={JSON.stringify([team.roles, team.permissions, team.departments, team.approvalRules])} team={team} tab={tab} readOnly={readOnly} />}
              {params.get('invite') && !readOnly && <InviteDialog team={team} onClose={() => set('invite', null)} />}
            </>
          )}
        </AsyncView>
      </div>
    </>
  )
}
