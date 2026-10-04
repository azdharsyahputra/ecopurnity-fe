import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Banknote, Check, Clock3, Copy, Wallet } from 'lucide-react'
import { formatDateTime, formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useAdminAction, useAdminWithdrawal, useAdminWithdrawals } from './hooks'
import { WITHDRAWAL_STATUS } from './labels'
import type { AdminWithdrawal, WithdrawalStatus } from './types'
import { BackLink, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { Field, Segmented } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'



function StatusTag({ w }: { w: AdminWithdrawal }) {
  const [label, tone] = WITHDRAWAL_STATUS[w.status]
  return <Tag tone={tone}>{label}</Tag>
}

const late = (w: AdminWithdrawal) => w.status === 'processing' && Date.now() > new Date(w.dueAt).getTime()
const masked = (w: AdminWithdrawal) => `${w.bank} ••${w.accountLast4}`

export function WithdrawalsPage() {
  const [status, setStatus] = useState<WithdrawalStatus>('processing')
  const query = useAdminWithdrawals(status)
  return (
    <>
      <PageHeader
        title="Pencairan"
        description="Transfer manual dari rekening perusahaan, lalu catat nomor referensinya di sini. Target 1 hari kerja sejak diajukan."
        icon={Banknote}
        tone="orange"
        actions={<Segmented label="Status" value={status} options={[['processing', 'Antrean'], ['paid', 'Dibayar'], ['rejected', 'Ditolak']]} onChange={setStatus} />}
      />
      <AsyncView
        query={query}
        skeleton={<Skeleton className="h-72 rounded-xl" />}
        emptyFallback={false}
      >
        {(rows) => {
          const amount = rows.reduce((sum, w) => sum + w.amountIdr, 0)
          const overdue = rows.filter(late).length
          return (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-300"><Banknote className="size-4" /></span>Permintaan {WITHDRAWAL_STATUS[status][0].toLowerCase()}</div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">{formatNumber(rows.length)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Jumlah yang tampil pada status terpilih</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Wallet className="size-4" /></span>Total nominal</div>
                  <p className="num mt-3 text-2xl font-semibold tracking-tight">{formatIdr(amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Akumulasi permintaan pada daftar ini</p>
                </div>
                <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="grid size-8 place-items-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300"><Clock3 className="size-4" /></span>Melewati target</div>
                  <p className={cn('mt-3 text-2xl font-semibold tracking-tight', overdue > 0 && 'text-destructive')}>{formatNumber(overdue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Target penyelesaian 1 hari kerja</p>
                </div>
              </div>
              <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
                  <div><h2 className="font-semibold">Daftar pencairan</h2><p className="mt-0.5 text-sm text-muted-foreground">Periksa pemilik rekening dan tenggat sebelum memutuskan.</p></div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{formatNumber(rows.length)} permintaan</span>
                </div>
                {rows.length ? (
                  <DataTable
                    caption="Antrean pencairan"
                    rows={rows}
                    rowKey={(w) => w.id}
                    rowHref={(w) => `/admin/withdrawals/${w.id}`}
                    columns={[
                      { key: 'requester', header: 'Pengaju', primary: true, cell: (w) => <span>{w.requester.name}<span className="block text-xs text-muted-foreground">{w.code}</span></span> },
                      { key: 'amount', header: 'Jumlah', align: 'right', sortValue: (w) => w.amountIdr, cell: (w) => <span className="num font-medium">{formatIdr(w.amountIdr)}</span> },
                      { key: 'bank', header: 'Rekening', cell: (w) => <span>{masked(w)}<span className="block text-xs text-muted-foreground">a.n. {w.holder}</span></span> },
                      { key: 'at', header: 'Diajukan', sortValue: (w) => w.requestedAt, cell: (w) => <span className={cn(late(w) && 'font-medium text-destructive')}>{formatRelative(w.requestedAt)}{late(w) && ' · lewat SLA'}</span> },
                      { key: 'status', header: 'Status', cell: (w) => <StatusTag w={w} /> },
                    ]}
                  />
                ) : <EmptyState icon={Banknote} title={status === 'processing' ? 'Antrean pencairan kosong' : 'Belum ada pencairan'} description="Permintaan tarik dana dengan status ini akan muncul di sini." className="m-4 sm:m-5" />}
              </section>
            </>
          )
        }}
      </AsyncView>
    </>
  )
}

function CopyRow({ label, value, copy, children }: { label: string; value: ReactNode; copy?: string; children?: ReactNode }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="num font-medium break-words">{value}</dd>
        {children}
      </div>
      {copy && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Salin ${label.toLowerCase()}`}
          onClick={() =>
            navigator.clipboard.writeText(copy).then(
              () => (setDone(true), setTimeout(() => setDone(false), 1500)),
              () => toast({ title: 'Gagal menyalin', body: copy }),
            )
          }
        >
          {done ? <Check /> : <Copy />} {done ? 'Tersalin' : 'Salin'}
        </Button>
      )}
    </div>
  )
}

export function WithdrawalDetailPage() {
  const { id = '' } = useParams()
  const query = useAdminWithdrawal(id)
  const act = useAdminAction(`withdrawals/${id}`)
  const navigate = useNavigate()
  const [ref, setRef] = useState('')
  const [paidAt, setPaidAt] = useState('')
  return (
    <>
      <BackLink to="/admin/withdrawals">Pencairan</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(w) => (
          <>
            <PageHeader
              title={`${formatIdr(w.amountIdr)} · ${w.code}`}
              description={<span className="flex flex-wrap items-center gap-1.5">Diajukan {w.requester.name} · {formatDateTime(w.requestedAt)} <StatusTag w={w} /></span>}
              actions={
                w.status === 'processing' && (
                  <>
                    <ReasonDialog
                      action={act} name="mark-paid" label="Tandai sudah ditransfer" variant="default" reasonOptional reasonLabel="Catatan"
                      title={`Catat transfer ${formatIdr(w.amountIdr)}?`} confirmLabel="Tandai dibayar"
                      impact={`Pastikan dana sudah masuk ke ${masked(w)} a.n. ${w.holder}. ${w.requester.name} diberi tahu bahwa dana sudah ditransfer.`}
                      extra={
                        <>
                          <Field label="Nomor referensi transfer" value={ref} onChange={(e) => setRef(e.target.value)} error={fieldError(act.error, 'transferRef')} hint="Dari bukti transfer internet banking" />
                          <Field label="Waktu transfer (opsional)" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} error={fieldError(act.error, 'paidAt')} hint="Kosongkan bila baru saja" />
                        </>
                      }
                      body={(note) => ({ action: 'mark_paid', transferRef: ref.trim(), paidAt: paidAt ? new Date(paidAt).toISOString() : undefined, note: note || undefined })}
                      onDone={() => (toast({ title: 'Pencairan dicatat dibayar', body: w.code, tone: 'green' }), navigate('/admin/withdrawals'))}
                    />
                    <ReasonDialog
                      action={act} name="reject" label="Tolak" destructive title={`Tolak pencairan ${w.code}?`} confirmLabel="Tolak pencairan"
                      impact={`${formatIdr(w.amountIdr)} kembali ke saldo ${w.requester.name} dan alasan ini dikirim lewat notifikasi.`}
                      body={(reason) => ({ action: 'reject', reason })}
                      onDone={() => (toast({ title: 'Pencairan ditolak', body: w.code }), navigate('/admin/withdrawals'))}
                    />
                  </>
                )
              }
            />
            {w.decidedAt && (
              <p className="mb-6 rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">{WITHDRAWAL_STATUS[w.status][0]}</span> oleh {w.decidedBy}, {formatRelative(w.decidedAt)}
                {w.transferRef && <>: ref <span className="font-mono">{w.transferRef}</span>{w.paidAt && `, ditransfer ${formatDateTime(w.paidAt)}`}</>}
                {w.reason && `: ${w.reason}`}
                {w.note && <span className="block text-muted-foreground">{w.note}</span>}
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Transfer ke">
                <dl className="flex flex-col gap-2 text-sm">
                  <CopyRow label="Bank" value={w.bank} />
                  <CopyRow label="Nomor rekening" value={<span className="font-mono">{w.accountNo ?? `••••${w.accountLast4}`}</span>} copy={w.accountNo}>
                    {w.accountNo && <p className="text-xs text-muted-foreground">Setiap kali halaman ini dibuka tercatat di audit trail.</p>}
                  </CopyRow>
                  <CopyRow label="Atas nama" value={w.holder} />
                  <CopyRow label="Jumlah" value={formatIdr(w.amountIdr)} copy={w.status === 'processing' ? String(w.amountIdr) : undefined} />
                  <CopyRow label="Berita transfer" value={<span className="font-mono">{w.code}</span>} copy={w.status === 'processing' ? w.code : undefined} />
                </dl>
              </Panel>
              <Panel title="Pemeriksaan">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Nama pemilik rekening</p>
                    <p className="font-medium break-words">{w.holder}</p>
                  </div>
                  <div className={cn('rounded-lg border p-3', w.nameMismatch && 'ring-1 ring-destructive')} style={w.nameMismatch ? { background: 'var(--tag-red-bg)' } : undefined}>
                    <p className="text-xs text-muted-foreground">Nama di KTP terverifikasi</p>
                    <p className="font-medium break-words">{w.identityName ?? '—'}</p>
                  </div>
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {!w.identityName ? (
                    <Tag tone="orange"><AlertTriangle className="size-3" /> KTP belum terverifikasi</Tag>
                  ) : w.nameMismatch ? (
                    <Tag tone="red"><AlertTriangle className="size-3" /> Nama berbeda</Tag>
                  ) : (
                    <Tag tone="green"><Check className="size-3" /> Nama cocok</Tag>
                  )}
                  <Link to={`/admin/users/${w.requester.id}`} className="text-primary hover:underline">{w.requester.name}</Link>
                  <span className="text-muted-foreground">{w.requester.email}</span>
                </p>
                <p className={cn('mt-2 text-xs text-muted-foreground', late(w) && 'font-medium text-destructive')}>
                  Target selesai {formatDateTime(w.dueAt)}{late(w) && ' · lewat SLA'}
                </p>
              </Panel>
            </div>
            <Panel title="Pencairan lain dari pihak ini" className="mt-6">
              {w.recent.length ? (
                <ul className="divide-y text-sm">
                  {w.recent.map((r) => (
                    <li key={r.id}>
                      <Link to={`/admin/withdrawals/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-hover">
                        <span className="num font-medium">{formatIdr(r.amountIdr)}</span>
                        <span className="text-muted-foreground">{r.code} · {masked(r)} · {formatRelative(r.requestedAt)}</span>
                        <StatusTag w={r} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ini pencairan pertama.</p>
              )}
            </Panel>
          </>
        )}
      </AsyncView>
    </>
  )
}
