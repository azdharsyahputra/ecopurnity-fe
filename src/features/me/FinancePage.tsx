import { useState } from 'react'
import { ArrowDownToLine, Banknote, Hourglass, Landmark, Lock, Wallet } from 'lucide-react'
import { formatDateTime, formatIdr } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import { useFinance, useFinanceAction, type Finance } from './hooks'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { AsyncView } from '@/components/States'
import { Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, FormError, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const KIND: Record<Finance['entries'][number]['kind'], [string, 'blue' | 'green' | 'red' | 'orange' | 'gray' | 'purple']> = {
  escrow: ['Escrow', 'blue'], payment: ['Pembayaran', 'gray'], payout: ['Pencairan', 'green'], refund: ['Refund', 'purple'], fee: ['Fee', 'orange'], withdrawal: ['Tarik dana', 'gray'],
}
const WITHDRAWAL: Record<Finance['withdrawals'][number]['status'], [string, 'yellow' | 'green' | 'red']> = {
  processing: ['Diproses admin', 'yellow'], paid: ['Sudah ditransfer', 'green'], rejected: ['Ditolak', 'red'],
}
const BANKS = ['BCA', 'BRI', 'Mandiri', 'BNI', 'BSI', 'CIMB Niaga']

function BankForm({ f }: { f: Finance }) {
  const act = useFinanceAction()
  const [b, setB] = useState(f.bank ?? { bank: 'BCA', accountNo: '', holder: '' })
  return (
    <form
      className="grid content-start gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        act.mutate({ type: 'bank', bank: b }, { onSuccess: () => toast({ title: 'Rekening disimpan', tone: 'green' }) })
      }}
    >
      <div><h3 className="font-semibold">{f.bank ? 'Perbarui rekening pencairan' : 'Tambahkan rekening pencairan'}</h3><p className="mt-1 text-sm text-muted-foreground">Pastikan data rekening sesuai dengan identitas terverifikasi.</p></div>
      <SelectField label="Bank" value={b.bank} onChange={(e) => setB({ ...b, bank: e.target.value })} error={fieldError(act.error, 'bank')}>
        {BANKS.map((x) => <option key={x}>{x}</option>)}
      </SelectField>
      <Field label="Nomor rekening" inputMode="numeric" value={b.accountNo} onChange={(e) => setB({ ...b, accountNo: e.target.value.replace(/\D/g, '') })} error={fieldError(act.error, 'accountNo')} />
      <Field label="Nama pemilik" value={b.holder} onChange={(e) => setB({ ...b, holder: e.target.value })} error={fieldError(act.error, 'holder')} hint="Harus sama dengan nama di identitas terverifikasi" />
      <FormError error={act.error} />
      <Button type="submit" className="h-10 w-full font-semibold shadow-sm transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" disabled={act.isPending}>
        {act.isPending ? 'Menyimpan…' : f.bank ? 'Perbarui rekening' : 'Simpan rekening'}
      </Button>
    </form>
  )
}

function Withdraw({ f }: { f: Finance }) {
  const act = useFinanceAction()
  const [amount, setAmount] = useState(String(f.availableIdr))
  const value = Number(amount)
  return (
    <div className="grid gap-3">
      <Field label="Jumlah (Rp)" type="number" min={0} max={f.availableIdr} value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldError(act.error, 'amountIdr')} hint={`Tersedia ${formatIdr(f.availableIdr)}`} />
      <ConfirmDialog
        trigger={<Button className="h-9" disabled={!f.bank || !(value > 0)}><ArrowDownToLine /> Tarik dana</Button>}
        title={`Tarik ${formatIdr(value)}?`}
        impact={f.bank ? `Admin mentransfer ke ${f.bank.bank} ••${f.bank.accountNo.slice(-4)} a.n. ${f.bank.holder}. Diproses admin, biasanya 1 hari kerja.` : undefined}
        confirmLabel="Tarik dana"
        onConfirm={() => act.mutateAsync({ type: 'withdraw', amountIdr: value }).then(() => toast({ title: 'Penarikan diproses', body: 'Diproses admin, biasanya 1 hari kerja.', tone: 'green' }))}
      />
      {!f.bank && <p className="text-xs text-muted-foreground">Tambahkan rekening pencairan dulu.</p>}
      <FormError error={act.error} />
    </div>
  )
}

