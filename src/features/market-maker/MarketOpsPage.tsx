import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, BadgeCheck, ExternalLink, Gavel, History, Lock, Pause, Pencil, Play, Plus, Scale, ShoppingCart, PackageOpen, Users, Wallet, XCircle,
} from 'lucide-react'
import type { MmMarketOps, MmParticipant, MmDispute } from '@/domain/mm'
import { PARTICIPANT_STATUS, SUPPLIER_VERIFICATION } from '@/domain/mm'
import { activeVersion, diffRules, pendingVersion, rulesToLabeled, validateRules, type MarketRules } from '@/domain/marketRules'
import { AUCTION_TYPES, MECHANISMS } from '@/domain/catalog'
import { ROUND_TYPE } from '@/domain/mm'
import { formatDate, formatDateTime, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { fieldError } from '@/lib/api'
import { toast } from '@/stores/toast'
import {
  useCreateRound, useDisputeAction, useMarketAudit, useMarketStatus, useMmMarket, useParam, useParticipantAction, useSaveRules, useSettle, useSettlement,
} from './hooks'
import { AlertTags, ReasonConfirm, RulesFields } from './ui'
import { MarketAnalytics } from './analytics'
import { CategoryTag, GapMeter, RulesList } from '@/features/economy/components'
import { auctionPriceLabel } from '@/features/economy/utils'
import { AsyncView, EmptyState } from '@/components/States'
import { StatTile } from '@/components/StatTile'
import { StatusBadge, Tag } from '@/components/Tag'
import { DataTable } from '@/components/DataTable'
import { Countdown } from '@/components/Countdown'
import { AuditLog } from '@/components/AuditLog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field, FormError, SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const TABS = {
  overview: 'Overview', participants: 'Participants', rounds: 'Auctions / rounds', rules: 'Rules', governance: 'Governance', analytics: 'Analytics', audit: 'Audit log',
} as const
type TabId = keyof typeof TABS

