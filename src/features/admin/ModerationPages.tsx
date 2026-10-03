import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Flag, Gavel, Lock, Scale, ShieldAlert, Store } from 'lucide-react'
import { AUCTION_TYPES } from '@/domain/catalog'
import { formatDateTime, formatIdr, formatNumber, formatRelative } from '@/domain/format'
import { toast } from '@/stores/toast'
import { slugify } from '@/features/reputation/slug'
import { auctionPriceLabel } from '@/features/economy/utils'
import { useAdminAction, useAdminAuction, useAdminAuctions, useAdminMarket, useAdminMarkets } from './hooks'
import { ALERT_TYPE, SEVERITY } from './labels'
import type { AdminAuction, AlertType, Finding } from './types'
import { BackLink, Facts, Panel, ReasonDialog } from './components'
import { PageHeader } from '@/components/PageHeader'
import { AsyncView, EmptyState } from '@/components/States'
import { StatusBadge, Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { DataTable } from '@/components/DataTable'
import { AuditLog } from '@/components/AuditLog'
import { SelectField } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <p className="text-sm text-muted-foreground">Tidak ada temuan pelanggaran aturan.</p>
  return (
    <ul className="flex flex-col gap-2">
      {findings.map((f) => (
        <li key={f.id} className="rounded-lg border p-3 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">{f.rule} <Tag tone={SEVERITY[f.severity][1]}>{SEVERITY[f.severity][0]}</Tag></p>
          <p className="mt-1 text-muted-foreground">{f.detail}</p>
        </li>
      ))}
    </ul>
  )
}

function FindingsTag({ a }: { a: AdminAuction }) {
  if (!a.findings.length) return <span className="text-muted-foreground">–</span>
  const worst = (['high', 'medium', 'low'] as const).find((s) => a.findings.some((f) => f.severity === s))!
  return <Tag tone={SEVERITY[worst][1]}>{a.findings.length} temuan</Tag>
}

// ── Markets ──────────────────────────────────────────────────────

export function AdminMarketsPage() {
  const query = useAdminMarkets()
  return (
    <>
      <PageHeader title="Market moderation" description="Flag dari sistem dan laporan pengguna. Review, beri flag, atau suspend market dengan alasan tertulis." icon={Store} tone="orange" />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} empty={<EmptyState icon={Store} title="Belum ada market" />}>
        {(rows) => (
          <DataTable
            caption="Market"
            rows={rows}
            rowKey={(m) => m.id}
            rowHref={(m) => `/admin/markets/${m.id}`}
            initialSort={{ key: 'flags', dir: 'desc' }}
            columns={[
              { key: 'name', header: 'Market', primary: true, cell: (m) => <span>{m.name} <span className="text-xs font-normal text-muted-foreground">{m.code}</span></span> },
              { key: 'maker', header: 'Market maker', cell: (m) => m.maker.name },
              { key: 'status', header: 'Status', cell: (m) => <StatusBadge entity="market" status={m.status} /> },
              { key: 'flags', header: 'Flag', align: 'right', cell: (m) => (m.flags.length ? <Tag tone="red">{m.flags.length}</Tag> : '–'), sortValue: (m) => m.flags.length * 10 + m.reports.length },
              { key: 'reports', header: 'Laporan', align: 'right', cell: (m) => m.reports.length || '–', sortValue: (m) => m.reports.length },
              { key: 'disputes', header: 'Dispute', align: 'right', cell: (m) => m.disputes || '–', sortValue: (m) => m.disputes },
            ]}
          />
        )}
      </AsyncView>
    </>
  )
}

