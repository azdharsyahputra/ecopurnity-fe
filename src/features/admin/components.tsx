import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { UseMutationResult } from '@tanstack/react-query'
import { ArrowLeft, Cpu } from 'lucide-react'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatPercent } from '@/domain/format'
import { Tag } from '@/components/Tag'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { riskTone } from './labels'

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {children}
    </Link>
  )
}

export function Panel({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card p-4 md:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="num font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Fraud signals are advice, never verdicts: always labelled with score and confidence. */
export function SystemBadge({ source, score, confidence }: { source: 'system' | 'manual'; score: number; confidence: number }) {
  if (source === 'manual') return <Tag tone="blue">Kasus manual</Tag>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Tag tone="purple"><Cpu className="size-3" /> Rekomendasi sistem</Tag>
      <Tag tone={riskTone(score)}>Skor {score}</Tag>
      <Tag>Confidence {formatPercent(confidence)}</Tag>
    </span>
  )
}

type Mutation = Pick<UseMutationResult<unknown, Error, object>, 'mutateAsync' | 'error' | 'isPending' | 'reset'>

/**
 * Governance action with an impact summary and a written reason that lands in the audit trail.
 * Open state is `?dialog=<name>` so a case link can open straight into the decision.
 */
export function ReasonDialog({
  name, label, title, description, impact, confirmLabel, destructive, variant, action, body, onDone, reasonLabel = 'Alasan', reasonHint, reasonOptional, extra,
}: {
  name: string
  label: ReactNode
  title: string
  description?: ReactNode
  impact?: ReactNode
  confirmLabel: string
  destructive?: boolean
  variant?: 'default' | 'outline' | 'destructive' | 'secondary'
  action: Mutation
  body: (reason: string) => object
  /** Called with the API result after the dialog closes. */
  onDone?: (result: unknown) => void
  reasonLabel?: string
  reasonHint?: string
  reasonOptional?: boolean
  /** Extra inputs (amount, target…); their state lives in the caller. */
  extra?: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const open = params.get('dialog') === name
  const [reason, setReason] = useState('')
  const set = (v: boolean) => {
    if (v) action.reset()
    else setReason('')
    setParams((p) => (v ? p.set('dialog', name) : p.delete('dialog'), p), { replace: true })
  }

  async function submit() {
    let result: unknown
    try {
      result = await action.mutateAsync(body(reason.trim()))
    } catch {
      return // shown below via action.error
    }
    set(false)
    onDone?.(result)
  }

  return (
    <>
      <Button variant={variant ?? (destructive ? 'destructive' : 'outline')} className="h-9" onClick={() => set(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={set}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {impact && <div className="rounded-lg bg-muted p-3 text-sm">{impact}</div>}
          {extra}
          <TextareaField
            label={reasonOptional ? `${reasonLabel} (opsional)` : reasonLabel}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={fieldError(action.error, 'reason')}
            hint={reasonHint ?? 'Tercatat di audit trail bersama nama kamu.'}
          />
          <FormError error={action.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => set(false)} disabled={action.isPending}>Batal</Button>
            <Button variant={destructive ? 'destructive' : 'default'} onClick={submit} disabled={action.isPending}>
              {action.isPending ? 'Memproses…' : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
