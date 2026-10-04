import { useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Lock, XCircle } from 'lucide-react'
import {
  ORG_AUCTION_STATUS, PROCUREMENT_STATUS, RELATION, approvalState, type Approval, type OrgAuctionStatus, type OrgRoleDef, type ProcurementStatus,
  type SupplierRelation,
} from '@/domain/org'
import { formatDateTime } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tag } from '@/components/Tag'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FormError, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export const ProcurementBadge = ({ status }: { status: ProcurementStatus }) => <Tag tone={PROCUREMENT_STATUS[status][1]}>{PROCUREMENT_STATUS[status][0]}</Tag>
export const OrgAuctionBadge = ({ status }: { status: OrgAuctionStatus }) => <Tag tone={ORG_AUCTION_STATUS[status][1]}>{ORG_AUCTION_STATUS[status][0]}</Tag>
export const RelationBadge = ({ relation }: { relation: SupplierRelation }) => <Tag tone={RELATION[relation][1]}>{RELATION[relation][0]}</Tag>


export function GuardedButton({ reason, children, ...props }: ComponentProps<typeof Button> & { reason?: string }) {
  if (!reason) return <Button {...props}>{children}</Button>
  return (
    <span className="inline-flex" title={reason}>
      <Button {...props} disabled aria-label={typeof children === 'string' ? `${children} (${reason})` : undefined}>
        <Lock /> {children}
      </Button>
      <span className="sr-only">{reason}</span>
    </span>
  )
}


export function GuardedLink({ to, reason, variant, children }: { to: string; reason?: string; variant?: ComponentProps<typeof Button>['variant']; children: ReactNode }) {
  if (reason) return <GuardedButton reason={reason} variant={variant} className="h-9">{children}</GuardedButton>
  return <Button variant={variant} className="h-9" render={<Link to={to} />}>{children}</Button>
}

export function Section({ title, actions, className, children }: { title: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.025] sm:p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className="num inline-flex items-center gap-1 whitespace-nowrap" aria-label={label ?? `Rating ${value.toFixed(1)} dari 5`}>
      <span aria-hidden style={{ color: 'var(--tag-yellow-fg)' }}>★</span>
      {value.toFixed(1).replace('.', ',')}
    </span>
  )
}


export function ApprovalTrail({ required, approvals, roles }: { required: string[]; approvals: Approval[]; roles: OrgRoleDef[] }) {
  const label = (r: string) => roles.find((x) => x.id === r)?.label ?? r
  const state = approvalState(required, approvals)
  if (!required.length) return <p className="text-sm text-muted-foreground">Di bawah ambang aturan approval: tidak perlu persetujuan.</p>
  return (
    <ol className="flex flex-col gap-3">
      {required.map((role) => {
        const a = approvals.find((x) => x.role === role)
        return (
          <li key={role} className="flex items-start gap-2.5 text-sm">
            {a?.decision === 'approved' ? <CheckCircle2 className="mt-0.5 size-4 text-primary" /> : a?.decision === 'rejected' ? <XCircle className="mt-0.5 size-4 text-destructive" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="font-medium">{label(role)}</p>
              <p className="text-xs text-muted-foreground">
                {a ? `${a.decision === 'approved' ? 'Disetujui' : 'Ditolak'} ${a.by} · ${formatDateTime(a.at)}` : state.rejected ? 'Tidak diperlukan lagi' : 'Menunggu'}
              </p>
              {a?.note && <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">{a.note}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}


export function OnBehalfNote({ signing, own, roles }: { signing: string[]; own: string; roles: OrgRoleDef[] }) {
  const others = signing.filter((r) => r !== own).map((r) => roles.find((x) => x.id === r)?.label ?? r)
  if (!others.length) return null
  return <p className="mb-2 text-xs text-muted-foreground">Keputusanmu juga berlaku atas nama {others.join(', ')}: belum ada anggota aktif dengan peran itu.</p>
}


export function DecisionButtons({ subject, impact, onDecide, error }: { subject: string; impact: ReactNode; onDecide: (action: 'approve' | 'reject', note?: string) => Promise<unknown>; error: unknown }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={<Button className="h-9">Approve</Button>}
        title={`Approve ${subject}?`}
        impact={impact}
        confirmLabel="Approve"
        onConfirm={() => onDecide('approve')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" className="h-9" />}>Tolak</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak {subject}?</DialogTitle>
            <DialogDescription>Pengaju diberi tahu alasannya. Keputusan tercatat di audit trail.</DialogDescription>
          </DialogHeader>
          <TextareaField label="Alasan penolakan" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(error, 'note')} />
          <FormError error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="destructive" disabled={!note.trim()} onClick={() => onDecide('reject', note).then(() => setOpen(false), () => undefined)}>Tolak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


export function CheckChips<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: [T, string][]; value: T[]; onChange: (v: T[]) => void; disabled?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => {
          const on = value.includes(v)
          return (
            <label key={v} className={cn('cursor-pointer rounded-full border px-3 py-1 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50', on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover', disabled && 'cursor-default opacity-70')}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])} />
              {l}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}


export function FilterPills<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, number?][]; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map(([k, l, n]) => (
        <button key={k || 'all'} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cn('rounded-full border px-3 py-1 text-sm', value === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover')}>
          {l} {n !== undefined && <span className="num opacity-70">{n}</span>}
        </button>
      ))}
    </div>
  )
}