const isLive = (s: string) => s === 'live' || s === 'extended'
const canRun = (s: string) => s === 'active' || s === 'formation'

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 md:p-5 ${className ?? ''}`}>
      <h3 className="font-medium">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Diff({ changes }: { changes: { field: string; before?: string; after?: string }[] }) {
  if (!changes.length) return <p className="text-sm text-muted-foreground">Tidak ada perubahan.</p>
  return (
    <dl className="grid gap-1.5 text-sm">
      {changes.map((c) => (
        <div key={c.field} className="flex flex-wrap items-baseline gap-1.5">
          <dt className="text-muted-foreground">{c.field}:</dt>
          <dd className="rounded px-1 line-through" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>{c.before}</dd>
          <dd className="rounded px-1" style={{ background: 'var(--tag-green-bg)', color: 'var(--tag-green-fg)' }}>{c.after}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Overview ─────────────────────────────────────────────────────

function Overview({ d, go }: { d: MmMarketOps; go: (t: TabId) => void }) {
  const m = d.market
  const live = d.rounds.filter((a) => isLive(a.status)).length
  const active = activeVersion(d.ruleVersions, d.currentRound)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Demand" icon={ShoppingCart} tone="blue" value={formatQty(m.demand, { compact: true })} hint="per bulan" />
        <StatTile label="Supply" icon={PackageOpen} tone="teal" value={formatQty(m.supply, { compact: true })} hint="per bulan" />
        <StatTile label="Participants" icon={Users} tone="purple" value={formatNumber(m.buyers + m.suppliers)} hint={`${m.buyers} pembeli · ${m.suppliers} supplier`} />
        <StatTile label="Round live" icon={Gavel} tone="lime" value={live} hint={`Round ke-${d.currentRound} sudah berjalan`} />
        <StatTile label="Volume 30 hari" icon={Wallet} tone="orange" value={formatIdr(m.volume30dIdr, { compact: true })} className="col-span-2 md:col-span-1" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Perlu perhatian">
          {d.alerts.length ? (
            <ul className="flex flex-col gap-2">
              {d.alerts.map((a) => (
                <li key={a.kind} className="flex items-center justify-between gap-2">
                  <AlertTags alerts={[a]} />
                  <Button size="xs" variant="outline" onClick={() => go(a.kind === 'disputes' ? 'governance' : a.kind === 'approvals' ? 'participants' : 'analytics')}>Tangani</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tidak ada alert. Market berjalan sehat.</p>
          )}
          <GapMeter demand={m.demand} supply={m.supply} className="mt-4" />
        </Panel>
        <Panel title="Konfigurasi">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Mekanisme</dt><dd>{MECHANISMS[m.mechanism].label} · round {AUCTION_TYPES[ROUND_TYPE[m.mechanism]].label}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Aturan aktif</dt><dd>v{active.version}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Approval</dt><dd>{d.settings.approval === 'manual' ? 'Manual' : 'Otomatis'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Verifikasi supplier</dt><dd className="text-right">{SUPPLIER_VERIFICATION[d.settings.supplierVerification]}</dd></div>
          </dl>
        </Panel>
      </div>
    </div>
  )
}

// ── Participants ─────────────────────────────────────────────────

function ParticipantActions({ marketId, p }: { marketId: string; p: MmParticipant }) {
  const act = useParticipantAction(marketId)
  const run = (action: 'approve' | 'reject' | 'verify' | 'suspend', reason?: string) =>
    act.mutateAsync({ id: p.id, action, reason }).then(() => toast({ title: `${p.name}: ${{ approve: 'disetujui', reject: 'ditolak', verify: 'terverifikasi', suspend: 'disuspend' }[action]}`, tone: action === 'approve' || action === 'verify' ? 'green' : 'orange' }))
  return (
    <div className="flex flex-wrap gap-1">
      {p.status === 'pending' && (
        <>
          <Button size="xs" disabled={act.isPending} onClick={() => run('approve').catch((e: Error) => toast({ title: e.message, tone: 'red' }))}>Approve</Button>
          <ReasonConfirm
            trigger={<Button size="xs" variant="outline">Tolak</Button>}
            title={`Tolak ${p.name}?`}
            impact={<>{p.name} tidak bisa ikut round di market ini dan menerima notifikasi berisi alasanmu.</>}
            confirmLabel="Tolak"
            destructive
            error={act.error}
            onConfirm={(r) => run('reject', r)}
          />
        </>
      )}
      {p.role === 'supplier' && !p.verified && p.status !== 'rejected' && (
        <ConfirmDialog
          trigger={<Button size="xs" variant="outline"><BadgeCheck /> Verifikasi</Button>}
          title={`Verifikasi supplier ${p.name}?`}
          impact="Badge terverifikasi tampil di semua round market ini. Pastikan dokumen legal usaha sudah kamu periksa."
          confirmLabel="Verifikasi"
          onConfirm={() => run('verify')}
        />
      )}
      {p.status === 'active' && (
        <ReasonConfirm
          trigger={<Button size="xs" variant="ghost">Suspend</Button>}
          title={`Suspend ${p.name} dari market?`}
          impact={<ul className="list-disc space-y-1 pl-4"><li>Tidak bisa bid di round berikutnya</li><li>Bid yang sudah tercatat tetap tercatat</li><li>{p.name} menerima notifikasi berisi alasanmu</li></ul>}
          confirmLabel="Suspend"
          destructive
          error={act.error}
          onConfirm={(r) => run('suspend', r)}
        />
      )}
    </div>
  )
}

function Participants({ d }: { d: MmMarketOps }) {
  const [filter, setFilter] = useParam('p')
  const f = (filter || (d.participants.some((p) => p.status === 'pending') ? 'pending' : 'active')) as MmParticipant['status'] | 'all'
  const rows = d.participants.filter((p) => f === 'all' || p.status === f)
  const groups: [typeof f, string][] = [['pending', 'Menunggu approval'], ['active', 'Aktif'], ['suspended', 'Disuspend'], ['rejected', 'Ditolak'], ['all', 'Semua']]
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status participant">
        {groups.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={f === k} onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-sm ${f === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-hover'}`}>
            {l} <span className="num opacity-70">{k === 'all' ? d.participants.length : d.participants.filter((p) => p.status === k).length}</span>
          </button>
        ))}
      </div>
      {rows.length ? (
        <DataTable
          caption="Participants market"
          rows={rows}
          rowKey={(p) => p.id}
          columns={[
            { key: 'name', header: 'Participant', primary: true, cell: (p) => <span>{p.name} {p.verified && <Tag tone="teal">Verified</Tag>}</span>, sortValue: (p) => p.name },
            { key: 'role', header: 'Peran', cell: (p) => (p.role === 'buyer' ? 'Pembeli' : 'Supplier') },
            { key: 'rep', header: 'Reputasi', align: 'right', cell: (p) => p.reputation, sortValue: (p) => p.reputation },
            { key: 'status', header: 'Status', cell: (p) => <Tag tone={PARTICIPANT_STATUS[p.status].tone}>{PARTICIPANT_STATUS[p.status].label}</Tag> },
            { key: 'joined', header: 'Bergabung', cell: (p) => <span className="text-muted-foreground">{formatRelative(p.joinedAt)}</span>, sortValue: (p) => p.joinedAt },
            { key: 'act', header: 'Aksi', cell: (p) => <ParticipantActions marketId={d.market.id} p={p} /> },
          ]}
        />
      ) : (
        <EmptyState icon={Users} title="Tidak ada participant di status ini" />
      )}
    </>
  )
}

