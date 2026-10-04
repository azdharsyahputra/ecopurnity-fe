import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ArrowUpRight, Menu, Search } from 'lucide-react'
import { useMe } from '@/features/auth/hooks'
import { usePublicActivity } from '@/features/public/hooks'
import { ACTIVITY_META } from '@/components/activity'
import { PUBLIC_NAV } from '../nav'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/domain/format'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'


function LiveTicker() {
  const { data } = usePublicActivity(1)
  const e = data?.[0]
  if (!e) return <div className="h-9 border-b" />
  const [Icon] = ACTIVITY_META[e.type]
  return (
    <div className="border-b bg-muted/50">
      <div className="mx-auto flex h-9 max-w-6xl items-center gap-2 px-4 text-xs md:px-6" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-lime px-1.5 py-0.5 font-semibold text-lime-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-current" /> LIVE
        </span>
        <span key={e.id} className="flex min-w-0 items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{e.title}</span>
          <span className="shrink-0 text-muted-foreground">· {formatRelative(e.at)}</span>
        </span>
      </div>
    </div>
  )
}

export function PublicLayout() {
  const { data: me } = useMe()
  const openPalette = useUi((s) => s.setPaletteOpen)
  const [drawer, setDrawer] = useState(false)

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground', isActive && 'text-foreground')

  const authButtons = me ? (
    <Button render={<Link to="/app" />}>Buka App</Button>
  ) : (
    <>
      <Button variant="ghost" render={<Link to="/login" />}>Masuk</Button>
      <Button render={<Link to="/register" />}>Mulai gratis</Button>
    </>
  )

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 shadow-sm shadow-foreground/[0.025] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Logo />
          <nav aria-label="Utama" className="hidden items-center gap-1 rounded-full border bg-muted/60 p-1 md:flex">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon-sm" onClick={() => openPalette(true)} aria-label="Cari">
              <Search />
            </Button>
            <ThemeToggle className="hidden sm:inline-flex" />
            <div className="hidden items-center gap-1.5 md:flex">{authButtons}</div>
            <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Buka menu">
              <Menu />
            </Button>
          </div>
        </div>
        <LiveTicker />
      </header>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-72 p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <nav aria-label="Utama" className="mt-8 flex flex-col gap-0.5">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setDrawer(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 flex flex-col gap-2" onClick={() => setDrawer(false)}>
            {authButtons}
          </div>
          <ThemeToggle className="mt-6 self-start" />
        </SheetContent>
      </Sheet>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <Logo className="text-foreground" />
          <p suppressHydrationWarning>Find markets that don't exist yet. © {new Date().getFullYear()} Ecopurnity</p>
          <Link to="/explore" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">Jelajahi jaringan <ArrowUpRight className="size-4" /></Link>
        </div>
      </footer>
    </div>
  )
}
