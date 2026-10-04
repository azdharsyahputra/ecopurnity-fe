import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, ChevronsUpDown, Globe, LogOut, Menu, Search } from 'lucide-react'
import { useLogout, useMe } from '@/features/auth/hooks'
import { useNotifications } from '@/features/me/hooks'
import { ActivationDialogs, ActivationMenuItems } from '@/features/roles/RoleActivation'
import { activeWorkspace, href, workspacesFor, type NavItem, type Workspace } from '../nav'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { IconChip } from '@/components/IconChip'
import { EntityAvatar } from '@/components/EntityAvatar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function WorkspaceSwitcher({ current, all, onNavigate }: { current: Workspace; all: Workspace[]; onNavigate?: () => void }) {
  const { data: me } = useMe()
  const logout = useLogout()
  const routerNavigate = useNavigate()
  const navigate = (to: string) => {
    onNavigate?.()
    routerNavigate(to)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background/65 p-2 text-left shadow-sm transition-colors hover:bg-background hover:shadow">
            <IconChip icon={current.icon} tone={current.tone} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{current.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{current.caption}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent className="w-72 rounded-xl border-border/80 bg-popover p-1.5 shadow-xl shadow-foreground/10">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate px-2.5 py-2 text-xs font-medium text-muted-foreground">{me?.email}</DropdownMenuLabel>
          {all.map((ws) => (
            <DropdownMenuItem key={ws.id} onClick={() => navigate(ws.base)} className="gap-2.5 rounded-lg px-2 py-2">
              <IconChip icon={ws.icon} tone={ws.tone} size="sm" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{ws.label}</span><span className="block truncate text-xs text-muted-foreground">{ws.caption}</span></span>
              {ws.id === current.id && <Check className="size-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <ActivationMenuItems onOpen={onNavigate} />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/')}>
          <Globe /> Lihat situs publik
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}>
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavLinkItem({ ws, item, onNavigate }: { ws: Workspace; item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={href(ws, item)}
      end={item.path === ''}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-9 items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-sm text-sidebar-foreground/75 transition-all hover:border-border/60 hover:bg-background/70 hover:text-sidebar-foreground',
          isActive && (ws.id === 'personal'
            ? 'border-primary/20 bg-background font-semibold text-sidebar-foreground shadow-sm shadow-foreground/[0.035]'
            : ws.id === 'admin'
              ? 'border-orange-500/25 bg-orange-500/[0.07] font-semibold text-sidebar-foreground shadow-sm'
              : 'border-border/60 bg-background/70 font-semibold text-sidebar-foreground shadow-sm'),
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            style={isActive ? { color: `var(--tag-${ws.tone}-fg)` } : undefined}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function Sidebar({ ws, all, onNavigate }: { ws: Workspace; all: Workspace[]; onNavigate?: () => void }) {
  const openPalette = useUi((s) => s.setPaletteOpen)
  return (
      <div className="flex h-full flex-col gap-1.5 p-2.5">
      <WorkspaceSwitcher current={ws} all={all} onNavigate={onNavigate} />
      <button
        onClick={() => {
          onNavigate?.()
          openPalette(true)
        }}
        className="mt-1 flex h-10 items-center gap-2.5 rounded-xl border border-border/70 bg-background/65 px-3 text-sm text-sidebar-foreground/80 shadow-sm transition-all hover:bg-background hover:shadow"
      >
        <Search className="size-4 text-muted-foreground" />
        <span className="flex-1 text-left">Cari</span>
        <kbd className="text-xs text-muted-foreground">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <nav aria-label={ws.label} className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-0.5">
        {(ws.id === 'personal'
          ? [
              { label: 'Ruang kerja', items: ws.items.slice(0, 2) },
              { label: 'Perdagangan', items: ws.items.slice(2, 9) },
              { label: 'Transaksi & performa', items: ws.items.slice(9) },
            ]
          : ws.id === 'admin'
            ? [
                { label: 'Ikhtisar', items: ws.items.slice(0, 1) },
                { label: 'Review & keputusan', items: ws.items.slice(1, 8) },
                { label: 'Pengawasan', items: ws.items.slice(8) },
              ]
          : [{ label: '', items: ws.items }]
        ).map((group) => (
          <div key={group.label || 'navigation'} className="grid gap-0.5">
            {group.label && <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">{group.label}</p>}
            {group.items.map((item) => <NavLinkItem key={item.path} ws={ws} item={item} onNavigate={onNavigate} />)}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border/60 pt-3">
        {ws.footer?.map((item) => <NavLinkItem key={item.path} ws={ws} item={item} onNavigate={onNavigate} />)}
        <div className="mt-2 flex items-center justify-between border-t border-border/60 px-1.5 pt-3">
          <Logo to="/" className="text-xs text-muted-foreground [&_img]:size-5" />
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}

function NotificationBell() {
  const unread = useNotifications().data?.filter((n) => !n.read).length ?? 0
  return (
    <Button variant="ghost" size="icon-sm" className="relative" render={<Link to="/app/notifications" />} aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}>
      <Bell />
      {unread > 0 && (
        <span className="num absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white dark:text-[#0b1220]">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Button>
  )
}

export function AppLayout() {
  const { data: me } = useMe()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  // ponytail: workspace comes from the URL prefix, no store needed.
  const all = workspacesFor(me!)
  const ws = activeWorkspace(pathname, all)
  const page = [...ws.items, ...(ws.footer ?? [])].find((i) => pathname === href(ws, i))

  return (
    <div className="flex min-h-svh">
      <aside className={cn('sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar md:block', ws.id === 'personal' && 'shadow-sm shadow-foreground/[0.025]')}>
        <Sidebar ws={ws} all={all} />
      </aside>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigasi</SheetTitle>
          <Sidebar ws={ws} all={all} onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn('sticky top-0 z-30 flex h-14 items-center gap-2 bg-background/85 px-3 backdrop-blur md:px-6', ws.id === 'personal' && 'border-b border-border/70 shadow-sm shadow-foreground/[0.02]')}>
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Buka navigasi">
            <Menu />
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate text-muted-foreground">{ws.label}</span>
            {page && page.path !== '' && (
              <>
                <span className="text-muted-foreground/60">/</span>
                <span className="truncate font-medium">{page.label}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <EntityAvatar name={me!.name} src={me!.avatarUrl} size={26} className="ml-1" />
          </div>
        </header>
        <main className={cn('flex-1', ws.id === 'personal' && 'bg-muted/20')}>
          <div className={cn('mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-10 md:pt-8', ws.id === 'personal' && 'participant-workspace', ws.id === 'admin' && 'admin-workspace')}>
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <Outlet />
            </Suspense>
            <ActivationDialogs />
          </div>
        </main>
      </div>
    </div>
  )
}
