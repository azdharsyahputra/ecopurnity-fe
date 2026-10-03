import { BadgeCheck } from 'lucide-react'
import type { Tone } from '@/domain/status'
import { initials } from '@/domain/format'
import { cn } from '@/lib/utils'

const TONES: Tone[] = ['teal', 'blue', 'purple', 'orange', 'green', 'pink', 'yellow']

/** Stable color per name so the same person/business always looks the same. */
function toneFor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export function EntityAvatar({
  name,
  src,
  kind = 'person',
  verified,
  size = 32,
  className,
}: {
  name: string
  src?: string
  kind?: 'person' | 'business'
  verified?: boolean
  size?: number
  className?: string
}) {
  const tone = toneFor(name)
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" className={cn('size-full object-cover', kind === 'business' ? 'rounded-lg' : 'rounded-full')} />
      ) : (
        <span
          className={cn('grid size-full place-items-center font-semibold', kind === 'business' ? 'rounded-lg' : 'rounded-full')}
          style={{ background: `var(--tag-${tone}-bg)`, color: `var(--tag-${tone}-fg)`, fontSize: size * 0.38 }}
          aria-hidden
        >
          {initials(name)}
        </span>
      )}
      {verified && (
        <BadgeCheck
          className="absolute -right-1 -bottom-1 rounded-full bg-background text-primary"
          style={{ width: size * 0.45, height: size * 0.45 }}
          aria-label="Terverifikasi"
        />
      )}
    </span>
  )
}
