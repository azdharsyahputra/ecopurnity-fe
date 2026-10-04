import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import type { TransactionDetail } from '@/domain/types'
import { breakdown } from '@/domain/trade'
import { formatIdr } from '@/domain/format'
import type { Tone } from '@/domain/status'
import { PAYMENT_OPTIONS, PAYMENT_STATUS_LABEL, howToPay, paymentLabel, paymentOpen, type Payment, type PaymentInput } from '@/domain/payment'
import { toast } from '@/stores/toast'
import { useCurrentPayment, usePaymentActions, type TradeScope } from './hooks'
import { Tag } from '@/components/Tag'
import { Countdown } from '@/components/Countdown'
import { FormError } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'




const TONE: Record<string, Tone> = { bca: 'blue', bni: 'orange', bri: 'blue', permata: 'green', cimb: 'red', mandiri: 'yellow', qris: 'gray', gopay: 'teal', shopeepay: 'orange' }


const group4 = (s: string) => s.replace(/(\d{4})(?=\d)/g, '$1 ')

function CopyValue({ label, value, copy = value, big }: { label: string; value: string; copy?: string; big?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={big ? 'num text-lg font-semibold tracking-wide break-all' : 'num font-medium'}>{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Salin ${label.toLowerCase()}`}
        onClick={() =>
          navigator.clipboard?.writeText(copy).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          })
        }
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}

function Instructions({ p, onChange, onCancel, busy }: { p: Payment; onChange: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={TONE[p.bank ?? p.method]}>{paymentLabel(p)}</Tag>
        <span className="text-xs text-muted-foreground">Sisa <Countdown to={p.expiresAt} /></span>
      </div>
      <CopyValue label="Jumlah" value={formatIdr(p.amountIdr)} copy={String(p.amountIdr)} />
      {p.vaNumber && <CopyValue label="Nomor virtual account" value={group4(p.vaNumber)} copy={p.vaNumber} big />}
      {p.billKey && (
        <>
          <CopyValue label="Kode perusahaan" value={p.billerCode ?? ''} />
          <CopyValue label="Kode bayar" value={group4(p.billKey)} copy={p.billKey} big />
        </>
      )}
      {p.qrUrl && <img src={p.qrUrl} alt={`Kode QR ${paymentLabel(p)}`} className="mx-auto size-48 rounded-lg border bg-white p-2" />}
      {p.deeplinkUrl && (
        <Button variant="outline" className="h-9" render={<a href={p.deeplinkUrl} target="_blank" rel="noreferrer" />}>
          <ExternalLink /> Buka {paymentLabel(p)}
        </Button>
      )}
      <div>
        <p className="text-xs font-medium">Cara bayar</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
          {howToPay(p).map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3 animate-spin" /> Status diperbarui otomatis setelah kamu membayar.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onChange} disabled={busy}>Ganti metode</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Batalkan pembayaran</Button>
      </div>
    </div>
  )
}

const SUB: Record<string, string> = { mandiri: 'Bill', qris: 'Scan QR', gopay: 'QR / app', shopeepay: 'App' }

function MethodDialog({ t, open, onPick, onClose, busy, error }: { t: TransactionDetail; open: boolean; onPick: (i: PaymentInput) => void; onClose: () => void; busy: boolean; error: unknown }) {
  const amount = breakdown(t.totalIdr).buyerPaysIdr
  const group = (g: 'va' | 'instant') => (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PAYMENT_OPTIONS.filter((o) => o.group === g).map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={busy}
          onClick={() => onPick(o.input)}
          className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3 text-left text-sm transition-colors hover:bg-hover disabled:opacity-50"
        >
          <Tag tone={TONE[o.key]}>{o.group === 'va' ? (o.key === 'cimb' ? 'CIMB' : o.label.toUpperCase()) : o.label}</Tag>
          <span className="hidden truncate text-muted-foreground min-[400px]:inline">{SUB[o.key] ?? 'VA'}</span>
        </button>
      ))}
    </div>
  )
  return (

    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bayar {formatIdr(amount)}</DialogTitle>
          <DialogDescription>
            {t.invoice?.number ?? t.code} · termasuk PPN 11%.{' '}
            {t.terms === 'escrow' ? 'Dana ditahan di escrow sampai kamu menerima barang.' : 'Dana diteruskan ke supplier dan transaksi selesai.'}
          </DialogDescription>
        </DialogHeader>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Transfer bank · berlaku 24 jam</p>
          {group('va')}
          <p className="mt-4 text-xs font-medium text-muted-foreground">QRIS & e-wallet · berlaku 15 menit</p>
          {group('instant')}
        </div>
        {busy && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Membuat instruksi pembayaran…</p>}
        <FormError error={error} />
        <p className="text-xs text-muted-foreground">Kartu kredit belum tersedia.</p>
      </DialogContent>
    </Dialog>
  )
}


export function PayPanel({ t, scope }: { t: TransactionDetail; scope: TradeScope }) {
  const qc = useQueryClient()
  const { data: p } = useCurrentPayment(scope, t.id)
  const { create, cancel } = usePaymentActions(scope, t.id)
  const [picking, setPicking] = useState(false)


  const prev = useRef(p?.status)
  useEffect(() => {
    if (prev.current === 'pending' && p?.status === 'settlement') {
      toast({ title: 'Pembayaran diterima', body: t.code, tone: 'green' })
      qc.invalidateQueries({ queryKey: scope.tradeKey(t.id) })
    }
    prev.current = p?.status
  }, [p?.status, qc, scope, t.code, t.id])

  const open = paymentOpen(p)
  const closed = p && !open && p.status !== 'settlement' ? (p.status === 'pending' ? PAYMENT_STATUS_LABEL.expire : PAYMENT_STATUS_LABEL[p.status]) : undefined
  return (
    <>
      {p && open ? (
        <Instructions p={p} busy={cancel.isPending} onChange={() => setPicking(true)} onCancel={() => cancel.mutate()} />
      ) : p?.status === 'settlement' ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-muted p-2.5 text-sm"><Loader2 className="size-3.5 animate-spin" /> Pembayaran diterima, memperbarui transaksi…</p>
      ) : (
        <>
          {closed && <p className="rounded-lg bg-muted p-2.5 text-xs">{closed}. Pilih metode lagi untuk membayar.</p>}
          <Button className="h-9" onClick={() => setPicking(true)}>Bayar {formatIdr(breakdown(t.totalIdr).buyerPaysIdr)}</Button>
        </>
      )}
      <FormError error={cancel.error} />
      <MethodDialog t={t} open={picking} busy={create.isPending} error={create.error} onClose={() => setPicking(false)} onPick={(input) => create.mutate(input, { onSuccess: () => setPicking(false) })} />
    </>
  )
}
