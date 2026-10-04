import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, ClipboardList, Gavel, Plus, Send, UsersRound } from 'lucide-react'
import type { CategoryId } from '@/domain/types'
import {
  PIPELINE, VISIBILITY, canConvertToAuction, pipelineStage, poolTotals, procurementActions, requiredApprovers, signingRoles, type PipelineStage,
  type ProcurementInput, type ProcurementRequest, type Visibility,
} from '@/domain/org'
import { CATEGORIES } from '@/domain/catalog'
import { formatDate, formatIdr, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useLocalDraft } from '@/lib/useLocalDraft'
import { toast } from '@/stores/toast'
import { useCreateProcurement, useOrgAccess, useProcurement, useProcurementAction, useProcurements, useSuppliers } from './hooks'
import { fromDate, inDays, toDate } from './utils'
import { ApprovalTrail, CheckChips, DecisionButtons, FilterPills, GuardedLink, OnBehalfNote, ProcurementBadge, Section } from './ui'
import { CategoryTag } from '@/features/economy/components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AuditLog } from '@/components/AuditLog'
import { Tag } from '@/components/Tag'
import { SummaryRow, Wizard } from '@/components/Wizard'
import { Field, FormError, SelectField, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

type Filter = '' | PipelineStage | 'closed'

// ── List ─────────────────────────────────────────────────────────

export function ProcurementListPage() {
  const access = useOrgAccess()
  const query = useProcurements()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('stage') ?? '') as Filter
  const stageOf = (r: ProcurementRequest): Filter => pipelineStage(r.status) ?? 'closed'
  const add = <GuardedLink to={`${access.base}/procurement/new`} reason={access.deny('procurement', 'create')}><Plus /> Buat procurement</GuardedLink>
  return (
    <>
      <PageHeader title="Procurement" description="Permintaan pengadaan tim: dari draft, approval, publish, sampai auction dan PO." icon={ClipboardList} tone="blue" actions={add} featured />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />}
        empty={<EmptyState icon={ClipboardList} tone="blue" title="Belum ada procurement" description="Catat kebutuhan tim; aturan approval berjalan otomatis sesuai nilai." action={add} />}>
        {(rows) => {
          const visible = filter ? rows.filter((r) => stageOf(r) === filter) : rows
          return (
            <>
              <FilterPills<Filter> label="Tahap" value={filter} onChange={(v) => setParams((p) => (v ? p.set('stage', v) : p.delete('stage'), p), { replace: true })}
                options={[['', 'Semua', rows.length], ...PIPELINE.map(([k, l]) => [k, l, rows.filter((r) => stageOf(r) === k).length] as [Filter, string, number]), ['closed', 'Ditolak/batal', rows.filter((r) => stageOf(r) === 'closed').length]]} />
              {visible.length ? (
                <DataTable
                  caption="Procurement"
                  rows={visible}
                  rowKey={(r) => r.id}
                  rowHref={(r) => `${access.base}/procurement/${r.id}`}
                  initialSort={{ key: 'updated', dir: 'desc' }}
                  columns={[
                    { key: 'need', header: 'Kebutuhan', primary: true, cell: (r) => <span>{r.need} <span className="ml-1 text-xs font-normal text-muted-foreground">{r.code}</span></span>, sortValue: (r) => r.need },
                    { key: 'cat', header: 'Kategori', cell: (r) => <CategoryTag id={r.categoryId} /> },
                    { key: 'qty', header: 'Kuantitas', align: 'right', cell: (r) => formatQty(r.quantity, { compact: true }), sortValue: (r) => r.quantity.value },
                    { key: 'budget', header: 'Budget', align: 'right', cell: (r) => formatIdr(r.budgetIdr, { compact: true }), sortValue: (r) => r.budgetIdr },
                    { key: 'status', header: 'Status', cell: (r) => <ProcurementBadge status={r.status} /> },
                    { key: 'vis', header: 'Visibilitas', cell: (r) => <Tag>{VISIBILITY[r.visibility].label}</Tag> },
                    { key: 'updated', header: 'Diperbarui', cell: (r) => <span className="text-muted-foreground">{formatRelative(r.updatedAt)}</span>, sortValue: (r) => r.updatedAt },
                  ]}
                />
              ) : <EmptyState title="Tidak ada procurement di tahap ini" />}
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

// ── Create ───────────────────────────────────────────────────────

interface Draft {
  need: string
  categoryId: CategoryId
  qty: string
  unit: string
  spec: string
  budget: string
  deadline: string
  deliveryLocation: string
  visibility: Visibility
  invited: string[]
}

const emptyDraft = (): Draft => ({ need: '', categoryId: 'packaging', qty: '', unit: 'pcs', spec: '', budget: '', deadline: toDate(inDays(21)), deliveryLocation: '', visibility: 'public', invited: [] })

export function ProcurementFormPage() {
  const access = useOrgAccess()
  const navigate = useNavigate()
  const create = useCreateProcurement()
  const suppliers = useSuppliers('')
  const [d, setD, clear] = useLocalDraft<Draft>(`ecp-draft-${access.orgId}-procurement`, emptyDraft())
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const qty = Number(d.qty)
  const budget = Number(d.budget)
  const approvers = requiredApprovers(budget || 0, 'procurement', access.settings?.approvalRules ?? [])
  const roleLabel = (r: string) => access.settings?.roles.find((x) => x.id === r)?.label ?? r
  const deny = access.deny('procurement', 'create')

  function submit(asSubmit: boolean) {
    const input: ProcurementInput = {
      need: d.need.trim(), categoryId: d.categoryId, quantity: { value: qty, unit: d.unit.trim() }, budgetIdr: budget, deadline: fromDate(d.deadline), spec: d.spec.trim(),
      deliveryLocation: d.deliveryLocation.trim() || (access.settings?.profile.location ?? ''), visibility: d.visibility, invitedSupplierIds: d.visibility === 'invite' ? d.invited : [],
    }
    create.mutate({ ...input, submit: asSubmit }, {
      onSuccess: (r) => {
        clear()
        toast({ title: asSubmit ? (r.status === 'pending_approval' ? 'Diajukan untuk approval' : 'Procurement disetujui otomatis') : 'Draft disimpan', body: r.code, tone: 'green' })
        navigate(`${access.base}/procurement/${r.id}`, { replace: true })
      },
    })
  }

  if (deny) return <EmptyState icon={Ban} title="Tidak bisa membuat procurement" description={deny} className="mt-8" />
  const options = (suppliers.data ?? []).filter((s) => s.relation !== 'blocked' && s.categories.includes(d.categoryId))

  return (
    <>
      <PageHeader title="Buat procurement" description="Kebutuhan, budget, dan siapa yang boleh menawar. Approval mengikuti aturan tim." icon={ClipboardList} tone="blue" featured />
      <Wizard
        submitLabel={approvers.length ? 'Ajukan untuk approval' : 'Ajukan'}
        submitting={create.isPending}
        onSubmit={() => submit(true)}
        error={<FormError error={create.error} />}
        steps={[
          {
            id: 'need', title: 'Kebutuhan', blocker: !d.need.trim() ? 'Isi kebutuhan' : !(qty > 0) ? 'Isi kuantitas' : undefined,
            content: (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Kebutuhan" placeholder="mis. Kertas kraft liner 150 gsm" value={d.need} onChange={(e) => set('need', e.target.value)} error={fieldError(create.error, 'need')} /></div>
                <SelectField label="Kategori" value={d.categoryId} onChange={(e) => set('categoryId', e.target.value as CategoryId)}>
                  {Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
                </SelectField>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Field label="Kuantitas" type="number" min={0} value={d.qty} onChange={(e) => set('qty', e.target.value)} error={fieldError(create.error, 'quantity')} />
                  <Field label="Satuan" value={d.unit} onChange={(e) => set('unit', e.target.value)} />
                </div>
                <div className="sm:col-span-2"><TextareaField label="Spesifikasi" placeholder="Grade, ukuran, standar, sertifikasi…" value={d.spec} onChange={(e) => set('spec', e.target.value)} /></div>
              </div>
            ),
          },
          {
            id: 'budget', title: 'Budget & pengiriman', blocker: !(budget > 0) ? 'Isi budget' : !d.deadline ? 'Isi deadline' : undefined,
            content: (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Budget total (Rp)" type="number" min={0} value={d.budget} onChange={(e) => set('budget', e.target.value)} error={fieldError(create.error, 'budgetIdr')} hint={qty > 0 && budget > 0 ? `≈ ${formatIdr(Math.round(budget / qty))} per ${d.unit}` : undefined} />
                <Field label="Deadline" type="date" value={d.deadline} onChange={(e) => set('deadline', e.target.value)} error={fieldError(create.error, 'deadline')} />
                <div className="sm:col-span-2"><Field label="Lokasi pengiriman" placeholder={access.settings?.profile.location} value={d.deliveryLocation} onChange={(e) => set('deliveryLocation', e.target.value)} /></div>
              </div>
            ),
          },
          {
            id: 'visibility', title: 'Visibilitas & approval', blocker: d.visibility === 'invite' && !d.invited.length ? 'Pilih supplier yang diundang' : undefined,
            content: (
              <div className="flex flex-col gap-5">
                <div role="radiogroup" aria-label="Visibilitas" className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(VISIBILITY) as Visibility[]).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={d.visibility === v} onClick={() => set('visibility', v)}
                      className={cn('rounded-lg border p-3 text-left text-sm', d.visibility === v ? 'border-primary ring-3 ring-primary/20' : 'hover:bg-hover')}>
                      <span className="font-medium">{VISIBILITY[v].label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{VISIBILITY[v].hint}</span>
                    </button>
                  ))}
                </div>
                {d.visibility === 'invite' && (
                  options.length
                    ? <CheckChips label="Supplier yang diundang" options={options.map((s) => [s.id, s.name])} value={d.invited} onChange={(v) => set('invited', v)} />
                    : <p className="text-sm text-muted-foreground">Belum ada supplier di kategori ini. <Link className="text-primary hover:underline" to={`${access.base}/suppliers`}>Cari supplier</Link></p>
                )}
                {fieldError(create.error, 'invited') && <p className="text-xs text-destructive">{fieldError(create.error, 'invited')}</p>}
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">Approval yang dibutuhkan</p>
                  <p className="mt-1 text-muted-foreground">
                    {approvers.length ? <>Budget {formatIdr(budget, { compact: true })} butuh persetujuan <b>{approvers.map(roleLabel).join(' + ')}</b>.</> : 'Di bawah ambang aturan approval: langsung disetujui saat diajukan.'}
                  </p>
                </div>
                <Button variant="outline" className="h-10 self-start" disabled={create.isPending} onClick={() => submit(false)}>Simpan sebagai draft</Button>
              </div>
            ),
          },
        ]}
        summary={
          <>
            <SummaryRow label="Kebutuhan" value={d.need} />
            <SummaryRow label="Kategori" value={CATEGORIES[d.categoryId].label} />
            <SummaryRow label="Kuantitas" value={qty > 0 ? formatQty({ value: qty, unit: d.unit }) : ''} />
            <SummaryRow label="Budget" value={budget > 0 ? formatIdr(budget, { compact: true }) : ''} />
            <SummaryRow label="Deadline" value={d.deadline ? formatDate(fromDate(d.deadline)) : ''} />
            <SummaryRow label="Visibilitas" value={VISIBILITY[d.visibility].label} />
            <SummaryRow label="Approval" value={approvers.length ? approvers.map(roleLabel).join(' + ') : 'Tidak perlu'} />
            <p className="mt-3 text-xs text-muted-foreground">Draft tersimpan otomatis.</p>
          </>
        }
      />
    </>
  )
}

// ── Detail ───────────────────────────────────────────────────────

function CollectiveDialog({ r }: { r: ProcurementRequest }) {
  const act = useProcurementAction(r.id)
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState(String(r.quantity.value))
  const [optIn, setOptIn] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-9" />}><UsersRound /> Gabung collective</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gabungkan dengan pembeli lain</DialogTitle>
          <DialogDescription>Demand-mu masuk ke pool {CATEGORIES[r.categoryId].label.toLowerCase()} yang cocok (atau pool baru) untuk harga skala.</DialogDescription>
        </DialogHeader>
        <Field label={`Kuantitas (${r.quantity.unit})`} type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} error={fieldError(act.error, 'quantity')} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Tampilkan nama bisnis kami ke peserta pool lain (opsional)
        </label>
        <FormError error={act.error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'collective', quantity: Number(qty), optIn }, { onSuccess: () => { setOpen(false); toast({ title: 'Masuk ke pool collective', tone: 'green' }) } })}>Gabungkan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProcurementDetailPage() {
  const { id = '' } = useParams()
  const access = useOrgAccess()
  const query = useProcurement(id)
  const act = useProcurementAction(id)
  const suppliers = useSuppliers('')
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {({ request: r, activity, pool }) => {
        const actions = procurementActions(r, access.role, access.settings?.permissions, access.settings?.activeRoles)
        const done = (title: string) => () => toast({ title, body: r.code, tone: 'green' })
        const roles = access.settings?.roles ?? []
        const totals = pool && poolTotals(pool)
        return (
          <>
            <PageHeader
              title={r.need}
              description={<span className="flex flex-wrap items-center gap-1.5">{r.code} <ProcurementBadge status={r.status} /> <CategoryTag id={r.categoryId} /> <Tag>{VISIBILITY[r.visibility].label}</Tag></span>}
              icon={ClipboardList}
              tone="blue"
              featured
              actions={
                <>
                  {actions.includes('submit') && <Button className="h-9" disabled={act.isPending} onClick={() => act.mutate({ action: 'submit' }, { onSuccess: done('Diajukan') })}><Send /> Ajukan</Button>}
                  {actions.includes('publish') && (
                    <ConfirmDialog trigger={<Button className="h-9">Publish</Button>} title={`Publish ${r.code}?`} confirmLabel="Publish"
                      impact={r.visibility === 'invite' ? `Hanya ${r.invitedSupplierIds.length} supplier yang diundang bisa melihat dan menawar.` : r.visibility === 'private' ? 'Tetap internal; tercatat sebagai siap dipenuhi.' : `Terlihat oleh supplier terverifikasi kategori ${CATEGORIES[r.categoryId].label}.`}
                      onConfirm={() => act.mutateAsync({ action: 'publish' }).then(done('Dipublish'))} />
                  )}
                  {canConvertToAuction(r, access.role, access.settings?.permissions) && <Button className="h-9" render={<Link to={`${access.base}/auctions/new?procurement=${r.id}`} />}><Gavel /> Jadikan auction</Button>}
                  {actions.includes('collective') && <CollectiveDialog r={r} />}
                  {r.auctionId && <Button variant="outline" className="h-9" render={<Link to={`${access.base}/auctions/${r.auctionId}/evaluate`} />}><Gavel /> Lihat auction</Button>}
                  {actions.includes('cancel') && (
                    <ConfirmDialog trigger={<Button variant="ghost" className="h-9">Batalkan</Button>} title={`Batalkan ${r.code}?`} destructive confirmLabel="Batalkan"
                      impact="Approval yang berjalan dihentikan dan supplier tidak bisa menawar lagi. Tercatat di audit trail."
                      onConfirm={() => act.mutateAsync({ action: 'cancel' }).then(done('Dibatalkan'))} />
                  )}
                </>
              }
            />
            <FormError error={act.error} />
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <Section title="Detail permintaan">
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {[
                      ['Kuantitas', formatQty(r.quantity)], ['Budget', formatIdr(r.budgetIdr)], ['Harga acuan', `${formatIdr(Math.round(r.budgetIdr / r.quantity.value))}/${r.quantity.unit}`],
                      ['Deadline', formatDate(r.deadline)], ['Lokasi pengiriman', r.deliveryLocation], ['Dibuat oleh', r.createdBy],
                    ].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="num font-medium">{v}</dd></div>)}
                  </dl>
                  {r.spec && <p className="mt-4 text-sm text-muted-foreground">{r.spec}</p>}
                </Section>
                {pool && totals && (
                  <Section title="Pool collective" actions={<Link to={`${access.base}/collective?pool=${pool.id}`} className="text-sm text-primary hover:underline">Buka pool</Link>}>
                    <p className="text-sm">{pool.title} · {totals.businesses} bisnis · total <b className="num">{formatQty({ value: totals.total, unit: pool.unit }, { compact: true })}</b></p>
                    <p className="mt-1 text-sm text-muted-foreground">Proyeksi harga {formatIdr(totals.unitPriceIdr)}/{pool.unit} (hemat {Math.round(totals.discount * 100)}% dari {formatIdr(pool.baseUnitPriceIdr)})</p>
                  </Section>
                )}
                <Section title="Aktivitas">
                  <AuditLog entries={activity} />
                </Section>
              </div>
              <aside className="flex flex-col gap-6">
                <Section title="Approval">
                  <ApprovalTrail required={r.requiredApprovers} approvals={r.approvals} roles={roles} />
                  {actions.includes('approve') && (
                    <div className="mt-4 border-t pt-4">
                      <p className="mb-2 text-sm">Menunggu persetujuanmu sebagai <b>{access.roleLabel}</b>.</p>
                      <OnBehalfNote signing={signingRoles(access.role, r.requiredApprovers, r.approvals, access.settings?.activeRoles)} own={access.role} roles={roles} />
                      <DecisionButtons
                        subject={r.code}
                        error={act.error}
                        impact={<>Budget <b>{formatIdr(r.budgetIdr)}</b> untuk {formatQty(r.quantity)} {r.need}. Persetujuanmu tercatat di audit trail{r.requiredApprovers.length > 1 ? ' dan approval lain tetap diperlukan' : ''}.</>}
                        onDecide={(a, note) => act.mutateAsync({ action: a, note }).then(done(a === 'approve' ? 'Disetujui' : 'Ditolak'))}
                      />
                    </div>
                  )}
                  {r.status === 'pending_approval' && !actions.includes('approve') && <p className="mt-4 text-xs text-muted-foreground">Halaman ini memperbarui sendiri saat anggota tim menyetujui.</p>}
                </Section>
                {r.visibility === 'invite' && r.invitedSupplierIds.length > 0 && (
                  <Section title="Supplier diundang">
                    <ul className="text-sm">{r.invitedSupplierIds.map((s) => <li key={s}><Link className="text-primary hover:underline" to={`${access.base}/suppliers/${s}`}>{suppliers.data?.find((x) => x.id === s)?.name ?? s}</Link></li>)}</ul>
                  </Section>
                )}
              </aside>
            </div>
          </>
        )
      }}
    </AsyncView>
  )
}
