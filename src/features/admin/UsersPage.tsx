import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, ExternalLink, Flag, Search, ShieldCheck, Users, X } from 'lucide-react'
import { formatDate, formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { toast } from '@/stores/toast'
import { slugify } from '@/features/reputation/slug'
import { useAdminAction, useAdminUser, useAdminUsers } from './hooks'
import { ACCOUNT_STATUS } from './labels'
import type { AccountStatus, AdminUserDetail } from './types'
import { BackLink, Facts, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { AuditLog } from '@/components/AuditLog'
import { SelectField } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export function AccountTag({ status }: { status: AccountStatus }) {
  const [label, tone] = ACCOUNT_STATUS[status]
  return <Tag tone={tone}>{label}</Tag>
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const set = (k: string, v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const query = useAdminUsers(q, status)
  return (
    <>
      <PageHeader title="Pengguna" description="Cari akun, lihat riwayat dan laporan dari pengguna lain, lalu ambil keputusan dengan alasan tertulis." icon={Users} tone="orange" />
      <section aria-label="Filter pengguna" className="mb-5 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
        <div className="mb-4"><h2 className="font-semibold tracking-tight">Cari dan filter akun</h2><p className="mt-1 text-sm text-muted-foreground">Temukan akun berdasarkan nama, username, email, atau status.</p></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative min-w-0 flex-1">
            <span className="mb-1.5 block text-sm font-medium">Pencarian</span>
            <Search className="pointer-events-none absolute top-[2.55rem] left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Nama, username, atau email" className="h-10 pl-9" />
          </label>
          <div className="sm:w-56">
            <SelectField label="Status akun" value={status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Semua status</option>
              {Object.entries(ACCOUNT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </SelectField>
          </div>
          {(q || status) && <Button type="button" variant="outline" className="h-10" onClick={() => setParams({}, { replace: true })}><X /> Hapus filter</Button>}
        </div>
      </section>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} emptyFallback={false}>
        {(rows) => {
          const verifiedCount = rows.filter((u) => u.verified).length
          const reportCount = rows.reduce((sum, u) => sum + u.reportCount, 0)
          return (
            <div className="grid gap-5">
              <section aria-label="Ringkasan hasil akun" className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Hasil akun', value: formatNumber(rows.length), hint: q || status ? 'Sesuai pencarian dan status' : 'Akun dalam direktori', icon: Users, tint: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
                  { label: 'Terverifikasi', value: formatNumber(verifiedCount), hint: 'Identitas sudah dikonfirmasi', icon: ShieldCheck, tint: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
                  { label: 'Laporan masuk', value: formatNumber(reportCount), hint: 'Pada akun dalam hasil ini', icon: Flag, tint: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
                ].map(({ label, value, hint, icon: Icon, tint }) => (
                  <article key={label} className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className={`grid size-10 place-items-center rounded-xl ${tint}`}><Icon className="size-5" aria-hidden="true" /></span></div>
                  </article>
                ))}
              </section>
              <section className="grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3"><div><h2 className="text-lg font-semibold tracking-tight">Direktori pengguna</h2><p className="mt-1 text-sm text-muted-foreground">Buka akun untuk melihat riwayat, laporan, dan tindakan yang tersedia.</p></div><span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{rows.length} akun</span></div>
                {rows.length ? <DataTable
            caption="Daftar pengguna"
            rows={rows}
            rowKey={(u) => u.id}
            rowHref={(u) => `/admin/users/${u.id}`}
            initialSort={{ key: 'reports', dir: 'desc' }}
            columns={[
              { key: 'name', header: 'Akun', primary: true, cell: (u) => <span className="inline-flex items-center gap-2"><EntityAvatar name={u.name} kind={u.kind} verified={u.verified} size={22} /> {u.name} <span className="text-xs font-normal text-muted-foreground">@{u.username}</span></span> },
              { key: 'status', header: 'Status', cell: (u) => <AccountTag status={u.status} /> },
              { key: 'rep', header: 'Reputasi', align: 'right', cell: (u) => formatNumber(u.reputation), sortValue: (u) => u.reputation },
              { key: 'tx', header: 'Transaksi', align: 'right', cell: (u) => formatNumber(u.transactions), sortValue: (u) => u.transactions },
              { key: 'reports', header: 'Laporan', align: 'right', cell: (u) => (u.reportCount ? <Tag tone="red">{u.reportCount}</Tag> : '–'), sortValue: (u) => u.reportCount },
            ]}
          /> : <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7"><EmptyState icon={Search} title="Tidak ada akun yang cocok" description="Coba kata kunci lain atau hapus filter status." /></div>}
              </section>
            </div>
          )
        }}
      </AsyncView>
    </>
  )
}

function UserActions({ u }: { u: AdminUserDetail }) {
  const act = useAdminAction(`users/${u.id}`)
  const done = (title: string) => () => toast({ title, body: u.name, tone: 'green' })
  const common = { action: act }
  return (
    <div className="flex flex-wrap gap-2">
      {!u.verified && (
        <ReasonDialog {...common} name="verify" label={<><BadgeCheck /> Verify</>} title={`Verifikasi identitas ${u.name}?`} confirmLabel="Verifikasi"
          impact="Akun mendapat badge terverifikasi di profil publik dan lolos syarat identitas untuk kualifikasi auction."
          body={(reason) => ({ action: 'verify', reason })} onDone={done('Identitas diverifikasi')} reasonLabel="Dasar verifikasi" />
      )}
      {u.status !== 'restricted' && (
        <ReasonDialog {...common} name="restrict" label="Restrict" title={`Batasi ${u.name}?`} confirmLabel="Batasi akun"
          impact={<ul className="list-disc pl-4"><li>Tidak bisa memasang bid atau membuat listing baru</li><li>Transaksi berjalan tetap bisa diselesaikan</li><li>Bisa dipulihkan kapan saja</li></ul>}
          body={(reason) => ({ action: 'restrict', reason })} onDone={done('Akun dibatasi')} />
      )}
      {u.status !== 'suspended' && (
        <ReasonDialog {...common} name="suspend" label="Suspend" destructive title={`Suspend ${u.name}?`} confirmLabel="Suspend akun"
          impact={<ul className="list-disc pl-4"><li>Akun tidak bisa login dan profil publik ditandai ditangguhkan</li><li>Bid aktif tidak dihapus; auction terkait bisa dibekukan terpisah</li><li>Dana escrow tetap tertahan sampai transaksi diputuskan</li></ul>}
          body={(reason) => ({ action: 'suspend', reason })} onDone={done('Akun disuspend')} />
      )}
      {u.appeal?.status === 'pending' && (
        <ReasonDialog {...common} name="deny_appeal" label="Tolak banding" title={`Tolak banding ${u.name}?`} confirmLabel="Tolak banding"
          impact="Akun tetap disuspend. Alasanmu ditampilkan ke pengguna saat mencoba login; banding tidak bisa diajukan ulang."
          body={(reason) => ({ action: 'deny_appeal', reason })} onDone={done('Banding ditolak')} />
      )}
      {u.status !== 'active' && (
        <ReasonDialog {...common} name="restore" label="Restore" variant="default" title={`Pulihkan ${u.name}?`} confirmLabel="Pulihkan akun"
          impact="Semua pembatasan dicabut dan akun kembali aktif penuh."
          body={(reason) => ({ action: 'restore', reason })} onDone={done('Akun dipulihkan')} />
      )}
    </div>
  )
}

export function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const query = useAdminUser(id)
  return (
    <>
      <BackLink to="/admin/users">Pengguna</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(u) => (
          <>
            <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <EntityAvatar name={u.name} kind={u.kind} verified={u.verified} size={48} />
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{u.name}</h1>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    @{u.username} <AccountTag status={u.status} />
                    {u.verified ? <Tag tone="teal">Terverifikasi</Tag> : <Tag>Belum verifikasi</Tag>}
                    {u.capabilities.map((c) => <Tag key={c} tone="purple">{c}</Tag>)}
                  </p>
                </div>
              </div>
              <UserActions u={u} />
            </header>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <Panel
                  title="Profil"
                  action={
                    <Link to={u.kind === 'business' ? `/b/${slugify(u.name)}` : `/u/${u.username}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                      Profil publik <ExternalLink className="size-3.5" />
                    </Link>
                  }
                >
                  <Facts items={[
                    ['Email', u.email], ['Lokasi', u.location ?? '–'], ['Jenis', u.kind === 'business' ? 'Bisnis' : 'Perorangan'],
                    ['Bergabung', formatDate(u.joinedAt)], ['Reputasi', `${u.reputation} / 100`], ['Organisasi', u.orgs.join(', ') || '–'],
                  ]} />
                </Panel>

                {u.appeal && (
                  <Panel title="Banding suspend">
                    <div className="text-sm">
                      <p className="flex items-center gap-1.5"><Tag tone={{ pending: 'orange', granted: 'green', denied: 'red' }[u.appeal.status] as 'orange'}>{{ pending: 'Menunggu', granted: 'Dikabulkan', denied: 'Ditolak' }[u.appeal.status]}</Tag> <span className="text-muted-foreground">{formatRelative(u.appeal.at)}</span></p>
                      <p className="mt-2 whitespace-pre-line">{u.appeal.reason}</p>
                      {u.appeal.decision && <p className="mt-2 text-muted-foreground">{u.appeal.decision.by}: {u.appeal.decision.note}</p>}
                      {u.appeal.status === 'pending' && <p className="mt-2 text-muted-foreground">Restore untuk mengabulkan, atau tolak dengan alasan.</p>}
                    </div>
                  </Panel>
                )}

                <Panel title={`Laporan dari pengguna lain (${u.reports.length})`}>
                  {u.reports.length ? (
                    <ul className="flex flex-col gap-3">
                      {u.reports.map((r) => (
                        <li key={r.id} className="rounded-lg border p-3 text-sm">
                          <p className="flex items-center gap-1.5 font-medium"><Flag className="size-3.5 text-destructive" /> {r.reporter}</p>
                          <p className="mt-1">{r.reason}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatRelative(r.at)}{r.context ? ` · ${r.context}` : ''}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Belum ada laporan.</p>
                  )}
                </Panel>

                <section className="min-w-0">
                  <h2 className="mb-3 font-medium">Riwayat transaksi</h2>
                  {u.history.length ? (
                    <DataTable
                      caption="Riwayat transaksi"
                      rows={u.history}
                      rowKey={(t) => t.id}
                      columns={[
                        { key: 'title', header: 'Transaksi', primary: true, cell: (t) => <span>{t.title} <span className="text-xs text-muted-foreground">{t.code}</span></span> },
                        { key: 'cp', header: 'Pihak lain', cell: (t) => t.counterparty.name },
                        { key: 'total', header: 'Nilai', align: 'right', cell: (t) => formatIdr(t.totalIdr, { compact: true }), sortValue: (t) => t.totalIdr },
                        { key: 'status', header: 'Status', cell: (t) => <StatusBadge entity="transaction" status={t.status} /> },
                      ]}
                    />
                  ) : (
                    <EmptyState title="Belum ada transaksi aktif" description="Riwayat lama tersedia di laporan reputasi pengguna." />
                  )}
                </section>
              </div>
              <Panel title="Aktivitas admin">
                <AuditLog entries={u.audit} />
              </Panel>
            </div>
          </>
        )}
      </AsyncView>
    </>
  )
}
