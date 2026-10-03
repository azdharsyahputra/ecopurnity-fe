import { useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, FileCheck2, FileText } from 'lucide-react'
import { formatDateTime, formatRelative } from '@/domain/format'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useAdminAction, useVerification, useVerifications } from './hooks'
import { DOC_KIND, VERIFICATION_STATUS } from './labels'
import type { DocKind, VerificationRequest } from './types'
import { BackLink, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { Segmented } from '@/components/form'
import { Skeleton } from '@/components/ui/skeleton'

const SLA_HOURS = 48

function StatusTag({ v }: { v: VerificationRequest }) {
  const [label, tone] = VERIFICATION_STATUS[v.status]
  return <Tag tone={tone}>{label}</Tag>
}

export function VerificationQueuePage() {
  const query = useVerifications()
  return (
    <>
      <PageHeader title="Verifikasi bisnis" description={`Antrean dokumen NIB, NPWP, dan akta. Target review ${SLA_HOURS} jam sejak diajukan.`} icon={FileCheck2} tone="orange" />
      <AsyncView query={query} skeleton={<Skeleton className="h-72 rounded-xl" />} empty={<EmptyState icon={FileCheck2} title="Antrean kosong" description="Pengajuan verifikasi bisnis baru akan muncul di sini." />}>
        {(rows) => (
          <DataTable
            caption="Antrean verifikasi"
            rows={rows}
            rowKey={(v) => v.id}
            rowHref={(v) => `/admin/verification/${v.id}`}
            initialSort={{ key: 'age', dir: 'asc' }}
            columns={[
              { key: 'business', header: 'Bisnis', primary: true, cell: (v) => v.business },
              { key: 'owner', header: 'Pengaju', cell: (v) => v.owner },
              { key: 'docs', header: 'Dokumen', cell: (v) => v.documents.map((d) => DOC_KIND[d.kind]).join(', ') },
              {
                key: 'age', header: 'Diajukan', sortValue: (v) => v.submittedAt,
                cell: (v) => {
                  const late = v.status === 'pending' && Date.now() - new Date(v.submittedAt).getTime() > SLA_HOURS * 3_600_000
                  return <span className={cn(late && 'font-medium text-destructive')}>{formatRelative(v.submittedAt)}{late && ' · lewat SLA'}</span>
                },
              },
              { key: 'status', header: 'Status', cell: (v) => <StatusTag v={v} /> },
            ]}
          />
        )}
      </AsyncView>
    </>
  )
}

/** Mock document "viewer": the page as a paper card with the fields the BE read from it. */
function DocumentViewer({ v }: { v: VerificationRequest }) {
  const [params, setParams] = useSearchParams()
  const kind = params.get('doc') ?? v.documents[0]?.kind
  const doc = v.documents.find((d) => d.kind === kind) ?? v.documents[0]
  const formValue = (label: string) => v.form.find((f) => f.label === label)?.value
  if (!doc) return <EmptyState icon={FileText} title="Belum ada dokumen" />
  return (
    <Panel title="Dokumen" action={<Segmented label="Pilih dokumen" value={doc.kind} options={v.documents.map((d): [DocKind, string] => [d.kind, DOC_KIND[d.kind]])} onChange={(k) => setParams((p) => (p.set('doc', k), p), { replace: true })} />}>
      <figure className="rounded-lg border bg-background p-4 shadow-sm">
        <figcaption className="mb-3 flex items-center gap-2 border-b pb-3 text-sm">
          <FileText className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{doc.fileName}</span>
          <Tag>{DOC_KIND[doc.kind]}</Tag>
          {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">Buka file</a>}
        </figcaption>
        {doc.url && !/\.pdf$/i.test(doc.fileName) && <img src={doc.url} alt={doc.fileName} className="mb-3 max-h-80 w-full rounded object-contain" />}
        {v.nik && <p className="mb-3 font-mono text-sm"><span className="font-sans text-xs text-muted-foreground">NIK </span>{v.nik}</p>}
        <p className="text-center text-xs tracking-widest text-muted-foreground uppercase">{DOC_KIND[doc.kind]}</p>
        <dl className="mt-4 flex flex-col gap-2 font-mono text-sm">
          {doc.fields.map((f) => {
            const expected = formValue(f.label)
            const mismatch = expected !== undefined && expected.toLowerCase() !== f.value.toLowerCase()
            return (
              <div key={f.label} className={cn('rounded px-2 py-1', mismatch && 'ring-1 ring-destructive')} style={mismatch ? { background: 'var(--tag-red-bg)' } : undefined}>
                <dt className="font-sans text-xs text-muted-foreground">{f.label}</dt>
                <dd className="break-words">{f.value}</dd>
                {mismatch && <p className="mt-0.5 flex items-center gap-1 font-sans text-xs" style={{ color: 'var(--tag-red-fg)' }}><AlertTriangle className="size-3" /> Formulir: {expected}</p>}
              </div>
            )
          })}
        </dl>
      </figure>
    </Panel>
  )
}

function FormData({ v }: { v: VerificationRequest }) {
  const docValues = (label: string) => v.documents.flatMap((d) => d.fields.filter((f) => f.label === label).map((f) => f.value))
  return (
    <Panel title="Data formulir">
      <dl className="flex flex-col gap-2 text-sm">
        {v.form.map((f) => {
          const seen = docValues(f.label)
          const ok = seen.length > 0 && seen.every((x) => x.toLowerCase() === f.value.toLowerCase())
          return (
            <div key={f.label} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="break-words">{f.value}</dd>
              </div>
              {seen.length > 0 && (ok ? <Tag tone="green"><Check className="size-3" /> Cocok</Tag> : <Tag tone="red">Beda</Tag>)}
            </div>
          )
        })}
      </dl>
    </Panel>
  )
}

export function VerificationDetailPage() {
  const { id = '' } = useParams()
  const query = useVerification(id)
  const act = useAdminAction(`verifications/${id}`)
  return (
    <>
      <BackLink to="/admin/verification">Verifikasi bisnis</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(v) => (
          <>
            <PageHeader
              title={v.business}
              description={<span className="flex flex-wrap items-center gap-1.5">Diajukan {v.owner} · {formatDateTime(v.submittedAt)} <StatusTag v={v} /></span>}
              actions={
                v.status === 'pending' && (
                  <>
                    <ReasonDialog action={act} name="approve" label="Approve" variant="default" reasonOptional title={`Setujui ${v.business}?`} confirmLabel="Setujui"
                      impact="Bisnis mendapat badge terverifikasi dan bisa menjadi pembeli/supplier di market yang mensyaratkan legalitas."
                      body={(reason) => ({ action: 'approve', reason })} onDone={() => toast({ title: 'Verifikasi disetujui', body: v.business, tone: 'green' })} reasonLabel="Catatan" />
                    <ReasonDialog action={act} name="reupload" label="Minta unggah ulang" title="Minta unggah ulang dokumen" confirmLabel="Kirim permintaan"
                      impact="Pengaju diberi tahu dokumen mana yang perlu diganti; antrean menunggu sampai dokumen baru masuk."
                      body={(reason) => ({ action: 'reupload', reason })} onDone={() => toast({ title: 'Permintaan unggah ulang dikirim', tone: 'blue' })} reasonLabel="Dokumen apa dan kenapa" />
                    <ReasonDialog action={act} name="reject" label="Reject" destructive title={`Tolak ${v.business}?`} confirmLabel="Tolak pengajuan"
                      impact="Pengajuan ditutup. Pengaju harus mengajukan ulang dari awal."
                      body={(reason) => ({ action: 'reject', reason })} onDone={() => toast({ title: 'Verifikasi ditolak', body: v.business })} />
                  </>
                )
              }
            />
            {v.decision && (
              <p className="mb-6 rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">{VERIFICATION_STATUS[v.status][0]}</span> oleh {v.decision.by}, {formatRelative(v.decision.at)}: {v.decision.note}
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <DocumentViewer v={v} />
              <FormData v={v} />
            </div>
          </>
        )}
      </AsyncView>
    </>
  )
}