export function AdminMarketDetailPage() {
  const { id = '' } = useParams()
  const query = useAdminMarket(id)
  const act = useAdminAction(`markets/${id}`)
  return (
    <>
      <BackLink to="/admin/markets">Markets</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(m) => (
          <>
            <PageHeader
              title={m.name}
              description={<span className="flex flex-wrap items-center gap-1.5">{m.code} <StatusBadge entity="market" status={m.status} />{m.reviewedAt && <Tag tone="teal">Direview {formatRelative(m.reviewedAt)}</Tag>}</span>}
              actions={
                <>
                  <ReasonDialog action={act} name="review" label="Tandai direview" reasonOptional reasonLabel="Catatan review" title="Tandai market sudah direview" confirmLabel="Simpan review"
                    impact="Flag dan laporan saat ini dianggap sudah diperiksa; market keluar dari antrean sampai ada flag baru."
                    body={(reason) => ({ action: 'review', reason })} onDone={() => toast({ title: 'Market ditandai direview', tone: 'green' })} />
                  <ReasonDialog action={act} name="flag" label={<><Flag /> Flag</>} title="Beri flag pada market" confirmLabel="Tambah flag" reasonLabel="Isi flag"
                    impact="Flag terlihat oleh admin lain dan market maker; market tetap berjalan."
                    body={(reason) => ({ action: 'flag', reason })} onDone={() => toast({ title: 'Flag ditambahkan' })} />
                  {m.status === 'suspended' ? (
                    <ReasonDialog action={act} name="restore" label="Pulihkan" variant="default" title={`Pulihkan ${m.name}?`} confirmLabel="Pulihkan market"
                      impact="Market kembali aktif dan bisa menerima listing, order, dan auction baru."
                      body={(reason) => ({ action: 'restore', reason })} onDone={() => toast({ title: 'Market dipulihkan', tone: 'green' })} />
                  ) : (
                    <ReasonDialog action={act} name="suspend" label="Suspend market" destructive title={`Suspend ${m.name}?`} confirmLabel="Suspend market"
                      impact={<ul className="list-disc pl-4"><li>{m.buyers} pembeli dan {m.suppliers} supplier tidak bisa membuat order atau auction baru</li><li>{m.activeAuctions} auction live tetap berjalan; bekukan satu per satu bila perlu</li><li>Transaksi berjalan dan escrow tidak berubah</li></ul>}
                      body={(reason) => ({ action: 'suspend', reason })} onDone={() => toast({ title: 'Market disuspend', body: m.name })} />
                  )}
                </>
              }
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <Panel title="Ringkasan">
                  <Facts items={[
                    ['Market maker', <Link key="m" to={`/b/${slugify(m.maker.name)}`} className="inline-flex items-center gap-1.5 hover:underline"><EntityAvatar name={m.maker.name} kind="business" verified={m.maker.verified} size={18} /> {m.maker.name}</Link>],
                    ['Wilayah', m.region], ['Peserta', `${formatNumber(m.buyers)} pembeli · ${formatNumber(m.suppliers)} supplier`],
                    ['Volume 30 hari', formatIdr(m.volume30dIdr, { compact: true })],
                    ['Rentang harga', `${formatIdr(m.priceRange.minIdr)} – ${formatIdr(m.priceRange.maxIdr)} / ${m.priceRange.unit}`],
                  ]} />
                  <Link to={`/markets/${m.id}`} className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">Halaman publik <ExternalLink className="size-3.5" /></Link>
                </Panel>
                <Panel title={`Flag (${m.flags.length})`}>
                  {m.flags.length ? (
                    <ul className="flex flex-col gap-2">
                      {m.flags.map((f) => (
                        <li key={f.id} className="rounded-lg border p-3 text-sm">
                          <p>{f.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{f.by === 'Sistem' ? 'Rekomendasi sistem' : f.by} · {formatRelative(f.at)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">Belum ada flag.</p>}
                </Panel>
                <Panel title={`Laporan pengguna (${m.reports.length})`}>
                  {m.reports.length ? (
                    <ul className="flex flex-col gap-2">
                      {m.reports.map((r) => (
                        <li key={r.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{r.reporter}</p><p className="mt-1">{r.reason}</p><p className="mt-1 text-xs text-muted-foreground">{formatRelative(r.at)}</p></li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">Belum ada laporan.</p>}
                </Panel>
                <section className="min-w-0">
                  <h2 className="mb-3 font-medium">Auction di market ini</h2>
                  {m.auctions.length ? (
                    <DataTable caption="Auction di market" rows={m.auctions} rowKey={(a) => a.id} rowHref={(a) => `/admin/auctions/${a.id}`}
                      columns={[
                        { key: 't', header: 'Auction', primary: true, cell: (a) => a.title },
                        { key: 's', header: 'Status', cell: (a) => <StatusBadge entity="auction" status={a.status} /> },
                        { key: 'f', header: 'Temuan', cell: (a) => <FindingsTag a={a} /> },
                      ]} />
                  ) : <EmptyState icon={Gavel} title="Belum ada auction" />}
                </section>
              </div>
              <div className="flex flex-col gap-6">
                <Panel title="Dispute">
                  <p className="text-sm text-muted-foreground">{m.disputes ? `${m.disputes} dispute terbuka terkait market ini.` : 'Tidak ada dispute terbuka.'}</p>
                  <Button variant="outline" className="mt-3 h-9" render={<Link to={`/admin/disputes?market=${m.id}`} />}><Scale /> Investigasi dispute</Button>
                </Panel>
                <Panel title="Aktivitas admin"><AuditLog entries={m.audit} /></Panel>
              </div>
            </div>
          </>
        )}
      </AsyncView>
    </>
  )
}

// ── Auctions ─────────────────────────────────────────────────────

export function AdminAuctionsPage() {
  const query = useAdminAuctions()
  return (
    <>
      <PageHeader title="Auction governance" description="Periksa semua bid (sealed bid baru terbuka setelah ditutup), temuan pelanggaran aturan, dan bekukan auction yang mencurigakan." icon={Gavel} tone="orange" />
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />} empty={<EmptyState icon={Gavel} title="Belum ada auction" />}>
        {(rows) => (
          <DataTable
            caption="Auction"
            rows={rows}
            rowKey={(a) => a.id}
            rowHref={(a) => `/admin/auctions/${a.id}`}
            initialSort={{ key: 'findings', dir: 'desc' }}
            columns={[
              { key: 'title', header: 'Auction', primary: true, cell: (a) => <span>{a.title} <span className="text-xs font-normal text-muted-foreground">{a.code}</span></span> },
              { key: 'market', header: 'Market', cell: (a) => a.marketName },
              { key: 'type', header: 'Tipe', cell: (a) => AUCTION_TYPES[a.type].label },
              { key: 'status', header: 'Status', cell: (a) => <StatusBadge entity="auction" status={a.status} /> },
              { key: 'bids', header: 'Bid', align: 'right', cell: (a) => formatNumber(a.bidCount), sortValue: (a) => a.bidCount },
              { key: 'findings', header: 'Temuan', cell: (a) => <FindingsTag a={a} />, sortValue: (a) => a.findings.length },
            ]}
          />
        )}
      </AsyncView>
    </>
  )
}

export function AdminAuctionDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useAdminAuction(id)
  const act = useAdminAction(`auctions/${id}`)
  const [type, setType] = useState<AlertType>('bid_manipulation')
  return (
    <>
      <BackLink to="/admin/auctions">Auctions</BackLink>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(a) => {
          const active = ['scheduled', 'qualification', 'live', 'extended'].includes(a.status)
          return (
            <>
              <PageHeader
                title={a.title}
                description={<span className="flex flex-wrap items-center gap-1.5">{a.code} · {a.marketName} <StatusBadge entity="auction" status={a.status} /> <Tag>{AUCTION_TYPES[a.type].label}</Tag></span>}
                actions={
                  <>
                    {a.caseId ? (
                      <Button variant="outline" className="h-9" render={<Link to={`/admin/fraud/${a.caseId}`} />}><ShieldAlert /> Lihat kasus</Button>
                    ) : (
                      <ReasonDialog action={act} name="case" label={<><ShieldAlert /> Buka kasus</>} title="Buka kasus investigasi" confirmLabel="Buka kasus" reasonLabel="Dugaan awal"
                        impact="Kasus manual dibuat di Fraud dengan temuan auction ini sebagai bukti awal. Tindakan lanjutan diambil dari layar kasus."
                        extra={
                          <SelectField label="Jenis dugaan" value={type} onChange={(e) => setType(e.target.value as AlertType)}>
                            {Object.entries(ALERT_TYPE).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                          </SelectField>
                        }
                        body={(reason) => ({ action: 'open_case', reason, type })}
                        onDone={(r) => { const caseId = (r as { caseId?: string }).caseId; if (caseId) navigate(`/admin/fraud/${caseId}`) }} />
                    )}
                    {a.status === 'frozen' ? (
                      <ReasonDialog action={act} name="unfreeze" label="Cabut freeze" variant="default" title="Cabut freeze auction?" confirmLabel="Cabut freeze"
                        impact="Auction kembali ke status sebelum dibekukan. Jika waktunya sudah habis, auction langsung tertutup."
                        body={(reason) => ({ action: 'unfreeze', reason })} onDone={() => toast({ title: 'Freeze dicabut', tone: 'green' })} />
                    ) : active && (
                      <ReasonDialog action={act} name="freeze" label={<><Lock /> Freeze</>} destructive title={`Bekukan ${a.code}?`} confirmLabel="Bekukan auction"
                        impact={<ul className="list-disc pl-4"><li>Bid baru ditolak dan hitung mundur berhenti untuk {formatNumber(a.participants)} peserta</li><li>Bid yang sudah masuk tidak diubah atau dihapus</li><li>Pemilik auction diberi tahu</li></ul>}
                        body={(reason) => ({ action: 'freeze', reason })} onDone={() => toast({ title: 'Auction dibekukan', body: a.title })} />
                    )}
                  </>
                }
              />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex min-w-0 flex-col gap-6">
                  <Panel title="Temuan pelanggaran aturan"><FindingList findings={a.findings} /></Panel>
                  <Panel title="Semua bid" action={<span className="text-xs text-muted-foreground">Identitas asli; peserta hanya melihat label samaran</span>}>
                    {a.bids === null ? (
                      <EmptyState icon={Lock} title={`${formatNumber(a.bidCount)} sealed bid tersegel`} description="Isi sealed bid baru bisa dibuka setelah auction ditutup, termasuk oleh Admin." className="py-8" />
                    ) : a.bids.length ? (
                      <DataTable caption="Ledger bid" rows={a.bids} rowKey={(b) => b.id} initialSort={{ key: 'at', dir: 'desc' }}
                        columns={[
                          { key: 'bidder', header: 'Bidder', primary: true, cell: (b) => <span>{b.bidder} <span className="text-xs font-normal text-muted-foreground">({b.masked})</span></span> },
                          { key: 'price', header: 'Harga', align: 'right', cell: (b) => formatIdr(b.priceIdr), sortValue: (b) => b.priceIdr },
                          { key: 'at', header: 'Waktu', cell: (b) => formatDateTime(b.at), sortValue: (b) => b.at },
                        ]} />
                    ) : <p className="text-sm text-muted-foreground">Belum ada bid.</p>}
                  </Panel>
                </div>
                <div className="flex flex-col gap-6">
                  <Panel title="Ringkasan">
                    <dl className="grid gap-3 text-sm">
                      {[
                        ['Harga pembuka', formatIdr(a.openingPriceIdr)], ['Harga publik', auctionPriceLabel(a)], ['Langkah minimum', formatIdr(a.minStepIdr)],
                        ['Peserta', formatNumber(a.participants)], ['Mulai', formatDateTime(a.startsAt)], ['Berakhir', formatDateTime(a.endsAt)],
                      ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>)}
                    </dl>
                    <Link to={`/auctions/${a.id}`} className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">Auction room publik <ExternalLink className="size-3.5" /></Link>
                  </Panel>
                  <Panel title="Aktivitas admin"><AuditLog entries={a.audit} /></Panel>
                </div>
              </div>
            </>
          )
        }}
      </AsyncView>
    </>
  )
}
