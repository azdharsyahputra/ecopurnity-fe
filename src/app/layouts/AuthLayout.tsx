import { Outlet } from 'react-router-dom'
import { Activity, ArrowUpRight, ShieldCheck, Store, Users, Wallet } from 'lucide-react'
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
    <div className="relative hidden min-h-svh overflow-hidden bg-linear-to-br from-[#07566b] via-[#087e94] to-[#2f6fe0] p-12 text-white dark:from-[#102e3b] dark:via-[#124452] dark:to-[#273d79] lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="pointer-events-none absolute -right-32 -top-24 size-[34rem] rounded-full border border-white/10" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-10 size-[27rem] rounded-full border border-white/10" aria-hidden />
      <div className="pointer-events-none absolute -right-12 top-20 size-72 rounded-full bg-cyan-200/20 blur-3xl" aria-hidden />
      <div className="relative flex items-center gap-2 text-sm font-medium text-white/85"><ShieldCheck className="size-4" /> Ekonomi yang terbuka dan terhubung</div>
      <div className="relative max-w-xl">
      <p className="text-xs font-semibold tracking-[0.2em] text-white/75">LIVE ECONOMY</p>
      <h2 className="mt-3 max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Find markets that don't exist yet.</h2>
      <p className="mt-4 max-w-md text-base leading-relaxed text-white/75">Temukan peluang dari supply, demand, dan jaringan pelaku usaha yang bergerak bersama.</p>
      <dl className="mt-10 grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <dt className="flex items-center gap-1.5 text-sm text-white/80">
              <r.icon className="size-4" /> {r.label}
            </dt>
            <dd className="num mt-2 text-2xl font-semibold">{r.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      </div>
      <div className="relative flex items-center justify-between text-xs text-white/70"><span>Data jaringan Ecopurnity</span><span className="inline-flex items-center gap-1">Lihat peluang <ArrowUpRight className="size-3.5" /></span></div>
    </div>
  )
}

export function AuthLayout() {
  return (
    <div className="grid min-h-svh bg-muted/30 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative flex flex-col p-4 sm:p-6 md:p-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center py-8 sm:py-10">
          <div className="w-full max-w-md rounded-3xl border bg-card p-5 shadow-xl shadow-foreground/[0.035] sm:p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <LivePanel />
    </div>
  )
}
