import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, ChevronsUpDown, Globe, LogOut, Menu, Search } from 'lucide-react'
import { useLogout, useMe } from '@/features/auth/hooks'
import { activeWorkspace, href, workspacesFor, type NavItem, type Workspace } from '../nav'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { IconChip } from '@/components/IconChip'
import { EntityAvatar } from '@/components/EntityAvatar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
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
          <button className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-hover">
            <IconChip icon={current.icon} tone={current.tone} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{current.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{current.caption}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{me?.email}</DropdownMenuLabel>
          {all.map((ws) => (
            <DropdownMenuItem key={ws.id} onClick={() => navigate(ws.base)} className="gap-2 py-1.5">
              <IconChip icon={ws.icon} tone={ws.tone} size="sm" />
              <span className="flex-1 truncate">{ws.label}</span>
              {ws.id === current.id && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
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
          'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-hover hover:text-sidebar-foreground',
          isActive && 'bg-hover font-medium text-sidebar-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className="size-4 shrink-0 text-muted-foreground"
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
    <div className="flex h-full flex-col gap-1 p-2">
      <WorkspaceSwitcher current={ws} all={all} onNavigate={onNavigate} />
      <button
        onClick={() => {
          onNavigate?.()
          openPalette(true)
        }}
        className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-hover"
      >
        <Search className="size-4 text-muted-foreground" />
        <span className="flex-1 text-left">Cari</span>
        <kbd className="text-xs text-muted-foreground">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <nav aria-label={ws.label} className="mt-3 flex flex-col gap-px">
        {ws.items.map((item) => (
          <NavLinkItem key={item.path} ws={ws} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-px pt-4">
        {ws.footer?.map((item) => <NavLinkItem key={item.path} ws={ws} item={item} onNavigate={onNavigate} />)}
        <div className="mt-2 flex items-center justify-between px-2">
          <Logo to="/" className="text-xs text-muted-foreground [&_img]:size-5" />
          <ThemeToggle />
        </div>
      </div>
    </div>
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
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar md:block">
        <Sidebar ws={ws} all={all} />
      </aside>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigasi</SheetTitle>
          <Sidebar ws={ws} all={all} onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 bg-background/85 px-3 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Buka navigasi">
            <Menu />
          </Button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate text-muted-foreground">{ws.label}</span>
            {page && page.path !== '' && (
              <>
                <span className="text-muted-foreground/60">/</span>
                <span className="truncate">{page.label}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" render={<Link to="/app/notifications" />} aria-label="Notifikasi">
              <Bell />
            </Button>
            <EntityAvatar name={me!.name} src={me!.avatarUrl} size={26} className="ml-1" />
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-10 md:pt-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
