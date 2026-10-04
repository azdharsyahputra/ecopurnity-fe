import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '@/domain/status'
import { IconChip } from './IconChip'

export function PageHeader({
  title,
  description,
  icon,
  tone = 'teal',
  actions,
  featured = false,
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  actions?: ReactNode
  featured?: boolean
}) {
  return (
    <header className={featured ? 'relative mb-8 flex flex-col gap-4 overflow-hidden rounded-2xl border bg-linear-to-br from-card via-card to-muted/70 p-5 shadow-sm shadow-foreground/[0.025] sm:flex-row sm:items-end sm:justify-between sm:p-7' : 'mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'}>
      {featured && <div className="pointer-events-none absolute -right-8 -top-14 size-48 rounded-full bg-primary/5 blur-3xl" />}
      <div className={featured ? 'relative min-w-0' : 'min-w-0'}>
        {icon && <IconChip icon={icon} tone={tone} size="lg" className="mb-4" />}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className={featured ? 'relative flex shrink-0 flex-wrap gap-2' : 'flex shrink-0 flex-wrap gap-2'}>{actions}</div>}
    </header>
  )
}
