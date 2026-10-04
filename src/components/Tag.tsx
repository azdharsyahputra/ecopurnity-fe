import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { statusMeta, type Entity, type StatusOf, type Tone } from '@/domain/status'


export function Tag({ tone = 'gray', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ background: `var(--tag-${tone}-bg)`, color: `var(--tag-${tone}-fg)` }}
    >
      {children}
    </span>
  )
}

export function StatusBadge<E extends Entity>({ entity, status }: { entity: E; status: StatusOf<E> }) {
  const { label, tone, live } = statusMeta(entity, status)
  return (
    <Tag tone={tone}>
      <span className="relative flex size-1.5">
        {live && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative size-1.5 rounded-full bg-current" />
      </span>
      {label}
    </Tag>
  )
}
