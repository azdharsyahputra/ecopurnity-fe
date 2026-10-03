import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

export interface WizardStep {
  id: string
  title: string
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
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <ol className="mb-8 flex gap-2" aria-label="Langkah">
          {steps.map((s, n) => (
            <li key={s.id} className="flex flex-1 flex-col gap-1.5">
              <span className={cn('h-1 rounded-full', n <= i ? 'bg-primary' : 'bg-muted')} />
              <button
                type="button"
                disabled={n > i}
                onClick={() => setI(n)}
                aria-current={n === i ? 'step' : undefined}
                className={cn('flex items-center gap-1 text-left text-xs', n === i ? 'font-medium text-foreground' : 'text-muted-foreground', n < i && 'hover:text-foreground')}
              >
                {n < i && <Check className="size-3" />}
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <h2 className="text-lg font-semibold">{step.title}</h2>
        <div className="mt-5">{step.content}</div>

        {error && <div className="mt-6">{error}</div>}

        <div className="mt-8 flex items-center gap-2 border-t pt-6">
          {i > 0 && (
            <Button variant="ghost" className="h-10" onClick={() => setI(i - 1)}>
              <ArrowLeft /> Kembali
            </Button>
          )}
          {step.blocker && <p className="ml-auto text-sm text-muted-foreground">{step.blocker}</p>}
          <Button className={cn('h-10 px-5', !step.blocker && 'ml-auto')} disabled={!!step.blocker || submitting} onClick={() => (last ? onSubmit() : setI(i + 1))}>
            {last ? (submitting ? 'Menyimpan…' : submitLabel) : 'Lanjut'} {!last && <ArrowRight />}
          </Button>
        </div>
      </div>
      <aside className="order-first lg:order-none">
        <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-20">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Ringkasan</p>
          {summary}
        </div>
      </aside>
    </div>
  )
}

export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="num truncate text-right font-medium">{value || '—'}</span>
    </div>
  )
}
