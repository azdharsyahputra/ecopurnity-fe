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
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  actions?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {icon && <IconChip icon={icon} tone={tone} size="lg" className="mb-3" />}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
