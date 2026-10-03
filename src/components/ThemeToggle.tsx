import { Monitor, Moon, Sun } from 'lucide-react'
import { useUi, type ThemePref } from '@/stores/ui'
import { cn } from '@/lib/utils'

const OPTIONS: [ThemePref, typeof Sun, string][] = [
  ['light', Sun, 'Terang'],
  ['dark', Moon, 'Gelap'],
  ['system', Monitor, 'Ikuti sistem'],
]

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useUi()
  return (
    <div role="radiogroup" aria-label="Tema" className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {OPTIONS.map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
            theme === value && 'bg-background text-foreground shadow-sm',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
