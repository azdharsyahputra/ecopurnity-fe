import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, MonitorCog, Settings } from 'lucide-react'
import type { NotificationType } from '@/domain/types'
import { formatRelative } from '@/domain/format'
import { cn } from '@/lib/utils'
import { NOTIFICATION_META, NOTIFICATION_TONE } from '@/features/notifications/live'
import { useMarkRead, useNotificationPrefs, useNotifications, useSaveNotificationPrefs } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { IconChip } from '@/components/IconChip'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Segmented } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function NotificationsPage() {
  const query = useNotifications()
  const markRead = useMarkRead()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [type, setType] = useState<NotificationType | ''>('')

  return (
    <>
      <PageHeader
        title="Notifikasi"
        description="Pantau aktivitas transaksi, auction, pembayaran, dan perkembangan akunmu."
        icon={Bell}
        tone="orange"
        featured
        actions={
          <>
            <Segmented label="Filter" value={filter} options={[['all', 'Semua'], ['unread', 'Belum dibaca']]} onChange={setFilter} />
            <Button variant="outline" className="h-10 shadow-sm hover:bg-accent hover:text-accent-foreground" onClick={() => markRead.mutate(undefined)}><CheckCheck /> Tandai semua dibaca</Button>
          </>
        }
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} emptyFallback={false}>
        {(items) => {
          const types = [...new Set(items.map((n) => n.type))]
          const visible = items.filter((n) => (filter === 'all' || !n.read) && (!type || n.type === type))
          const unreadCount = items.filter((n) => !n.read).length
          return (
            <div className="grid gap-5">
              <section aria-label="Ringkasan notifikasi" className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Total notifikasi', items.length, 'Seluruh aktivitas terbaru'],
                  ['Belum dibaca', unreadCount, 'Menunggu perhatianmu'],
                  ['Ditampilkan', visible.length, filter === 'unread' ? 'Sesuai filter belum dibaca' : type ? `Jenis: ${NOTIFICATION_META[type][1]}` : 'Sesuai filter saat ini'],
                ].map(([label, value, note]) => (
                  <article key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                  </article>
                ))}
              </section>
              <section className="grid gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
                <div><h2 className="text-lg font-semibold tracking-tight">Aktivitas terbaru</h2><p className="mt-1 text-sm text-muted-foreground">Pilih notifikasi untuk membuka detail terkait.</p></div>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Tipe notifikasi">
                {(['', ...types] as const).map((t) => (
                  <button key={t || 'all'} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn('h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors', type === t ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    {t ? NOTIFICATION_META[t][1] : 'Semua tipe'}
                  </button>
                ))}
              </div>
              {visible.length ? (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
                  {visible.map((n) => {
                    const [icon] = NOTIFICATION_META[n.type]
                    return (
                      <li key={n.id}>
                        <Link to={n.href} onClick={() => !n.read && markRead.mutate([n.id])} className={cn('group flex gap-3 border-l-2 p-4 transition-colors hover:bg-muted/35 sm:gap-4 sm:px-5', !n.read ? 'border-l-primary bg-primary/[0.045]' : 'border-l-transparent')}>
                          <IconChip icon={icon} tone={NOTIFICATION_TONE[n.type]} size="sm" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm group-hover:text-foreground', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                            <p className="mt-2 text-xs text-muted-foreground">{formatRelative(n.at)}</p>
                          </div>
                          {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" aria-label="Belum dibaca" />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed bg-muted/10 p-5 sm:p-7">
                  <EmptyState icon={visible.length === 0 && items.length === 0 ? Bell : CheckCheck} tone={visible.length === 0 && items.length === 0 ? 'orange' : 'green'} title={items.length === 0 ? 'Belum ada notifikasi' : filter === 'unread' && unreadCount === 0 ? 'Semua sudah dibaca' : 'Tidak ada notifikasi untuk filter ini'} description={items.length === 0 ? 'Aktivitas auction, transaksi, pembayaran, dan akun akan muncul di sini.' : 'Coba pilih tipe notifikasi lain untuk melihat aktivitas lainnya.'} />
                </div>
              )}
              </section>
            </div>
          )
        }}
      </AsyncView>
      <p className="mt-6 text-sm text-muted-foreground">
        Atur notifikasi yang kamu terima di <Link to="/app/settings" className="font-medium text-primary hover:underline">Pengaturan</Link>.
      </p>
    </>
  )
}

export function SettingsPage() {
  const prefs = useNotificationPrefs()
  const save = useSaveNotificationPrefs()
  return (
    <>
      <PageHeader title="Pengaturan" description="Atur tampilan aplikasi dan cara kamu menerima kabar penting." icon={Settings} tone="gray" featured />
      <div className="grid max-w-5xl gap-5">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
          <header className="flex items-center gap-3 border-b bg-muted/15 p-4 sm:p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300"><MonitorCog className="size-5" aria-hidden="true" /></span>
            <div><h2 className="font-semibold tracking-tight">Tampilan</h2><p className="mt-0.5 text-sm text-muted-foreground">Pilih tema yang nyaman untuk digunakan.</p></div>
          </header>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
            <div><p className="text-sm font-medium">Tema aplikasi</p><p className="mt-0.5 text-xs text-muted-foreground">Terang, gelap, atau mengikuti perangkat.</p></div>
            <ThemeToggle />
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-foreground/[0.025]">
          <header className="flex items-center gap-3 border-b bg-muted/15 p-4 sm:p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-300"><Bell className="size-5" aria-hidden="true" /></span>
            <div><h2 className="font-semibold tracking-tight">Preferensi notifikasi</h2><p className="mt-0.5 text-sm text-muted-foreground">Pilih saluran pemberitahuan untuk setiap jenis kejadian.</p></div>
          </header>
          <AsyncView query={prefs} skeleton={<Skeleton className="m-4 h-64 sm:m-5" />}>
            {(p) => (
              <div className="overflow-x-auto p-3 sm:p-5">
                <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="rounded-l-lg bg-muted/35 px-4 py-3 font-semibold">Jenis notifikasi</th>
                      <th className="w-24 bg-muted/35 px-3 py-3 text-center font-semibold">In-app</th>
                      <th className="w-24 rounded-r-lg bg-muted/35 px-3 py-3 text-center font-semibold">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(NOTIFICATION_META) as NotificationType[]).map((t) => (
                      <tr key={t} className="group transition-colors hover:bg-muted/25">
                        <td className="border-b px-4 py-3 font-medium group-last:border-b-0">{NOTIFICATION_META[t][1]}</td>
                        {(['inApp', 'email'] as const).map((ch) => (
                          <td key={ch} className="border-b px-3 py-3 text-center group-last:border-b-0">
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={`${NOTIFICATION_META[t][1]} lewat ${ch === 'inApp' ? 'aplikasi' : 'email'}`}
                              checked={p[t][ch]}
                              onChange={(e) => save.mutate({ ...p, [t]: { ...p[t], [ch]: e.target.checked } })}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AsyncView>
        </section>
      </div>
    </>
  )
}
