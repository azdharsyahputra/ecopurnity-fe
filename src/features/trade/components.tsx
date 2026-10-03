import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, FileText, Handshake, PackageCheck, Scale, Star, Truck } from 'lucide-react'
import type { TransactionDetail } from '@/domain/types'
import { TERMS, TRADE_ACTION_LABEL, breakdown, timelineFor, tradeActions, tradeStateOf, type QcOutcome, type TradeAction } from '@/domain/trade'
import { statusMeta } from '@/domain/status'
import { formatDate, formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast'
import { useTradeAction, type TradeScope } from './hooks'
import { GuardedButton } from '@/features/org/ui'
import { StatusBadge, Tag } from '@/components/Tag'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, FormError, Segmented, SelectField, TextareaField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// F6 trade UI shared by the personal and business workspaces: action panel with its dialogs, and the
// progress / agreement / invoice / shipments / dispute / reviews / documents sections.

const IMPACT: Partial<Record<TradeAction, (t: TransactionDetail) => string>> = {
  accept_agreement: (t) => `Kamu menyetujui ${formatQty(t.quantity)} × ${formatIdr(t.unitPriceIdr)} dengan termin ${TERMS[t.terms ?? 'escrow'].label}. Agreement mengikat setelah kedua pihak setuju.`,
  issue_invoice: (t) => `Invoice ${formatIdr(breakdown(t.totalIdr).buyerPaysIdr)} (termasuk PPN 11%) dikirim ke pembeli.`,
  pay: (t) => (t.terms === 'escrow' ? `${formatIdr(breakdown(t.totalIdr).buyerPaysIdr)} ditahan di escrow dan baru dilepas setelah kamu menerima barang.` : `${formatIdr(breakdown(t.totalIdr).buyerPaysIdr)} dibayarkan ke supplier dan transaksi selesai.`),
  cancel: () => 'Transaksi dibatalkan untuk kedua pihak. Dana escrow (jika ada) dikembalikan. Tercatat di riwayat reputasi.',
}

/** Dialogs open from the URL (?do=ship|proof|qc|dispute|evidence|review) so they can be deep-linked from notifications. */
function useDialog() {
  const [params, setParams] = useSearchParams()
  const open = params.get('do')
  const set = (v: string | null) => setParams((p) => (v ? p.set('do', v) : p.delete('do'), p), { replace: true })
  return [open, set] as const
}

function ShipDialog({ t, scope, onClose }: { t: TransactionDetail; scope: TradeScope; onClose: () => void }) {
  const act = useTradeAction(scope, t.id)
  const left = tradeStateOf(t).unscheduledQty
  const [f, setF] = useState({ quantity: String(left), dropPoint: t.delivery.address, carrier: 'Armada supplier', scheduledAt: new Date().toISOString().slice(0, 10) })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jadwalkan pengiriman</DialogTitle>
          <DialogDescription>Kirim sekaligus atau bertahap. Sisa yang belum dijadwalkan: {formatNumber(left)} {t.quantity.unit}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={`Kuantitas (${t.quantity.unit})`} type="number" min={1} max={left} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={fieldError(act.error, 'quantity')} />
          <Field label="Titik tujuan" value={f.dropPoint} onChange={(e) => setF({ ...f, dropPoint: e.target.value })} error={fieldError(act.error, 'dropPoint')} />
          <SelectField label="Pengangkut" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })}>
            {['Armada supplier', 'JNE Trucking', 'Deliveree', 'Lalamove', 'Pengangkut dari market logistik'].map((c) => <option key={c}>{c}</option>)}
          </SelectField>
          {f.carrier === 'Pengangkut dari market logistik' && (
            <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              Butuh truk? <Link to={`/app/rfq/new?category=logistics&item=${encodeURIComponent(`Angkut ${t.title}`)}&qty=1&unit=trip`} className="font-medium text-primary hover:underline">Minta penawaran jasa angkut</Link>.
            </p>
          )}
          <Field label="Tanggal kirim" type="date" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} />
        </div>
        <FormError error={act.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'ship', shipment: { quantity: Number(f.quantity), dropPoint: f.dropPoint, carrier: f.carrier, scheduledAt: new Date(`${f.scheduledAt}T08:00:00`).toISOString() } }, { onSuccess: () => { toast({ title: 'Pengiriman dijadwalkan', tone: 'green' }); onClose() } })}>
            Kirim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProofDialog({ t, scope, onClose }: { t: TransactionDetail; scope: TradeScope; onClose: () => void }) {
  const act = useTradeAction(scope, t.id)
  const open = (t.shipments ?? []).filter((s) => s.status !== 'delivered')
  const [shipmentId, setShipmentId] = useState(open[0]?.id ?? '')
  const [file, setFile] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfirmasi terkirim</DialogTitle>
          <DialogDescription>Unggah surat jalan yang ditandatangani atau foto serah terima.</DialogDescription>
        </DialogHeader>
        <SelectField label="Pengiriman" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
          {open.map((s) => <option key={s.id} value={s.id}>{formatNumber(s.quantity)} {t.quantity.unit} → {s.dropPoint}</option>)}
        </SelectField>
        <label className="cursor-pointer rounded-lg border border-dashed p-3 text-sm hover:bg-hover">
          <span className="font-medium">Bukti</span>
          <span className="block truncate text-muted-foreground">{file || 'Pilih foto / PDF'}</span>
          <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
        </label>
        {fieldError(act.error, 'file') && <p className="text-xs text-destructive">{fieldError(act.error, 'file')}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!file || act.isPending} onClick={() => act.mutate({ action: 'upload_proof', shipmentId, file }, { onSuccess: () => { toast({ title: 'Pengiriman dikonfirmasi', tone: 'green' }); onClose() } })}>Konfirmasi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QcDialog({ t, scope, onClose }: { t: TransactionDetail; scope: TradeScope; onClose: () => void }) {
  const act = useTradeAction(scope, t.id)
  const [outcome, setOutcome] = useState<QcOutcome>('accepted')
  const [qty, setQty] = useState(String(t.quantity.value))
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Periksa & terima barang</DialogTitle>
          <DialogDescription>
            {t.terms === 'escrow' ? 'Menerima barang melepas dana escrow ke supplier.' : `Menerima barang memulai jatuh tempo ${TERMS[t.terms!].label}.`} Menolak membuka dispute.
          </DialogDescription>
        </DialogHeader>
        <Segmented label="Hasil QC" value={outcome} options={[['accepted', 'Terima semua'], ['partial', 'Terima sebagian'], ['rejected', 'Tolak']]} onChange={setOutcome} />
        {outcome === 'partial' && <Field label={`Kuantitas diterima (${t.quantity.unit})`} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} error={fieldError(act.error, 'acceptedQty')} hint="Kekurangan di-refund otomatis dari escrow" />}
        {outcome !== 'accepted' && <TextareaField label="Temuan QC" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(act.error, 'note')} />}
        <FormError error={act.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button variant={outcome === 'rejected' ? 'destructive' : 'default'} disabled={act.isPending} onClick={() => act.mutate({ action: 'confirm_receipt', qc: { outcome, acceptedQty: Number(qty), note } }, { onSuccess: () => { toast({ title: outcome === 'rejected' ? 'Barang ditolak, dispute dibuka' : 'Barang diterima', tone: outcome === 'rejected' ? 'red' : 'green' }); onClose() } })}>
            {outcome === 'rejected' ? 'Tolak & buka dispute' : 'Simpan hasil QC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoteDialog({ t, scope, action, onClose }: { t: TransactionDetail; scope: TradeScope; action: 'dispute' | 'add_evidence'; onClose: () => void }) {
  const act = useTradeAction(scope, t.id)
  const [note, setNote] = useState('')
  const [file, setFile] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action === 'dispute' ? `Ajukan dispute ${t.code}` : 'Kirim bukti'}</DialogTitle>
          <DialogDescription>{action === 'dispute' ? 'Dana tetap ditahan selama dispute. Kedua pihak bisa mengirim bukti, lalu Admin memutuskan.' : 'Bukti terlihat oleh pihak lain dan Admin.'}</DialogDescription>
        </DialogHeader>
        <TextareaField label={action === 'dispute' ? 'Apa masalahnya?' : 'Keterangan'} rows={4} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(act.error, 'note')} />
        <label className="cursor-pointer rounded-lg border border-dashed p-3 text-sm hover:bg-hover">
          <span className="block truncate text-muted-foreground">{file || 'Lampiran (opsional): foto, video, dokumen'}</span>
          <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button variant={action === 'dispute' ? 'destructive' : 'default'} disabled={!note.trim() || act.isPending} onClick={() => act.mutate({ action, note, file: file || undefined }, { onSuccess: () => { toast({ title: action === 'dispute' ? 'Dispute diajukan' : 'Bukti terkirim', tone: 'orange' }); onClose() } })}>
            {action === 'dispute' ? 'Ajukan' : 'Kirim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} bintang`} onClick={() => onChange(n)} className="p-0.5">
            <Star className={cn('size-5', n <= value ? 'fill-current' : 'text-muted-foreground')} style={n <= value ? { color: 'var(--tag-yellow-fg)' } : undefined} />
          </button>
        ))}
      </div>
    </div>
  )
}

