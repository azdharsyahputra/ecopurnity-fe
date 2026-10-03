import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BadgeCheck, ExternalLink, Flag, Search, Users } from 'lucide-react'
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
      <PageHeader title="Users" description="Cari akun, lihat riwayat dan laporan dari pengguna lain, lalu ambil keputusan dengan alasan tertulis." icon={Users} tone="orange" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="relative flex-1">
          <span className="sr-only">Cari pengguna</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Nama, username, atau email" className="h-10 pl-9" />
        </label>
        <div className="sm:w-48">
          <SelectField label="Status akun" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(ACCOUNT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </SelectField>
        </div>
      </div>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} empty={<EmptyState icon={Search} title="Tidak ada akun yang cocok" description="Coba kata kunci lain atau hapus filter status." />}>
        {(rows) => (
          <DataTable
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
          />
        )}
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
      <BackLink to="/admin/users">Users</BackLink>
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

            <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
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
