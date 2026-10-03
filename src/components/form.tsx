import { useId, type ComponentProps, type ReactNode } from 'react'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Input } from './ui/input'

// Form controls with label, hint and API field errors (PRD §13 `error.fields`).

const controlClass =
  'w-full rounded-lg border border-input bg-background text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

function Shell({ id, label, error, hint, aside, children }: { id: string; label: string; error?: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between gap-2 text-sm font-medium">
        {label}
        {aside}
      </label>
      {children}
      {(error || hint) && (
        <p id={`${id}-msg`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

type Common = { label: string; error?: string; hint?: ReactNode; aside?: ReactNode }

export function Field({ label, error, hint, aside, ...input }: Common & ComponentProps<'input'>) {
  const id = useId()
  return (
    <Shell id={id} label={label} error={error} hint={hint} aside={aside}>
      <Input id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} className="h-10" {...input} />
    </Shell>
  )
}

export function SelectField({ label, error, hint, children, ...select }: Common & ComponentProps<'select'>) {
  const id = useId()
  return (
    <Shell id={id} label={label} error={error} hint={hint}>
      <select id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} className={cn(controlClass, 'h-10 px-2.5')} {...select}>
        {children}
      </select>
    </Shell>
  )
}

export function TextareaField({ label, error, hint, ...area }: Common & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <Shell id={id} label={label} error={error} hint={hint}>
      <textarea id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-msg` : undefined} rows={3} className={cn(controlClass, 'px-2.5 py-2')} {...area} />
    </Shell>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-muted p-0.5 text-sm">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('rounded-md px-3 py-1.5 transition-colors', value === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** Request-level error; field errors are shown under their inputs instead. */
export function FormError({ error }: { error: unknown }) {
  if (!error || (error instanceof ApiError && error.fields)) return null
  return (
    <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
      {error instanceof Error ? error.message : 'Terjadi kesalahan'}
    </p>
  )
}
