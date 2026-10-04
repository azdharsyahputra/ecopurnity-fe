import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Settings } from 'lucide-react'
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
        icon={Bell}
        tone="orange"
        featured
        actions={
          <>
            <Segmented label="Filter" value={filter} options={[['all', 'Semua'], ['unread', 'Belum dibaca']]} onChange={setFilter} />
            <Button variant="outline" className="h-9" onClick={() => markRead.mutate(undefined)}><CheckCheck /> Tandai semua dibaca</Button>
          </>
        }
      />
      <AsyncView query={query} skeleton={<Skeleton className="h-64 rounded-xl" />} empty={<EmptyState icon={Bell} title="Belum ada notifikasi" />}>
        {(items) => {
          const types = [...new Set(items.map((n) => n.type))]
          const visible = items.filter((n) => (filter === 'all' || !n.read) && (!type || n.type === type))
          return (
            <>
              <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label="Tipe">
                {(['', ...types] as const).map((t) => (
                  <button key={t || 'all'} role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn('shrink-0 rounded-full border px-3 py-1 text-sm', type === t ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover')}>
                    {t ? NOTIFICATION_META[t][1] : 'Semua tipe'}
                  </button>
                ))}
              </div>
              {visible.length ? (
                <ul className="divide-y rounded-xl border bg-card">
                  {visible.map((n) => {
                    const [icon] = NOTIFICATION_META[n.type]
                    return (
                      <li key={n.id}>
                        <Link to={n.href} onClick={() => !n.read && markRead.mutate([n.id])} className={cn('flex gap-3 p-4 hover:bg-hover', !n.read && 'bg-primary/5')}>
                          <IconChip icon={icon} tone={NOTIFICATION_TONE[n.type]} size="sm" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm', !n.read && 'font-medium')}>{n.title}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.at)}</p>
                          </div>
                          {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState icon={CheckCheck} tone="green" title="Semua sudah dibaca" />
              )}
            </>
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
      <PageHeader title="Pengaturan" icon={Settings} tone="gray" featured />
      <div className="flex flex-col gap-6">
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <h2 className="font-medium">Tampilan</h2>
          <div className="mt-3 flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
        </section>
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <h2 className="font-medium">Notifikasi</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pilih lewat mana kamu ingin diberi tahu untuk setiap jenis kejadian.</p>
          <AsyncView query={prefs} skeleton={<Skeleton className="mt-4 h-64" />}>
            {(p) => (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 font-medium">Jenis</th><th className="w-20 py-2 text-center font-medium">In-app</th><th className="w-20 py-2 text-center font-medium">Email</th></tr>
                </thead>
                <tbody className="divide-y">
                  {(Object.keys(NOTIFICATION_META) as NotificationType[]).map((t) => (
                    <tr key={t}>
                      <td className="py-2.5">{NOTIFICATION_META[t][1]}</td>
                      {(['inApp', 'email'] as const).map((ch) => (
                        <td key={ch} className="py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
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
            )}
          </AsyncView>
        </section>
      </div>
    </>
  )
}
