import { Outlet } from 'react-router-dom'
import { Activity, Store, Users, Wallet } from 'lucide-react'
import { usePublicStats } from '@/features/public/hooks'
import { formatIdr, formatNumber } from '@/domain/format'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

function LivePanel() {
  const { data: s } = usePublicStats()
  const rows = [
    { icon: Users, label: 'Participant aktif', value: s && formatNumber(s.activeParticipants) },
    { icon: Store, label: 'Market aktif', value: s && formatNumber(s.activeMarkets) },
    { icon: Activity, label: 'Opportunity terdeteksi', value: s && formatNumber(s.opportunitiesDetected) },
    { icon: Wallet, label: 'Volume transaksi', value: s && formatIdr(s.transactionVolumeIdr, { compact: true }) },
  ]
  return (
    <div className="relative hidden overflow-hidden bg-linear-to-br from-[#0a6f8c] to-brand-to p-12 text-white lg:flex lg:flex-col lg:justify-end">
      <div className="absolute -top-24 -right-24 size-72 rounded-full bg-lime/90 blur-3xl opacity-40" aria-hidden />
      <p className="text-sm font-medium tracking-wide text-white/80">LIVE ECONOMY</p>
      <h2 className="mt-2 max-w-sm text-3xl font-semibold tracking-tight">Find markets that don't exist yet.</h2>
      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="flex items-center gap-1.5 text-sm text-white/80">
              <r.icon className="size-4" /> {r.label}
            </dt>
            <dd className="num mt-1 text-2xl font-semibold">{r.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </main>
      </div>
      <LivePanel />
    </div>
  )
}
