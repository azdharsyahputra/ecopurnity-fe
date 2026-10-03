import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Globe, Moon, Search, Sun, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { IconChip } from './IconChip'
import { useUi } from '@/stores/ui'
import { useMe } from '@/features/auth/hooks'
import { PUBLIC_NAV, href, workspacesFor } from '@/app/nav'
import type { Tone } from '@/domain/status'
import { cn } from '@/lib/utils'

interface Command {
  group: string
  label: string
  icon: LucideIcon
  tone: Tone
  run: () => void
}

// ponytail: jumps to pages only. Entity search (products, markets, auctions…) plugs in here in F1 (PRD §6.6).
export function CommandPalette() {
  const { paletteOpen: open, setPaletteOpen: setOpen, setTheme } = useUi()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useUi.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    return [
      ...(me
        ? workspacesFor(me).flatMap((ws) =>
            [...ws.items, ...(ws.footer ?? [])].map((item) => ({
              group: ws.label, label: item.label, icon: item.icon, tone: ws.tone, run: go(href(ws, item)),
            })),
          )
        : []),
      ...PUBLIC_NAV.map((n) => ({ group: 'Publik', label: n.label, icon: Globe, tone: 'gray' as Tone, run: go(n.to) })),
      { group: 'Tema', label: 'Mode terang', icon: Sun, tone: 'yellow', run: () => setTheme('light') },
      { group: 'Tema', label: 'Mode gelap', icon: Moon, tone: 'purple', run: () => setTheme('dark') },
    ]
  }, [me, navigate, setTheme])

  const q = query.trim().toLowerCase()
  const results = q ? commands.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(q)) : commands

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      setActive(0)
    }
  }

  function runAt(i: number) {
    const cmd = results[i]
    if (!cmd) return
    onOpenChange(false)
    cmd.run()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter') runAt(active)
    else return
    e.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Cari halaman</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Cari halaman atau aksi…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={`palette-${active}`}
          />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Tidak ada hasil</li>}
          {results.map((c, i) => (
            <li
              key={`${c.group}-${c.label}`}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => runAt(i)}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-accent')}
            >
              <IconChip icon={c.icon} tone={c.tone} size="sm" />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="max-w-[45%] truncate text-xs text-muted-foreground">{c.group}</span>
              {i === active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