function Withdrawals({ f }: { f: Finance }) {
  if (!f.withdrawals.length) return null
  return (
    <section className="min-w-0">
      <h2 className="mb-1 font-medium">Penarikan</h2>
      <p className="mb-3 text-sm text-muted-foreground">Diproses admin, biasanya 1 hari kerja. Penarikan yang ditolak kembali ke saldo.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {f.withdrawals.map((w) => (
          <li key={w.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="num font-medium">{formatIdr(w.amountIdr)}</p>
              <p className="text-xs text-muted-foreground">Diajukan {formatDateTime(w.at)}</p>
              {w.status === 'paid' && <p className="mt-1 text-xs">Ditransfer{w.paidAt && ` ${formatDateTime(w.paidAt)}`}{w.transferRef && <> · ref <span className="font-mono">{w.transferRef}</span></>}</p>}
              {w.status === 'rejected' && w.reason && <p className="mt-1 text-xs break-words">Alasan: {w.reason}</p>}
            </div>
            <Tag tone={WITHDRAWAL[w.status][1]}>{WITHDRAWAL[w.status][0]}</Tag>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FinancePage() {
  const query = useFinance()
  return (
    <>
      <PageHeader title="Keuangan" description="Dana di escrow, piutang, saldo yang bisa ditarik, dan riwayat uang masuk-keluar." icon={Wallet} tone="green" featured />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(f) => (
          <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Saldo bisa ditarik" icon={Banknote} tone="green" value={formatIdr(f.availableIdr, { compact: true })} hint="hasil penjualan yang sudah selesai" />
              <StatTile label="Piutang" icon={Hourglass} tone="blue" value={formatIdr(f.receivableIdr, { compact: true })} hint="di escrow atau menunggu pembayaran" />
              <StatTile label="Dana kamu di escrow" icon={Lock} tone="purple" value={formatIdr(f.escrowHeldIdr, { compact: true })} hint="sebagai pembeli, belum dilepas" />
              <StatTile label="Sudah ditarik" icon={Landmark} tone="gray" value={formatIdr(f.withdrawnIdr, { compact: true })} />
            </div>
            <div className="grid grid-cols-1 gap-6">
              <aside className="grid content-start gap-4 md:grid-cols-2">
                <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02] sm:p-5">
                  <div className="mb-4 border-b pb-3"><h2 className="font-semibold tracking-tight">Tarik dana</h2><p className="mt-1 text-sm text-muted-foreground">Ajukan pencairan ke rekening terdaftar.</p></div>
                  <Withdraw key={f.availableIdr} f={f} />
                </section>
                <section className="rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02] sm:p-5">
                  <div className="mb-4 border-b pb-3"><h2 className="font-semibold tracking-tight">Rekening pencairan</h2><p className="mt-1 text-sm text-muted-foreground">Kelola tujuan transfer saldomu.</p></div>
                  <BankForm f={f} />
                </section>
              </aside>
              <div className="flex min-w-0 flex-col gap-6">
              <Withdrawals f={f} />
              <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm shadow-foreground/[0.02] sm:p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b pb-3">
                  <div><h2 className="font-semibold tracking-tight">Riwayat keuangan</h2><p className="mt-1 text-sm text-muted-foreground">Catatan uang masuk, pembayaran, biaya, dan pencairan.</p></div>
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{f.entries.length} catatan</span>
                </div>
                {f.entries.length ? (
                  <DataTable
                    caption="Riwayat keuangan"
                    rows={f.entries}
                    rowKey={(e) => e.id}
                    initialSort={{ key: 'at', dir: 'desc' }}
                    columns={[
                      { key: 'label', header: 'Keterangan', primary: true, cell: (e) => e.label },
                      { key: 'kind', header: 'Jenis', cell: (e) => <Tag tone={KIND[e.kind][1]}>{KIND[e.kind][0]}</Tag> },
                      { key: 'amount', header: 'Jumlah', align: 'right', cell: (e) => <span style={{ color: `var(--tag-${e.amountIdr >= 0 ? 'green' : 'gray'}-fg)` }}>{e.amountIdr >= 0 ? '+' : '−'}{formatIdr(Math.abs(e.amountIdr))}</span>, sortValue: (e) => e.amountIdr },
                      { key: 'at', header: 'Waktu', cell: (e) => <span className="text-muted-foreground">{formatDateTime(e.at)}</span>, sortValue: (e) => e.at },
                    ]}
                  />
                ) : (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pergerakan dana.</p>
                )}
              </section>
              </div>
            </div>
          </div>
        )}
      </AsyncView>
    </>
  )
}
