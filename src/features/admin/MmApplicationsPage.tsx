import { Compass } from 'lucide-react'
import { CATEGORIES } from '@/domain/catalog'
import { formatDateTime, formatRelative } from '@/domain/format'
import { MM_STATUS, type MmApplication } from '@/domain/roles'
import { toast } from '@/stores/toast'
import { useMmApplications } from '@/features/roles/hooks'
import { useAdminAction } from './hooks'
import { Facts, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { Skeleton } from '@/components/ui/skeleton'

function ApplicationCard({ a }: { a: MmApplication }) {
  const act = useAdminAction(`mm-applications/${a.id}`)
  const [label, tone] = MM_STATUS[a.status]
  return (
    <Panel
      title={`${a.applicant} · ${a.organization}`}
      action={
        a.status === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <ReasonDialog action={act} name={`approve-${a.id}`} label="Approve" variant="default" reasonOptional reasonLabel="Catatan" title={`Setujui ${a.applicant} sebagai Market Maker?`} confirmLabel="Setujui"
              impact="Akun mendapat capability market_maker: workspace Market Ops muncul di pemilih workspace dan bisa membentuk market dari opportunity."
              body={(reason) => ({ action: 'approve', reason })} onDone={() => toast({ title: 'Market Maker disetujui', body: a.applicant, tone: 'green' })} />
            <ReasonDialog action={act} name={`reject-${a.id}`} label="Reject" destructive title={`Tolak pengajuan ${a.applicant}?`} confirmLabel="Tolak pengajuan"
              impact="Pengaju menerima alasan ini lewat notifikasi dan bisa mengajukan ulang."
              body={(reason) => ({ action: 'reject', reason })} onDone={() => toast({ title: 'Pengajuan ditolak', body: a.applicant })} />
          </div>
        ) : (
          <Tag tone={tone}>{label}</Tag>
        )
      }
    >
      <Facts
        items={[
          ['Email', a.email],
          ['Diajukan', `${formatDateTime(a.submittedAt)} (${formatRelative(a.submittedAt)})`],
          ['Fokus kategori', a.categories.length ? a.categories.map((c) => CATEGORIES[c].label).join(', ') : '—'],
          ['Catatan dokumen', a.documents || '—'],
        ]}
      />
      <p className="mt-3 text-sm whitespace-pre-line">{a.experience || '—'}</p>
      {a.decision && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
          <span className="font-medium">{label}</span> oleh {a.decision.by}, {formatRelative(a.decision.at)}{a.decision.reason && `: ${a.decision.reason}`}
        </p>
      )}
    </Panel>
  )
}

export function MmApplicationsPage() {
  const query = useMmApplications()
  return (
    <>
      <PageHeader title="Pengajuan Market Maker" description="Peserta yang ingin membentuk dan menjalankan market. Persetujuan memberi capability market_maker; semua keputusan tercatat di audit trail." icon={Compass} tone="orange" />
      <AsyncView query={query} skeleton={<Skeleton className="h-72 rounded-xl" />} empty={<EmptyState icon={Compass} title="Belum ada pengajuan" description="Pengajuan dari pemilih workspace atau onboarding akan muncul di sini." />}>
        {(rows) => <div className="flex flex-col gap-4">{rows.map((a) => <ApplicationCard key={a.id} a={a} />)}</div>}
      </AsyncView>
    </>
  )
}
