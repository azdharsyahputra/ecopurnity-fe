import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, Cpu, Search, ShieldAlert, Siren } from 'lucide-react'
import type { Tone } from '@/domain/status'
import { formatDateTime, formatNumber, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useAdminAction, useAlert, useAlerts } from './hooks'
import { ALERT_STATUS, ALERT_TYPE } from './labels'
import type { AlertStatus, EscalationAction, FraudAlert, Subject } from './types'
import { BackLink, Panel, ReasonDialog, SystemBadge } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { AuditLog } from '@/components/AuditLog'
import { Field, FormError, Segmented, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function AlertStatusTag({ status }: { status: AlertStatus }) {
  const [label, tone] = ALERT_STATUS[status]
  return <Tag tone={tone}>{label}</Tag>
}

export function FraudPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('status') ?? 'active'
  const query = useAlerts()
  return (
    <>
      <PageHeader
        title="Fraud detection"
        description="Sinyal dari engine adalah rekomendasi, bukan putusan. Buka investigasi untuk melihat tindakan; setiap keputusan butuh alasan tertulis."
        icon={ShieldAlert}
        tone="orange"
        actions={<Segmented label="Tampilkan" value={view} options={[['active', 'Perlu ditangani'], ['done', 'Selesai'], ['all', 'Semua']]} onChange={(v) => setParams((p) => (p.set('status', v), p), { replace: true })} />}
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} emptyFallback={false}>
        {(all) => {
          const active = (a: FraudAlert) => a.status === 'new' || a.status === 'investigating'
          const rows = all.filter((a) => view === 'all' || (view === 'active') === active(a))
          const investigating = all.filter((a) => a.status === 'investigating').length
          const escalated = all.filter((a) => a.status === 'escalated').length
          const highScore = all.filter((a) => a.source === 'system' && a.score >= 80).length
          return (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-300"><ShieldAlert className="size-4" /></span>Alert aktif</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(all.filter(active).length)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Baru atau sedang diinvestigasi</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300"><Search className="size-4" /></span>Investigasi berjalan</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(investigating)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Kasus yang sedang ditinjau Admin</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300"><Siren className="size-4" /></span>Skor sistem ≥ 80</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(highScore)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sinyal engine untuk diperiksa</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300"><Activity className="size-4" /></span>Dieskalasi</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(escalated)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sudah diteruskan ke tindakan</p>
                </div>
              </div>
              <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                  <div><h2 className="font-semibold">Daftar alert</h2><p className="mt-0.5 text-sm text-muted-foreground">Tinjau sinyal dan bukti sebelum mengambil keputusan.</p></div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{formatNumber(rows.length)} ditampilkan</span>
                </div>
                {rows.length ? (
                  <DataTable
                    caption="Fraud alert"
                    rows={rows}
                    rowKey={(a) => a.id}
                    rowHref={(a) => `/admin/fraud/${a.id}`}
                    initialSort={{ key: 'score', dir: 'desc' }}
                    columns={[
                      { key: 'title', header: 'Alert', primary: true, cell: (a) => <span>{a.title} <span className="text-xs font-normal text-muted-foreground">{a.code}</span></span> },
                      { key: 'type', header: 'Jenis', cell: (a) => ALERT_TYPE[a.type].label },
                      { key: 'score', header: 'Skor', align: 'right', cell: (a) => (a.source === 'system' ? a.score : 'Manual'), sortValue: (a) => a.score },
                      { key: 'detected', header: 'Terdeteksi', cell: (a) => formatRelative(a.detectedAt), sortValue: (a) => a.detectedAt },
                      { key: 'status', header: 'Status', cell: (a) => <AlertStatusTag status={a.status} /> },
                    ]}
                  />
                ) : <EmptyState icon={ShieldAlert} title="Tidak ada alert di tampilan ini" description={all.length ? 'Pilih filter lain untuk melihat status alert yang berbeda.' : 'Alert baru dari engine akan muncul otomatis.'} className="m-4 sm:m-5" />}
              </section>
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

const NODE_TONE: Record<string, Tone> = { person: 'blue', business: 'teal', auction: 'purple', device: 'gray' }


function RelationGraph({ graph }: { graph: NonNullable<FraudAlert['graph']> }) {
  const { nodes, edges } = useMemo(() => {
    const r = 200
    const nodes: Node[] = graph.nodes.map((n, i) => {
      const a = (i / graph.nodes.length) * Math.PI * 2
      const tone = n.flagged ? 'red' : NODE_TONE[n.kind]
      return {
        id: n.id, position: { x: Math.cos(a) * r, y: Math.sin(a) * r }, data: { label: n.label },
        style: { background: `var(--tag-${tone}-bg)`, color: `var(--tag-${tone}-fg)`, border: n.flagged ? '1.5px solid currentColor' : '1px solid var(--border)', borderRadius: n.kind === 'person' ? 999 : 10, fontSize: 12, width: 160 },
      }
    })
    const edges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`, source: e.source, target: e.target, label: e.label, style: { stroke: 'var(--muted-foreground)' },
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 }, labelBgStyle: { fill: 'var(--card)' },
    }))
    return { nodes, edges }
  }, [graph])
  return (
    <div className="h-[380px] overflow-hidden rounded-lg border" role="group" aria-label={`Graf relasi: ${graph.nodes.map((n) => n.label).join(', ')}`}>
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesConnectable={false}>
        <Background color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

const SUBJECT_HREF: Record<Subject['type'], string> = { user: '/admin/users', auction: '/admin/auctions', market: '/admin/markets' }
const ESCALATIONS: Record<Subject['type'], [EscalationAction, string][]> = {
  user: [['suspend_user', 'Suspend akun'], ['restrict_user', 'Batasi akun']],
  auction: [['freeze_auction', 'Freeze auction']],
  market: [['suspend_market', 'Suspend market']],
}

function CaseFile({ a }: { a: FraudAlert }) {
  const act = useAdminAction(`alerts/${a.id}`)
  const note = useAdminAction(`alerts/${a.id}`)
  const [text, setText] = useState('')
  const [subjectId, setSubjectId] = useState(a.subjects[0].id)
  const subject = a.subjects.find((s) => s.id === subjectId) ?? a.subjects[0]
  const [choice, setChoice] = useState<EscalationAction | ''>('')
  const escalation = choice && ESCALATIONS[subject.type].some(([k]) => k === choice) ? choice : ESCALATIONS[subject.type][0][0]
  const inv = a.investigation!
  return (
    <Panel title="Kasus investigasi">
      <p className="text-sm text-muted-foreground">Dibuka {inv.by}, {formatDateTime(inv.openedAt)}</p>
      {a.status === 'investigating' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ReasonDialog action={act} name="escalate" label="Eskalasi ke tindakan" destructive title={`Eskalasi ${a.code}`} confirmLabel="Jalankan tindakan"
            extra={
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Subjek" value={subject.id} onChange={(e) => setSubjectId(e.target.value)} error={fieldError(act.error, 'subjectId')}>
                  {a.subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </SelectField>
                <SelectField label="Tindakan" value={escalation} onChange={(e) => setChoice(e.target.value as EscalationAction)}>
                  {ESCALATIONS[subject.type].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectField>
              </div>
            }
            impact={`${ESCALATIONS[subject.type].find(([k]) => k === escalation)?.[1]}: ${subject.label}. Tercatat di audit trail subjek dan kasus ini; kasus ditutup sebagai dieskalasi.`}
            body={(reason) => ({ action: 'escalate', subjectId: subject.id, escalation, reason })} onDone={() => toast({ title: `${a.code} dieskalasi`, body: subject.label })} />
          <ReasonDialog action={act} name="dismiss" label="Dismiss" title={`Dismiss ${a.code}?`} confirmLabel="Dismiss alert"
            impact="Alert ditandai bukan pelanggaran. Alasanmu dipakai untuk melatih ulang engine."
            body={(reason) => ({ action: 'dismiss', reason })} onDone={() => toast({ title: `${a.code} di-dismiss` })} />
          <ReasonDialog action={act} name="close" label="Tutup tanpa tindakan" title={`Tutup ${a.code}?`} confirmLabel="Tutup kasus"
            impact="Kasus ditutup tanpa tindakan pada subjek; riwayatnya tetap tersimpan."
            body={(reason) => ({ action: 'close', reason })} onDone={() => toast({ title: `${a.code} ditutup` })} />
        </div>
      )}
      <h3 className="mt-5 text-sm font-medium">Catatan</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {inv.notes.map((n, i) => (
          <li key={i} className="rounded-lg bg-muted px-3 py-2 text-sm"><p>{n.text}</p><p className="mt-0.5 text-xs text-muted-foreground">{n.by} · {formatRelative(n.at)}</p></li>
        ))}
        {!inv.notes.length && <li className="text-sm text-muted-foreground">Belum ada catatan.</li>}
      </ul>
      {a.status === 'investigating' && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            note.mutate({ action: 'note', text }, { onSuccess: () => setText('') })
          }}
        >
          <div className="flex-1"><Field label="Tambah catatan" value={text} onChange={(e) => setText(e.target.value)} error={fieldError(note.error, 'text')} /></div>
          <Button type="submit" variant="outline" className="h-10" disabled={note.isPending}>Simpan</Button>
        </form>
      )}
      <FormError error={note.error} />
    </Panel>
  )
}

export function FraudAlertPage() {
  const { id = '' } = useParams()
  const query = useAlert(id)
  const act = useAdminAction(`alerts/${id}`)
  return (
    <>
      <BackLink to="/admin/fraud">Fraud detection</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(a) => (
          <>
            <PageHeader
              title={a.title}
              description={<span className="flex flex-wrap items-center gap-1.5">{a.code} · {ALERT_TYPE[a.type].label} · {formatRelative(a.detectedAt)} <AlertStatusTag status={a.status} /></span>}
            />
            <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <SystemBadge source={a.source} score={a.score} confidence={a.confidence} />
                <p className="mt-2 text-sm text-muted-foreground">
                  {a.source === 'system' ? 'Engine menilai pola ini berisiko. Ini bukan putusan; periksa bukti sebelum mengambil tindakan.' : 'Kasus dibuka manual oleh Admin dari temuan auction.'}
                </p>
              </div>
              {a.status === 'new' && (
                <Button className="h-9" disabled={act.isPending} onClick={() => act.mutate({ action: 'investigate' }, { onSuccess: () => toast({ title: `Investigasi ${a.code} dibuka`, tone: 'blue' }) })}>
                  <Search /> Investigate
                </Button>
              )}
            </div>
            <FormError error={act.error} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-6">
                {a.resolution && (
                  <Panel title="Hasil">
                    <p className="text-sm font-medium">{a.resolution.outcome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.resolution.by} · {formatDateTime(a.resolution.at)}</p>
                    <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-sm">Alasan: {a.resolution.reason}</p>
                  </Panel>
                )}
                <Panel title="Bukti" action={<Tag tone="purple"><Cpu className="size-3" /> {a.source === 'system' ? 'Dari engine' : 'Dari temuan auction'}</Tag>}>
                  {a.evidence.length ? (
                    <ul className="list-disc pl-5 text-sm">{a.evidence.map((e) => <li key={e} className="py-0.5">{e}</li>)}</ul>
                  ) : <p className="text-sm text-muted-foreground">Belum ada bukti tercatat.</p>}
                </Panel>
                {a.graph && ALERT_TYPE[a.type].network && <Panel title="Graf relasi"><RelationGraph graph={a.graph} /></Panel>}
                {a.investigation && <CaseFile a={a} />}
              </div>
              <div className="flex flex-col gap-6">
                <Panel title="Subjek">
                  <ul className="flex flex-col gap-2 text-sm">
                    {a.subjects.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <Link to={`${SUBJECT_HREF[s.type]}/${s.id}`} className="min-w-0 truncate hover:underline">{s.label}</Link>
                        <Tag>{{ user: 'Akun', auction: 'Auction', market: 'Market' }[s.type]}</Tag>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Aktivitas admin"><AuditLog entries={a.audit} /></Panel>
              </div>
            </div>
          </>
        )}
      </AsyncView>
    </>
  )
}