// ── Rounds ───────────────────────────────────────────────────────

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

function NewRoundDialog({ d, onClose }: { d: MmMarketOps; onClose: () => void }) {
  const m = d.market
  const next = d.currentRound + 1
  const rules = activeVersion(d.ruleVersions, next).rules
  const create = useCreateRound(m.id)
  const [f, setF] = useState({
    title: `${m.name} · round ${next}`, quantity: String(Math.max(rules.minQuantity * 10, 1)),
    opening: String(Math.round(ROUND_TYPE[m.mechanism] === 'forward' ? m.priceRange.minIdr : m.priceRange.maxIdr)), duration: MOCKS ? '10' : '1440',
  })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const unit = m.priceRange.unit
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buka round {next}</DialogTitle>
          <DialogDescription>
            Round langsung live sebagai {AUCTION_TYPES[ROUND_TYPE[m.mechanism]].label.toLowerCase()} auction dengan aturan v{activeVersion(d.ruleVersions, next).version}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Judul round" value={f.title} onChange={(e) => set('title', e.target.value)} error={fieldError(create.error, 'title')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Kuantitas (${unit})`} type="number" min={0} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} error={fieldError(create.error, 'quantity')} />
            <Field label={`Harga pembuka per ${unit} (Rp)`} type="number" min={0} value={f.opening} onChange={(e) => set('opening', e.target.value)} error={fieldError(create.error, 'openingPriceIdr')} />
          </div>
          <SelectField label="Durasi" value={f.duration} onChange={(e) => set('duration', e.target.value)}>
            {MOCKS && <option value="10">10 menit (demo)</option>}
            <option value="60">1 jam</option>
            <option value="1440">24 jam</option>
            <option value="4320">3 hari</option>
          </SelectField>
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Participant aktif mendapat undangan. Langkah bid minimum {rules.minStepPct}% ({formatIdr(Math.max(1, Math.round((Number(f.opening) * rules.minStepPct) / 100)))}). Setelah ditutup, hasil round tercatat final.
          </p>
        </div>
        <FormError error={create.error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={create.isPending}
            onClick={() => create.mutate(
              { title: f.title, quantity: Number(f.quantity), openingPriceIdr: Number(f.opening), durationMinutes: Number(f.duration) },
              { onSuccess: () => { toast({ title: `Round ${next} live`, body: f.title, tone: 'green' }); onClose() } },
            )}
          >
            {create.isPending ? 'Membuka…' : 'Buka round'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettlementDialog({ marketId, auctionId, onClose }: { marketId: string; auctionId: string; onClose: () => void }) {
  const query = useSettlement(marketId, auctionId)
  const settle = useSettle(marketId)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settlement kolektif</DialogTitle>
          <DialogDescription>Lot dibagi pro-rata ke anggota sesuai kontribusinya; tiap anggota dapat transaksi escrow sendiri dengan pemenang.</DialogDescription>
        </DialogHeader>
        <AsyncView query={query} skeleton={<Skeleton className="h-40 rounded-lg" />}>
          {(s) => (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                <b>{s.winner}</b> · {formatIdr(s.priceIdr)}/{s.unit} · lot {formatNumber(s.lotQty)} {s.unit}
              </p>
              <ul className="divide-y rounded-lg border">
                {s.lines.map((l) => (
                  <li key={l.memberId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="font-medium">{l.member}</span>
                    {!l.userId && <Tag tone="gray">peserta luar</Tag>}
                    <span className="ml-auto num text-muted-foreground">{formatNumber(l.quantity)} {s.unit} · {Math.round(l.share * 100)}%</span>
                    <span className="num w-28 text-right font-medium">{formatIdr(l.amountIdr, { compact: true })}</span>
                  </li>
                ))}
              </ul>
              {s.settled ? (
                <p className="text-muted-foreground">Sudah di-settle oleh {s.settled.by}, {formatDateTime(s.settled.at)} ({s.settled.trades} transaksi).</p>
              ) : (
                <FormError error={settle.error} />
              )}
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>Tutup</Button>
                {!s.settled && (
                  <Button
                    disabled={settle.isPending || !s.lines.length}
                    onClick={() => settle.mutate(auctionId, { onSuccess: (r) => { toast({ title: `${r.lines.length} transaksi dibuat`, tone: 'green' }); onClose() } })}
                  >
                    Settle {s.lines.length} anggota
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </AsyncView>
      </DialogContent>
    </Dialog>
  )
}

function Rounds({ d }: { d: MmMarketOps }) {
  const [dialog, setDialog] = useParam('round')
  const live = d.rounds.filter((a) => isLive(a.status))
  const upcoming = d.rounds.filter((a) => a.status === 'scheduled' || a.status === 'qualification')
  const recorded = d.results.filter((r) => r.status === 'closed').reverse()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Round berikutnya: <b className="text-foreground">#{d.currentRound + 1}</b></p>
        <Button className="h-9" disabled={!canRun(d.market.status)} onClick={() => setDialog('new')}><Plus /> Buka round baru</Button>
      </div>
      {!canRun(d.market.status) && <p className="text-sm text-muted-foreground">Market berstatus {d.market.status}; round baru tidak bisa dibuka.</p>}

      <section aria-labelledby="live-rounds">
        <h3 id="live-rounds" className="mb-3 font-medium">Round live</h3>
        {live.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {live.map((a) => (
              <li key={a.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-1.5">
                  <StatusBadge entity="auction" status={a.status} />
                  <Tag>{AUCTION_TYPES[a.type].label}</Tag>
                  <span className="ml-auto text-xs text-muted-foreground">{a.code}</span>
                </div>
                <p className="mt-2 font-medium">{a.title}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">{a.type === 'dutch' ? 'Harga kini' : 'Terbaik'}</dt><dd className="num font-semibold">{auctionPriceLabel(a)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Bid · peserta</dt><dd className="num font-semibold">{a.bidCount} · {a.participants}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Sisa</dt><dd><Countdown to={a.endsAt} /></dd></div>
                </dl>
                <Button size="sm" variant="outline" className="mt-3" render={<Link to={`/auctions/${a.id}`} />}><ExternalLink /> Pantau di auction room</Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Gavel} title="Tidak ada round live" description="Buka round baru supaya peserta bisa mulai bid." />
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-rounds">
          <h3 id="upcoming-rounds" className="mb-3 font-medium">Terjadwal</h3>
          <ul className="divide-y rounded-xl border bg-card">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <StatusBadge entity="auction" status={a.status} />
                <Link to={`/auctions/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                <span className="ml-auto text-muted-foreground">Mulai {formatDateTime(a.startsAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recorded-rounds">
        <h3 id="recorded-rounds" className="font-medium">Hasil tercatat</h3>
        <p className="mt-1 mb-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5" /> Final dan read-only. Market maker tidak bisa mengubah hasil round; koreksi hanya lewat dispute.
        </p>
        {recorded.length ? (
          <DataTable
            caption="Hasil round tercatat"
            rows={recorded}
            rowKey={(r) => String(r.round)}
            columns={[
              {
                key: 'round', header: 'Round', primary: true, sortValue: (r) => r.round,
                cell: (r) => (r.auctionId ? <Link to={`/auctions/${r.auctionId}`} className="font-medium hover:underline">#{r.round} · {r.title}</Link> : `#${r.round} · ${r.title}`),
              },
              { key: 'at', header: 'Tanggal', cell: (r) => formatDate(r.at) },
              { key: 'open', header: 'Opening', align: 'right', cell: (r) => formatIdr(r.openingIdr) },
              { key: 'median', header: 'Median', align: 'right', cell: (r) => (r.medianIdr ? formatIdr(r.medianIdr) : '—') },
              { key: 'clear', header: 'Clearing', align: 'right', cell: (r) => (r.clearingIdr ? formatIdr(r.clearingIdr) : '—') },
              {
                key: 'settle', header: '', align: 'right',
                cell: (r) => r.auctionId && <Button size="sm" variant="outline" onClick={() => setDialog(`settle:${r.auctionId}`)}>Settlement</Button>,
              },
            ]}
          />
        ) : (
          <EmptyState icon={History} title="Belum ada round selesai" />
        )}
      </section>
      {dialog === 'new' && canRun(d.market.status) && <NewRoundDialog d={d} onClose={() => setDialog('')} />}
      {dialog.startsWith('settle:') && <SettlementDialog marketId={d.market.id} auctionId={dialog.slice(7)} onClose={() => setDialog('')} />}
    </div>
  )
}

// ── Rules ────────────────────────────────────────────────────────

function RulesEditor({ d, onDone }: { d: MmMarketOps; onDone: () => void }) {
  const latest = d.ruleVersions[d.ruleVersions.length - 1]
  const unit = d.market.priceRange.unit
  const save = useSaveRules(d.market.id)
  const [rules, setRules] = useState<MarketRules>(latest.rules)
  const [reason, setReason] = useState('')
  const errors = validateRules(rules)
  const changes = diffRules(latest.rules, rules, unit)
  return (
    <section aria-labelledby="edit-rules" className="rounded-xl border bg-card p-4 md:p-5">
      <h3 id="edit-rules" className="font-medium">Versi baru (v{d.ruleVersions.length + 1})</h3>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">Berlaku mulai round {d.currentRound + 1}. Round yang sedang/sudah berjalan tetap memakai aturannya.</p>
      <RulesFields value={rules} onChange={setRules} unit={unit} errors={errors} serverError={save.error} />
      <div className="mt-5"><Field label="Catatan perubahan (opsional)" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="mt-5 rounded-lg bg-muted p-3">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sebelum → sesudah (vs v{latest.version})</p>
        <Diff changes={changes} />
      </div>
      <FormError error={save.error} />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Batal</Button>
        <ConfirmDialog
          trigger={<Button disabled={!changes.length || Object.keys(errors).length > 0}>Simpan sebagai v{d.ruleVersions.length + 1}</Button>}
          title={`Simpan aturan v${d.ruleVersions.length + 1}?`}
          description={`Berlaku mulai round ${d.currentRound + 1}; participant aktif mendapat notifikasi.`}
          impact={<Diff changes={changes} />}
          confirmLabel="Simpan versi"
          onConfirm={() => save.mutateAsync({ rules, reason }).then(() => { toast({ title: `Aturan v${d.ruleVersions.length + 1} disimpan`, tone: 'green' }); onDone() })}
        />
      </div>
    </section>
  )
}

function Rules({ d }: { d: MmMarketOps }) {
  const [edit, setEdit] = useParam('edit')
  const unit = d.market.priceRange.unit
  const active = activeVersion(d.ruleVersions, d.currentRound)
  const pending = pendingVersion(d.ruleVersions, d.currentRound)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="rules-active" className="rounded-xl border bg-card p-4 md:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 id="rules-active" className="font-medium">Aturan aktif · v{active.version}</h3>
              <p className="text-xs text-muted-foreground">Read-only. Berlaku sejak round {active.effectiveFromRound}.</p>
            </div>
            {!edit && d.market.status !== 'closed' && <Button size="sm" variant="outline" onClick={() => setEdit('1')}><Pencil /> Ubah aturan</Button>}
          </div>
          <div className="mt-3"><RulesList rules={rulesToLabeled(active.rules, unit)} /></div>
        </section>
        <section aria-labelledby="rules-pending" className="rounded-xl border bg-card p-4 md:p-5">
          <h3 id="rules-pending" className="font-medium">{pending ? `Menunggu round ${pending.effectiveFromRound} · v${pending.version}` : 'Tidak ada versi tertunda'}</h3>
          {pending ? (
            <>
              <p className="mb-3 text-xs text-muted-foreground">Oleh {pending.author}, {formatRelative(pending.createdAt)}</p>
              <Diff changes={diffRules(active.rules, pending.rules, unit)} />
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Perubahan aturan selalu jadi versi baru yang berlaku mulai round berikutnya.</p>
          )}
        </section>
      </div>
      {edit && d.market.status !== 'closed' && <RulesEditor d={d} onDone={() => setEdit('')} />}
      <section aria-labelledby="rules-history">
        <h3 id="rules-history" className="mb-3 font-medium">Riwayat versi</h3>
        <ol className="flex flex-col gap-3">
          {[...d.ruleVersions].reverse().map((v) => {
            const prev = d.ruleVersions.find((x) => x.version === v.version - 1)
            return (
              <li key={v.version} className="rounded-xl border bg-card p-4">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">v{v.version}</span>
                  {v.version === active.version && <Tag tone="green">Aktif</Tag>}
                  {v.version === pending?.version && <Tag tone="yellow">Tertunda</Tag>}
                  <span className="text-muted-foreground">berlaku mulai round {v.effectiveFromRound} · {v.author} · {formatDateTime(v.createdAt)}</span>
                </p>
                {v.reason && <p className="mt-1 text-xs text-muted-foreground">Catatan: {v.reason}</p>}
                <div className="mt-2">{prev ? <Diff changes={diffRules(prev.rules, v.rules, unit)} /> : <p className="text-sm text-muted-foreground">Versi awal.</p>}</div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

// ── Governance ───────────────────────────────────────────────────

function DisputeRow({ marketId, x }: { marketId: string; x: MmDispute }) {
  const act = useDisputeAction(marketId)
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{x.title} <StatusBadge entity="dispute" status={x.status} />{x.escalatedTo && <Tag tone="purple">Ditangani admin</Tag>}</p>
        <p className="text-xs text-muted-foreground">{x.parties} · dibuka {formatRelative(x.openedAt)}</p>
        {x.resolution && <p className="mt-1 text-xs">Keputusan: {x.resolution}</p>}
      </div>
      {x.status !== 'resolved' && !x.escalatedTo && (
        <div className="flex shrink-0 gap-1">
          <ReasonConfirm
            trigger={<Button size="xs" variant="ghost">Eskalasi ke admin</Button>}
            title={`Eskalasi ke admin: ${x.title}`}
            impact={<>Kasus pindah ke antrean dispute admin governance (bisa refund, freeze, atau suspend). Kamu tidak bisa memutuskannya lagi, tapi statusnya tetap terlihat di sini.</>}
            label="Alasan eskalasi"
            field="note"
            confirmLabel="Eskalasi"
            error={act.error}
            onConfirm={(note) => act.mutateAsync({ id: x.id, action: 'escalate', note }).then(() => toast({ title: 'Dispute dieskalasi ke admin', tone: 'green' }))}
          />
          {x.status !== 'review' && <Button size="xs" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: x.id, action: 'review' })}>Mulai review</Button>}
          <ReasonConfirm
            trigger={<Button size="xs">Putuskan</Button>}
            title={`Putuskan dispute: ${x.title}`}
            impact={<>Keputusan dikirim ke {x.parties} dan tercatat di audit log. Hasil round yang tercatat tidak berubah.</>}
            label="Keputusan"
            field="note"
            confirmLabel="Simpan keputusan"
            error={act.error}
            onConfirm={(note) => act.mutateAsync({ id: x.id, action: 'resolve', note }).then(() => toast({ title: 'Dispute diselesaikan', tone: 'green' }))}
          />
        </div>
      )}
    </li>
  )
}

function Governance({ d }: { d: MmMarketOps }) {
  const m = d.market
  const status = useMarketStatus(m.id)
  const live = d.rounds.filter((a) => isLive(a.status)).length
  const people = `${formatNumber(m.buyers + m.suppliers)} participant`
  const run = (action: 'pause' | 'resume' | 'close') => (reason: string) =>
    status.mutateAsync({ action, reason }).then(() => toast({ title: { pause: 'Market di-pause', resume: 'Market dilanjutkan', close: 'Market ditutup' }[action], tone: action === 'resume' ? 'green' : 'orange' }))
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Status market">
        <p className="flex items-center gap-2 text-sm">Sekarang <StatusBadge entity="market" status={m.status} /></p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(m.status === 'active' || m.status === 'formation') && (
            <ReasonConfirm
              trigger={<Button variant="outline" className="h-9"><Pause /> Pause market</Button>}
              title={`Pause ${m.name}?`}
              impact={<ul className="list-disc space-y-1 pl-4"><li>Tidak ada round baru sampai dilanjutkan</li><li>{live} round live tetap berjalan sampai selesai</li><li>{people} menerima notifikasi berisi alasanmu</li></ul>}
              confirmLabel="Pause market"
              error={status.error}
              onConfirm={run('pause')}
            />
          )}
          {m.status === 'paused' && (
            <ReasonConfirm
              trigger={<Button className="h-9"><Play /> Lanjutkan market</Button>}
              title={`Lanjutkan ${m.name}?`}
              impact={<>Market kembali Active dan round baru bisa dibuka. {people} menerima notifikasi.</>}
              confirmLabel="Lanjutkan"
              error={status.error}
              onConfirm={run('resume')}
            />
          )}
          {m.status !== 'closed' && m.status !== 'suspended' && (
            <ReasonConfirm
              trigger={<Button variant="destructive" className="h-9"><XCircle /> Tutup market</Button>}
              title={`Tutup ${m.name} permanen?`}
              impact={<ul className="list-disc space-y-1 pl-4"><li>Market tidak bisa dibuka lagi</li><li>{live} round live tetap selesai; hasilnya tetap tercatat</li><li>Aturan dan riwayat tetap bisa diaudit</li><li>{people} menerima notifikasi berisi alasanmu</li></ul>}
              confirmLabel="Tutup market"
              destructive
              error={status.error}
              onConfirm={run('close')}
            />
          )}
          {m.status === 'closed' && <p className="text-sm text-muted-foreground">Market sudah ditutup. Riwayat tetap tersedia di Audit log.</p>}
        </div>
      </Panel>
      <section aria-labelledby="disputes">
        <h3 id="disputes" className="mb-3 font-medium">Dispute di market ini</h3>
        {d.disputes.length ? (
          <ul className="divide-y rounded-xl border bg-card">{d.disputes.map((x) => <DisputeRow key={x.id} marketId={m.id} x={x} />)}</ul>
        ) : (
          <EmptyState icon={Scale} title="Tidak ada dispute" description="Dispute antar participant di market ini muncul di sini untuk dimoderasi." />
        )}
      </section>
    </div>
  )
}

function Audit({ marketId }: { marketId: string }) {
  const query = useMarketAudit(marketId)
  return (
    <AsyncView query={query} skeleton={<Skeleton className="h-48 rounded-xl" />}>
      {(entries) => <AuditLog entries={entries} />}
    </AsyncView>
  )
}

// ── Page ─────────────────────────────────────────────────────────

export function MarketOpsPage() {
  const { id = '' } = useParams()
  const query = useMmMarket(id)
  const [tabParam, setTab] = useParam('tab')
  const tab: TabId = tabParam in TABS ? (tabParam as TabId) : 'overview'
  return (
    <>
      <Link to="/mm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Operations
      </Link>
      <AsyncView query={query} skeleton={<Skeleton className="mt-4 h-96 rounded-xl" />}>
        {(d) => (
          <>
            <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {d.market.code} <CategoryTag id={d.market.categoryId} /> <StatusBadge entity="market" status={d.market.status} />
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{d.market.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{MECHANISMS[d.market.mechanism].label} · {d.market.region} · round ke-{d.currentRound}</p>
              </div>
              <Button variant="outline" className="h-9" render={<Link to={`/markets/${d.market.id}`} />}><ExternalLink /> Halaman publik</Button>
            </header>
            <Tabs value={tab} onValueChange={(v) => setTab(v === 'overview' ? '' : String(v))} className="mt-6">
              <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
                <TabsList>
                  {(Object.keys(TABS) as TabId[]).map((t) => (
                    <TabsTrigger key={t} value={t} className="px-3">
                      {TABS[t]}
                      {t === 'participants' && d.participants.some((p) => p.status === 'pending') && <span className="size-1.5 rounded-full bg-primary" aria-label="ada yang menunggu" />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="mt-4">
                <h2 className="sr-only">{TABS[tab]}</h2>
                {tab === 'overview' && <Overview d={d} go={setTab} />}
                {tab === 'participants' && <Participants d={d} />}
                {tab === 'rounds' && <Rounds d={d} />}
                {tab === 'rules' && <Rules d={d} />}
                {tab === 'governance' && <Governance d={d} />}
                {tab === 'analytics' && <MarketAnalytics marketId={d.market.id} />}
                {tab === 'audit' && <Audit marketId={d.market.id} />}
              </div>
            </Tabs>
          </>
        )}
      </AsyncView>
    </>
  )
}
