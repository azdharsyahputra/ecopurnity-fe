import { useState, type ReactElement, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'

/**
 * Risky actions (bid, award, suspend, freeze) summarise their impact instead of "Are you sure?" (PRD §5 principle 6).
 * `onConfirm` may be async; the dialog stays open and busy until it settles.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  impact,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: ReactElement
  title: string
  description?: ReactNode
  /** What will happen, e.g. a short list or a summary table. */
  impact?: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => unknown
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {impact && <div className="rounded-lg bg-muted p-3 text-sm">{impact}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={busy}>
            {busy ? 'Memproses…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