function ReviewDialog({ t, scope, onClose }: { t: TransactionDetail; scope: TradeScope; onClose: () => void }) {
  const act = useTradeAction(scope, t.id)
  const [r, setR] = useState({ rating: 5, quality: 5, timeliness: 5, communication: 5, text: '' })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ulasan untuk {t.counterparty.name}</DialogTitle>
          <DialogDescription>Ulasan masuk ke reputasi dan scorecard mereka, dan tampil di profil publik.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Stars label="Keseluruhan" value={r.rating} onChange={(v) => setR({ ...r, rating: v })} />
          <Stars label="Kualitas" value={r.quality} onChange={(v) => setR({ ...r, quality: v })} />
          <Stars label="Ketepatan waktu" value={r.timeliness} onChange={(v) => setR({ ...r, timeliness: v })} />
          <Stars label="Komunikasi" value={r.communication} onChange={(v) => setR({ ...r, communication: v })} />
        </div>
        <TextareaField label="Ulasan (opsional)" rows={3} value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Nanti</Button>
          <Button disabled={act.isPending} onClick={() => act.mutate({ action: 'review', review: r }, { onSuccess: () => { toast({ title: 'Terima kasih atas ulasannya', tone: 'green' }); onClose() } })}>Kirim ulasan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const DIALOG_FOR: Partial<Record<TradeAction, string>> = { ship: 'ship', upload_proof: 'proof', confirm_receipt: 'qc', dispute: 'dispute', add_evidence: 'evidence', review: 'review' }

/**
 * The signed-in side's next steps on a trade. `deny` returns why the viewer's role may not take a step (org trades);
 * `children` renders after the actions (e.g. "Pesan lagi").
 */
export function ActionPanel({ t, scope, deny, children }: { t: TransactionDetail; scope: TradeScope; deny?: (a: TradeAction) => string | undefined; children?: ReactNode }) {
  const act = useTradeAction(scope, t.id)
  const [dialog, setDialog] = useDialog()
  const actions = tradeActions(tradeStateOf(t), t.role)
  const close = () => setDialog(null)

  return (
    <div className="flex flex-col gap-2">
      {actions.length === 0 && <p className="text-sm text-muted-foreground">{['completed', 'cancelled'].includes(t.status) ? 'Transaksi sudah selesai.' : `Menunggu ${t.counterparty.name}.`}</p>}
      {actions.map((a) =>
        deny?.(a) ? (
          <div key={a} className="flex flex-col gap-1">
            <GuardedButton className="h-9 w-full" variant="outline" reason={deny(a)}>{TRADE_ACTION_LABEL[a]}</GuardedButton>
            <p className="text-xs text-muted-foreground">{deny(a)}</p>
          </div>
        ) : DIALOG_FOR[a] ? (
          <Button key={a} variant={a === 'dispute' ? 'destructive' : a === 'review' || a === 'add_evidence' ? 'outline' : 'default'} className="h-9" onClick={() => setDialog(DIALOG_FOR[a]!)}>
            {TRADE_ACTION_LABEL[a]}
          </Button>
        ) : (
          <ConfirmDialog
            key={a}
            trigger={<Button variant={a === 'cancel' ? 'outline' : 'default'} className="h-9">{a === 'pay' ? `Bayar ${formatIdr(breakdown(t.totalIdr).buyerPaysIdr)}` : TRADE_ACTION_LABEL[a]}</Button>}
            title={`${TRADE_ACTION_LABEL[a]}?`}
            impact={IMPACT[a]?.(t)}
            confirmLabel={TRADE_ACTION_LABEL[a]}
            destructive={a === 'cancel'}
            onConfirm={() => act.mutateAsync({ action: a }).then(() => toast({ title: TRADE_ACTION_LABEL[a], body: t.code, tone: 'green' }))}
          />
        ),
      )}
      {children}
      <FormError error={act.error} />
      {dialog === 'ship' && <ShipDialog t={t} scope={scope} onClose={close} />}
      {dialog === 'proof' && <ProofDialog t={t} scope={scope} onClose={close} />}
      {dialog === 'qc' && <QcDialog t={t} scope={scope} onClose={close} />}
      {dialog === 'dispute' && <NoteDialog t={t} scope={scope} action="dispute" onClose={close} />}
      {dialog === 'evidence' && <NoteDialog t={t} scope={scope} action="add_evidence" onClose={close} />}
      {dialog === 'review' && <ReviewDialog t={t} scope={scope} onClose={close} />}
    </div>
  )
}

function MoneyRow({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 py-1 text-sm', strong && 'font-semibold', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  )
}

/** Left column of a trade detail page. */
export function TradeSections({ t }: { t: TransactionDetail }) {
  const terms = t.terms ?? 'escrow'
  const b = breakdown(t.totalIdr, t.makerFeeRate ?? 0)
  const state = tradeStateOf(t)
  const evidence = t.dispute?.evidence ?? []
  return (
    <>
      <section className="rounded-xl border bg-card p-4 md:p-5">
        <h2 className="font-medium">Progres</h2>
        <ol className="mt-4 flex flex-col">
          {timelineFor(terms).map((s, i, all) => {
            const step = t.timeline.find((x) => x.status === s)
            const reached = !!step?.at
            return (
              <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
                {i < all.length - 1 && <span className={cn('absolute top-6 left-3 h-full w-px', reached ? 'bg-primary' : 'bg-border')} />}
                <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-xs', reached ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground', t.status === s && 'ring-3 ring-primary/30')}>
                  {reached ? <Check className="size-3.5" /> : i + 1}
                </span>
                <div className="text-sm">
                  <p className={cn('font-medium', !reached && 'text-muted-foreground')}>{statusMeta('transaction', s).label}</p>
                  <p className="text-xs text-muted-foreground">{step?.at ? `${formatDateTime(step.at)}${step.note ? ` · ${step.note}` : ''}` : 'Menunggu'}</p>
                </div>
              </li>
            )
          })}
        </ol>
        {t.status === 'cancelled' && <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>Transaksi dibatalkan.</p>}
      </section>

      {t.status === 'agreement' && (
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-medium"><Handshake className="size-4 text-muted-foreground" /> Agreement</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mengikat setelah pembeli dan supplier sama-sama setuju. {TERMS[terms].hint}</p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {(['buyer', 'supplier'] as const).map((r) => (
              <li key={r} className="flex items-center gap-2 rounded-lg bg-muted p-2.5">
                {state.agreement[r] ? <Check className="size-4 text-primary" /> : <span className="size-4 rounded-full border" />}
                {r === 'buyer' ? 'Pembeli' : 'Supplier'} {r === t.role ? '(kamu)' : `(${t.counterparty.name})`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 md:p-5">
        <h2 className="font-medium">Tagihan</h2>
        {t.invoice && <p className="mt-1 text-xs text-muted-foreground">{t.invoice.number} · jatuh tempo {formatDate(t.invoice.dueAt)}</p>}
        <div className="mt-3 divide-y">
          <MoneyRow label={`${formatQty(t.quantity)} × ${formatIdr(t.unitPriceIdr)}`} value={formatIdr(b.subtotalIdr)} />
          <MoneyRow label="PPN 11%" value={formatIdr(b.vatIdr)} />
          <MoneyRow label="Total dibayar pembeli" value={formatIdr(b.buyerPaysIdr)} strong />
          {t.role === 'supplier' && (
            <>
              <MoneyRow label="Fee platform (1%)" value={`− ${formatIdr(b.platformFeeIdr)}`} muted />
              {b.makerFeeIdr > 0 && <MoneyRow label={`Komisi market maker (${((t.makerFeeRate ?? 0) * 100).toFixed(1).replace('.', ',')}%)`} value={`− ${formatIdr(b.makerFeeIdr)}`} muted />}
              <MoneyRow label="Diterima kamu" value={formatIdr(b.supplierReceivesIdr)} strong />
            </>
          )}
        </div>
        {t.qc && t.qc.outcome !== 'accepted' && <p className="mt-3 rounded-lg bg-muted p-2.5 text-xs">QC: {t.qc.outcome === 'partial' ? `diterima ${formatNumber(t.qc.acceptedQty)} ${t.quantity.unit}` : 'ditolak'} · {t.qc.note}</p>}
      </section>

      <section className="rounded-xl border bg-card p-4 md:p-5">
        <h2 className="flex items-center gap-2 font-medium"><Truck className="size-4 text-muted-foreground" /> Pengiriman</h2>
        {(t.shipments ?? []).length ? (
          <ul className="mt-3 divide-y text-sm">
            {t.shipments!.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <PackageCheck className="size-4 text-muted-foreground" />
                <span className="num font-medium">{formatNumber(s.quantity)} {t.quantity.unit}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">→ {s.dropPoint} · {s.carrier}</span>
                <Tag tone={s.status === 'delivered' ? 'green' : 'blue'}>{s.status === 'delivered' ? 'Terkirim' : 'Dalam perjalanan'}</Tag>
                <span className="text-xs text-muted-foreground">{formatDate(s.deliveredAt ?? s.scheduledAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Belum ada pengiriman. {terms === 'escrow' ? 'Supplier mengirim setelah pembeli membayar ke escrow.' : 'Supplier bisa mengirim setelah invoice terbit.'}</p>
        )}
        {state.unscheduledQty > 0 && (t.shipments ?? []).length > 0 && <p className="mt-2 text-xs text-muted-foreground">Sisa belum dijadwalkan: {formatNumber(state.unscheduledQty)} {t.quantity.unit}</p>}
      </section>

      {t.dispute && (
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-medium"><Scale className="size-4 text-muted-foreground" /> Dispute <StatusBadge entity="dispute" status={t.dispute.status} /></h2>
          <ul className="mt-3 flex flex-col gap-3">
            {(evidence.length ? evidence : [{ id: 'reason', by: t.role, name: 'Kamu', text: t.dispute.reason, at: t.dispute.openedAt }]).map((e) => (
              <li key={e.id} className={cn('max-w-[90%] rounded-xl p-3 text-sm', e.by === t.role ? 'self-end bg-primary/10' : 'self-start bg-muted')}>
                <p className="text-xs text-muted-foreground">{e.name} · {e.by === 'buyer' ? 'pembeli' : 'supplier'} · {formatRelative(e.at)}</p>
                <p className="mt-1">{e.text}</p>
                {'file' in e && e.file && <p className="mt-1 text-xs text-muted-foreground">Lampiran: {e.file}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {Object.values(t.reviews ?? {}).length > 0 && (
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <h2 className="font-medium">Ulasan</h2>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            {(['buyer', 'supplier'] as const).map((r) => t.reviews?.[r] && (
              <li key={r}>
                <p className="flex items-center gap-1 font-medium">{t.reviews[r]!.by} <Star className="size-3.5 fill-current" style={{ color: 'var(--tag-yellow-fg)' }} /> {t.reviews[r]!.rating}/5</p>
                {t.reviews[r]!.text && <p className="text-muted-foreground">{t.reviews[r]!.text}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 md:p-5">
        <h2 className="font-medium">Dokumen</h2>
        <ul className="mt-3 divide-y text-sm">
          {t.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <FileText className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{d.name}</span>
              <Tag>{{ order: 'Order', agreement: 'Agreement', invoice: 'Invoice', proof: 'Bukti' }[d.kind]}</Tag>
              <span className="text-xs text-muted-foreground">{formatDate(d.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
