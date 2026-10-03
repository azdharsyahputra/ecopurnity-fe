import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useToasts } from '@/stores/toast'

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-popover p-3.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: `var(--tag-${t.tone ?? 'teal'}-fg)` }} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.title}</p>
            {t.body && <p className="mt-0.5 text-muted-foreground">{t.body}</p>}
            {t.href && (
              <Link to={t.href} onClick={() => dismiss(t.id)} className="mt-1.5 inline-block font-medium text-primary hover:underline">
                Lihat
              </Link>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground" aria-label="Tutup notifikasi">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
