import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Building2, Clock, FileCheck2, Gavel, MapPin, PackageOpen, ShieldAlert, Store } from 'lucide-react'
import { formatDate, formatIdr, formatNumber, formatQty, formatRelative } from '@/domain/format'
import { ApiError } from '@/lib/api'
import { scoreBand, useBusinessProfile, usePublicProfile } from './hooks'
import type { ProfileActivity, ProfileReputation } from './types'
import { AuctionCard, CardGrid, CategoryTag, MarketCard } from '@/features/economy/components'
import { AsyncView, EmptyState } from '@/components/States'
import { Tag } from '@/components/Tag'
import { EntityAvatar } from '@/components/EntityAvatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 md:px-6">{children}</div>
}

const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404

function NotFoundProfile({ what }: { what: string }) {
  return <EmptyState title={`${what} tidak ditemukan`} description="Link-nya mungkin salah atau akun sudah tidak aktif." action={<Button render={<Link to="/explore" />}>Jelajahi ekonomi</Button>} />
}

function ReputationCard({ r }: { r: ProfileReputation }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-medium">Reputasi</h2>
      <p className="mt-2 flex items-baseline gap-2"><span className="num text-3xl font-semibold">{r.score}</span><span className="text-sm text-muted-foreground">/ 100 · {scoreBand(r.score)}</span></p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {([['Transaksi', r.counts.transactions], ['Berhasil', r.counts.successful], ['Dispute', r.counts.disputes], ['Dibatalkan', r.counts.cancelled]] as const).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="num font-semibold">{formatNumber(v)}</dd></div>
        ))}
      </dl>
    </section>
  )
}

function Activity({ items }: { items: ProfileActivity[] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-medium">Aktivitas publik terbaru</h2>
      {items.length ? (
        <ol className="mt-2 divide-y">
          {items.map((a) => (
            <li key={a.id} className="py-2.5 text-sm">
              <p>{a.title}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {formatRelative(a.at)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada aktivitas publik.</p>
      )}
    </section>
  )
}

export function ParticipantProfilePage() {
  const { username = '' } = useParams()
  const query = usePublicProfile(username)
  if (isNotFound(query.error)) return <Shell><NotFoundProfile what="Profil" /></Shell>
  return (
    <Shell>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(p) => (
          <>
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <EntityAvatar name={p.name} verified={p.verification.identity === 'verified'} size={64} />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{p.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>@{p.username}</span>
                  {p.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {p.location}</span>}
                  {p.joinedAt && <span>Bergabung {formatDate(p.joinedAt)}</span>}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Verifikasi">
                  {p.verification.identity === 'verified' && <li><Tag tone="teal"><BadgeCheck className="size-3" /> Identitas terverifikasi</Tag></li>}
                  {p.verification.email && <li><Tag>Email terverifikasi</Tag></li>}
                  {p.verification.phone && <li><Tag>Telepon terverifikasi</Tag></li>}
                </ul>
              </div>
            </header>
            {p.status !== 'active' && (
              <p className="mt-4 flex items-center gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
                <ShieldAlert className="size-4 shrink-0" /> Akun ini sedang {p.status === 'suspended' ? 'ditangguhkan' : 'dibatasi'} oleh Admin. Bertransaksi dengan hati-hati.
              </p>
            )}
            {p.bio && <p className="mt-4 max-w-2xl text-sm">{p.bio}</p>}

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section>
                  <h2 className="mb-3 font-medium">Supply aktif</h2>
                  {p.supply.length ? (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {p.supply.map((s) => (
                        <li key={s.id} className="rounded-xl border bg-card p-4">
                          <CategoryTag id={s.categoryId} />
                          <p className="mt-2 font-medium">{s.item}</p>
                          <p className="num mt-1 text-sm text-muted-foreground">{formatQty(s.quantity)} · {formatIdr(s.priceIdr)}/{s.quantity.unit}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyState icon={PackageOpen} title="Belum ada supply aktif" />}
                </section>
                <section>
                  <h2 className="mb-3 font-medium">Market yang diikuti</h2>
                  {p.markets.length ? (
                    <ul className="flex flex-col gap-2">
                      {p.markets.map((m) => (
                        <li key={m.id}>
                          <Link to={`/markets/${m.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-hover">
                            <Store className="size-4 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                            <span className="hidden text-xs text-muted-foreground sm:inline">{m.region}</span>
                            <CategoryTag id={m.categoryId} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyState icon={Store} title="Belum mengikuti market" />}
                </section>
              </div>
              <div className="flex flex-col gap-6">
                <ReputationCard r={p.reputation} />
                {p.orgs.length > 0 && (
                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="font-medium">Bisnis</h2>
                    <ul className="mt-2 flex flex-col gap-2 text-sm">
                      {p.orgs.map((o) => (
                        <li key={o.slug}><Link to={`/b/${o.slug}`} className="inline-flex items-center gap-2 hover:underline"><EntityAvatar name={o.name} kind="business" size={22} /> {o.name}</Link></li>
                      ))}
                    </ul>
                  </section>
                )}
                <Activity items={p.activity} />
              </div>
            </div>
          </>
        )}
      </AsyncView>
    </Shell>
  )
}

export function BusinessProfilePage() {
  const { slug = '' } = useParams()
  const query = useBusinessProfile(slug)
  if (isNotFound(query.error)) return <Shell><NotFoundProfile what="Profil bisnis" /></Shell>
  return (
    <Shell>
      <AsyncView query={query} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {(b) => (
          <>
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <EntityAvatar name={b.name} kind="business" verified={b.verified} size={64} />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{b.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" /> Bisnis</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {b.region}</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Verifikasi">
                  {b.verified ? (
                    <>
                      <li><Tag tone="teal"><BadgeCheck className="size-3" /> Bisnis terverifikasi</Tag></li>
                      {b.documents.map((d) => <li key={d}><Tag><FileCheck2 className="size-3" /> {d}</Tag></li>)}
                    </>
                  ) : <li><Tag>Belum terverifikasi</Tag></li>}
                </ul>
              </div>
            </header>
            <p className="mt-4 max-w-2xl text-sm">{b.description}</p>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section>
                  <h2 className="mb-3 font-medium">Market</h2>
                  {b.markets.length ? <CardGrid className="lg:grid-cols-2">{b.markets.map((m) => <MarketCard key={m.id} m={m} />)}</CardGrid> : <EmptyState icon={Store} title="Belum mengoperasikan market" />}
                </section>
                {b.auctions.length > 0 && (
                  <section>
                    <h2 className="mb-3 flex items-center gap-2 font-medium"><Gavel className="size-4" /> Auction</h2>
                    <CardGrid className="lg:grid-cols-2">{b.auctions.map((a) => <AuctionCard key={a.id} a={a} />)}</CardGrid>
                  </section>
                )}
              </div>
              <div className="flex flex-col gap-6">
                <ReputationCard r={b.reputation} />
                <Activity items={b.activity} />
              </div>
            </div>
          </>
        )}
      </AsyncView>
    </Shell>
  )
}
