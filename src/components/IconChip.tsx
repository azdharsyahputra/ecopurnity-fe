import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/domain/status'

const SIZES = { sm: 'size-6 rounded-md [&>svg]:size-3.5', md: 'size-8 rounded-lg [&>svg]:size-4', lg: 'size-11 rounded-xl [&>svg]:size-5.5' }

/** Soft colored square holding an icon: the main source of color on calm surfaces. */
export function IconChip({
  icon: Icon,
  tone = 'gray',
  size = 'md',
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size], className)}
      style={{ background: `var(--tag-${tone}-bg)`, color: `var(--tag-${tone}-fg)` }}
      aria-hidden
    >
      <Icon />
    </span>
  )
}
