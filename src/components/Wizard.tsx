import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

export interface WizardStep {
  id: string
  title: string
  description?: string
  content: ReactNode
  /** Message explaining why Next is blocked; undefined = step is valid. */
  blocker?: string
}

/** Stepper + content + summary rail (PRD §5 principle 5). Submit lives on the last step. */
export function Wizard({
  steps,
  summary,
  submitLabel,
  submitting,
  onSubmit,
  error,
}: {
  steps: WizardStep[]
  summary: ReactNode
  submitLabel: string
  submitting?: boolean
  onSubmit: () => void
  error?: ReactNode
}) {
  const [i, setI] = useState(0)
  const step = steps[i]
  const last = i === steps.length - 1
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-6">
      <div className="min-w-0">
        <nav aria-label="Progres formulir" className="mb-5 rounded-2xl border bg-linear-to-br from-card via-card to-primary/5 p-4 shadow-sm shadow-foreground/[0.025] sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Langkah {i + 1} <span className="font-normal">dari {steps.length}</span></p>
            <p className="truncate text-sm font-semibold text-foreground">{step.title}</p>
          </div>
          <ol className="flex gap-2" aria-label="Langkah">
          {steps.map((s, n) => (
            <li key={s.id} className="min-w-0 flex-1">
              <button type="button" disabled={n > i} onClick={() => setI(n)} aria-current={n === i ? 'step' : undefined}
                aria-label={`Langkah ${n + 1}: ${s.title}${n < i ? ', selesai' : n === i ? ', sedang dibuka' : ''}`}
                className={cn('group flex w-full flex-col gap-2 text-left disabled:cursor-not-allowed')}>
                <span className={cn('h-1.5 rounded-full transition-colors', n <= i ? 'bg-primary' : 'bg-muted')} />
                <span className={cn('flex min-w-0 items-center gap-1.5 text-xs', n === i ? 'font-semibold text-foreground' : 'text-muted-foreground', n < i && 'group-hover:text-foreground')}>
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors', n <= i ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>{n < i ? <Check className="size-3" /> : n + 1}</span>
                  <span className="hidden truncate sm:inline">{s.title}</span>
                </span>
              </button>
            </li>
          ))}
          </ol>
        </nav>

        <section className="rounded-2xl border border-t-2 border-t-primary/70 bg-linear-to-br from-card via-card to-primary/[0.035] p-4 shadow-sm shadow-foreground/[0.025] sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
          {step.description && <p className="mt-2 rounded-r-lg border-l-2 border-primary/50 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>}
          <div className="mt-5">{step.content}</div>

          {error && <div className="mt-6">{error}</div>}

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t pt-5">
          {i > 0 && (
            <Button variant="ghost" className="h-10" onClick={() => setI(i - 1)}>
              <ArrowLeft /> Kembali
            </Button>
          )}
          {step.blocker && <p role="status" className="ml-auto flex max-w-full items-start gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive sm:text-sm"><span aria-hidden="true" className="font-bold">*</span><span>Lengkapi {step.blocker.toLowerCase()} agar bisa lanjut.</span></p>}
          <Button className={cn('h-10 px-5', !step.blocker && 'ml-auto')} disabled={!!step.blocker || submitting} onClick={() => (last ? onSubmit() : setI(i + 1))}>
            {last ? (submitting ? 'Menyimpan…' : submitLabel) : 'Lanjut'} {!last && <ArrowRight />}
          </Button>
        </div>
        </section>
      </div>
      <aside className="order-first lg:order-none">
        <div className="rounded-2xl border border-primary/15 bg-linear-to-br from-card to-primary/5 p-4 shadow-sm shadow-foreground/[0.025] sm:p-5 lg:sticky lg:top-20">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary"><span className="size-1.5 rounded-full bg-primary" /> Ringkasan</p>
          {summary}
        </div>
      </aside>
    </div>
  )
}

export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="num min-w-0 break-words text-right font-medium">{value || '—'}</span>
    </div>
  )
}
