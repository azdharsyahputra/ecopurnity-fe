import { useState, type ReactNode } from 'react'
import { Gavel, Palette, Sparkles, Store, Wallet } from 'lucide-react'
import { STATUS, type Entity, type StatusOf, type Tone } from '@/domain/status'
import { formatIdr } from '@/domain/format'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { StatusBadge, Tag } from '@/components/Tag'
import { IconChip } from '@/components/IconChip'
import { EmptyState, ErrorState } from '@/components/States'
import { Countdown } from '@/components/Countdown'
import { EntityAvatar } from '@/components/EntityAvatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ActivityFeed } from '@/components/ActivityFeed'
import { useAuthGate } from '@/features/auth/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const TONES: Tone[] = ['gray', 'teal', 'blue', 'green', 'lime', 'yellow', 'orange', 'red', 'purple', 'pink']
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-8">
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Living reference for the design system (PRD §5). Every core component in both themes. */
export function UiShowcase() {
  const gate = useAuthGate()
  const [volume, setVolume] = useState(8_400_000_000)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <PageHeader
        title="Design system"
        description="Komponen inti Ecopurnity. Toggle tema di header untuk cek light dan dark."
        icon={Palette}
        tone="purple"
        actions={<Button variant="outline" onClick={() => setVolume((v) => v + 120_000_000)}>Simulasi update live</Button>}
      />

      <Section title="Tones · Tag · IconChip">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <Tag key={t} tone={t}>{t}</Tag>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TONES.map((t) => (
            <IconChip key={t} icon={Sparkles} tone={t} />
          ))}
        </div>
      </Section>

      <Section title="Status badge · semua state machine">
        <div className="flex flex-col gap-3">
          {(Object.keys(STATUS) as Entity[]).map((entity) => (
            <div key={entity} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm text-muted-foreground">{entity}</span>
              {Object.keys(STATUS[entity]).map((s) => (
                <StatusBadge key={s} entity={entity} status={s as StatusOf<typeof entity>} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Stat tile">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Volume transaksi" icon={Wallet} tone="purple" value={formatIdr(volume, { compact: true })} delta={0.124} />
          <StatTile label="Market aktif" icon={Store} tone="blue" value="342" delta={-0.032} hint="vs 30 hari lalu" />
          <StatTile label="Auction live" icon={Gavel} tone="lime" value="27" />
          <StatTile label="Memuat" loading value={undefined} />
        </div>
      </Section>

      <Section title="Buttons · input">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <Input placeholder="Cari market, opportunity…" className="mt-4 h-10 max-w-sm" />
      </Section>

      <Section title="Countdown · avatar">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span>2 hari lagi: <Countdown to={inMinutes(2 * 24 * 60 + 5)} /></span>
          <span>&lt; 1 jam (urgent): <Countdown to={inMinutes(42)} /></span>
          <span>Lewat: <Countdown to={ago(5)} /></span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <EntityAvatar name="Rina Wulandari" verified />
          <EntityAvatar name="PT Solusi Kemasan Nusantara" kind="business" verified size={40} />
          <EntityAvatar name="Koperasi Kopi Jabar" kind="business" />
          <EntityAvatar name="Dimas Haryanto" size={24} />
        </div>
      </Section>

      <Section title="Dialog · auth gate">
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button>Submit bid</Button>}
            title="Kirim bid Rp 1.750/unit?"
            description="Bid mengikat sampai auction ditutup."
            impact={
              <ul className="list-disc space-y-1 pl-4">
                <li>Total komitmen: <b>{formatIdr(175_000_000)}</b> untuk 100.000 unit</li>
                <li>Posisi saat ini: peringkat 2 dari 9</li>
                <li>Bisa di-update, tidak bisa ditarik setelah 30 menit terakhir</li>
              </ul>
            }
            confirmLabel="Kirim bid"
            onConfirm={() => new Promise((r) => setTimeout(r, 800))}
          />
          <ConfirmDialog
            trigger={<Button variant="destructive">Freeze auction</Button>}
            title="Freeze auction #A-2291?"
            impact="Semua bid dibekukan dan 9 peserta diberi notifikasi. Tercatat di audit trail."
            confirmLabel="Freeze"
            destructive
            onConfirm={() => undefined}
          />
          <Button variant="outline" onClick={() => gate('ikut opportunity ini', () => alert('Sudah login, aksi jalan'))}>
            Join opportunity (auth gate)
          </Button>
        </div>
      </Section>

      <Section title="Activity feed">
        <div className="max-w-lg rounded-xl border px-4">
          <ActivityFeed
            events={[
              { id: '1', type: 'auction_started', title: 'Reverse auction dimulai: 100.000 box karton', amountIdr: 180_000_000, at: ago(1) },
              { id: '2', type: 'bid_placed', title: 'Bid baru di auction Beras Medium Karawang', amountIdr: 45_000_000, at: ago(12) },
              { id: '3', type: 'transaction_completed', title: 'Transaksi selesai: 500 kg biji kopi', at: ago(90) },
            ]}
          />
        </div>
      </Section>

      <Section title="Loading · empty · error">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24" />
          </div>
          <EmptyState
            icon={Store}
            tone="teal"
            title="Belum ada supply"
            description="Daftarkan yang kamu punya supaya sistem bisa mencarikan market."
            action={<Button>Tambah supply</Button>}
          />
          <ErrorState error={new Error('Server tidak merespons (503)')} onRetry={() => undefined} />
        </div>
      </Section>
    </div>
  )
}
