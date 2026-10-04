import { useEffect, useState } from 'react'
import { formatCountdown, formatDateTime } from '@/domain/format'
import { cn } from '@/lib/utils'


export function Countdown({ to, className }: { to: string; className?: string }) {
  const [now, setNow] = useState(Date.now)
  const left = new Date(to).getTime() - now

  const done = left <= 0
  useEffect(() => {
    if (done) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [done])

  const urgent = left > 0 && left < 3_600_000
  return (
    <time
      dateTime={to}
      role="timer"
      aria-live="off"
      aria-label={`Berakhir ${formatDateTime(to)}`}
      className={cn('num font-medium', urgent && 'text-[var(--tag-red-fg)]', done && 'text-muted-foreground', className)}
    >
      {done ? 'Selesai' : formatCountdown(left)}
    </time>
  )
}
