import { useId, type ComponentProps, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MailOpen } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { passwordStrength, STRENGTH_LABEL } from '@/domain/password'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

/** Label + input + field error from the API's `error.fields` (PRD §13). */
export function Field({ label, error, hint, aside, ...input }: { label: string; error?: string; hint?: ReactNode; aside?: ReactNode } & ComponentProps<'input'>) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between text-sm font-medium">
        {label}
        {aside}
      </label>
      <Input id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} className="h-10" {...input} />
      {(error || hint) && (
        <p id={`${id}-msg`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

export function FormError({ error }: { error: unknown }) {
  if (!error || (error instanceof ApiError && error.fields)) return null
  return (
    <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
      {error instanceof Error ? error.message : 'Terjadi kesalahan'}
    </p>
  )
}

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password)
  const tone = ['red', 'red', 'yellow', 'green', 'green'][score]
  return (
    <div aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= score ? `var(--tag-${tone}-fg)` : 'var(--muted)' }} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{password ? STRENGTH_LABEL[score] : 'Minimal 8 karakter, campur huruf besar, angka, simbol'}</p>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  )
}

/** Sends the user to the OAuth provider; the mock "provider" redirects straight back to our callback. */
export function GoogleButton({ label = 'Lanjut dengan Google' }: { label?: string }) {
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo')
  const to = `/auth/google/callback?code=mock${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`
  return (
    <Button variant="outline" className="h-10 w-full" render={<Link to={to} />}>
      <GoogleMark /> {label}
    </Button>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> atau <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Mock-only: shows the link a real BE would have emailed, so verify/reset flows can be completed locally. */
export function MockOutbox({ email, kind }: { email?: string; kind: 'verify' | 'reset' }) {
  const outbox = useQuery({
    queryKey: ['mock-outbox', email ?? 'me', kind],
    queryFn: () => api<{ verifyToken: string | null; resetToken: string | null }>(`/_mock/outbox${email ? `?email=${encodeURIComponent(email)}` : ''}`),
    enabled: MOCKS,
    refetchInterval: 2_000,
  })
  const token = kind === 'verify' ? outbox.data?.verifyToken : outbox.data?.resetToken
  if (!MOCKS || !token) return null
  const to = kind === 'verify' ? `/verify-email?token=${token}` : `/reset-password?token=${token}`
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <p className="flex items-center gap-2 font-medium"><MailOpen className="size-4" /> Kotak surat (mock)</p>
      <p className="mt-1 text-muted-foreground">Email yang dikirim backend akan berisi link ini.</p>
      <Link to={to} className="mt-2 inline-block font-medium text-primary hover:underline">
        Buka link {kind === 'verify' ? 'verifikasi' : 'reset password'}
      </Link>
    </div>
  )
}
