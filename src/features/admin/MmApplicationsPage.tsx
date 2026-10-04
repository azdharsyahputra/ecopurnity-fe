import { BadgeCheck, Compass, Clock3, UsersRound } from 'lucide-react'
import { CATEGORIES } from '@/domain/catalog'
import { formatDateTime, formatNumber, formatRelative } from '@/domain/format'
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
      <div className="mt-4 rounded-xl border bg-muted/15 p-3.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pengalaman dan rencana</p><p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">{a.experience || 'Belum ada keterangan.'}</p></div>
      {a.decision && (
        <p className="mt-3 rounded-xl border bg-muted/35 p-3.5 text-sm leading-relaxed">
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
      <AsyncView query={query} skeleton={<Skeleton className="h-72 rounded-xl" />} emptyFallback={false}>
        {(rows) => {
          const pending = rows.filter((a) => a.status === 'pending').length
          const approved = rows.filter((a) => a.status === 'approved').length
          return (
            <div className="grid gap-5">
              <section aria-label="Ringkasan pengajuan Market Maker" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Total pengajuan', value: rows.length, note: 'Seluruh keputusan', icon: UsersRound, color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
                  { label: 'Menunggu review', value: pending, note: 'Perlu keputusan admin', icon: Clock3, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
                  { label: 'Disetujui', value: approved, note: 'Capability telah diberikan', icon: BadgeCheck, color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
                ].map(({ label, value, note, icon: Icon, color }) => <article key={label} className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className={`grid size-10 place-items-center rounded-xl ${color}`}><Icon className="size-5" aria-hidden="true" /></span></div></article>)}
              </section>
              <section className="grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3"><div><h2 className="text-lg font-semibold tracking-tight">Daftar pengajuan</h2><p className="mt-1 text-sm text-muted-foreground">Tinjau pengalaman, fokus kategori, dan dokumen sebelum mengambil keputusan.</p></div><span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} pengajuan</span></div>
                {rows.length ? <div className="grid gap-4 xl:grid-cols-2">{rows.map((a) => <ApplicationCard key={a.id} a={a} />)}</div> : <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7"><EmptyState icon={Compass} tone="orange" title="Belum ada pengajuan" description="Pengajuan dari pemilih workspace atau onboarding akan muncul di sini." /></div>}
              </section>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}
