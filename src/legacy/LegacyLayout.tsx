import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ecopurnityLogo from '@/assets/ecopurnity.png'
import {
  User, Zap, Network, Gavel, PieChart,
  Database, Package, ShieldCheck, Building2, Briefcase, Activity, Calculator
} from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

const NAV_GROUPS = [
  {
    label: 'Identity & Data',
    items: [
      { label: 'Economic Identity', path: '/legacy', icon: User, stage: 'DATA' },
      { label: 'Economic Registry', path: '/legacy/registry', icon: Database, stage: 'NEW DATA' },
    ],
  },
  {
    label: 'Market Intelligence',
    items: [
      { label: 'Macro Intelligence', path: '/legacy/intelligence', icon: Activity, stage: 'DISCOVERY' },
      { label: 'Opportunity Feed', path: '/legacy/opportunities', icon: Zap, stage: 'DISCOVERY' },
      { label: 'Opportunity Graph', path: '/legacy/graph', icon: Network, stage: 'OPPORTUNITY' },
      { label: 'Economic Simulator', path: '/legacy/simulation', icon: Calculator, stage: 'OPPORTUNITY' },
    ],
  },
  {
    label: 'Market Operations',
    items: [
      { label: 'Market & Auctions', path: '/legacy/auctions', icon: Gavel, stage: 'AUCTION' },
      { label: 'Smart Allocation', path: '/legacy/allocation', icon: PieChart, stage: 'ALLOCATION' },
    ],
  },
  {
    label: 'Settlement',
    items: [
      { label: 'Transactions', path: '/legacy/transactions', icon: Package, stage: 'TRANSACTION' },
      { label: 'Reputation', path: '/legacy/reputation', icon: ShieldCheck, stage: 'REPUTATION' },
    ],
  },
  {
    label: 'Role Dashboards',
    items: [
      { label: 'Business Center', path: '/legacy/business', icon: Building2, stage: 'MARKET FORMATION' },
      { label: 'Market Maker', path: '/legacy/market-maker', icon: Briefcase, stage: 'MARKET FORMATION' },
      { label: 'Platform Admin', path: '/legacy/admin', icon: ShieldCheck, stage: 'SYSTEM' },
    ],
  },
]

export default function DashboardLayout({ children }: LayoutProps) {
  const location = useLocation()
  const [activeRole, setActiveRole] = useState<'PARTICIPANT' | 'BUSINESS' | 'MARKET_MAKER' | 'PLATFORM_ADMIN'>('PARTICIPANT')

  const filteredNavGroups = NAV_GROUPS.map(group => {
    if (group.label === 'Role Dashboards') {
      return {
        ...group,
        items: group.items.filter(item => {
          if (activeRole === 'BUSINESS' && item.label === 'Business Center') return true
          if (activeRole === 'MARKET_MAKER' && item.label === 'Market Maker') return true
          if (activeRole === 'PLATFORM_ADMIN' && item.label === 'Platform Admin') return true
          return false
        })
      }
    }
    return group
  }).filter(group => group.items.length > 0)

  const allItems = NAV_GROUPS.flatMap((g) => g.items)
  const currentItem = allItems.find((item) =>
    item.path === '/legacy'
      ? location.pathname === '/legacy'
      : location.pathname.startsWith(item.path)
  )
  const stageLabel = currentItem?.stage ?? 'LIFECYCLE'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Branding */}
          <div className="flex items-center gap-3 px-2 py-4 mb-4 border-b border-slate-800">
            <img src={ecopurnityLogo} alt="Ecopurnity Logo" className="h-9 w-9 object-contain" />
            <div>
              <h1 className="font-bold tracking-wide text-emerald-400">ECOPURNITY</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Market Engine</p>
            </div>
          </div>

          {/* Nav Groups */}
          <nav className="space-y-4">
            {filteredNavGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-1">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = item.path === '/legacy'
                      ? location.pathname === '/legacy'
                      : location.pathname.startsWith(item.path)
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {isActive && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                            {item.stage}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer info role */}
        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs">
          <p className="text-slate-400 mb-2">Current Role</p>
          <select 
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as 'PARTICIPANT' | 'BUSINESS' | 'MARKET_MAKER' | 'PLATFORM_ADMIN')}
            className="w-full bg-slate-950 border border-slate-700 text-emerald-400 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
          >
            <option value="PARTICIPANT">Participant</option>
            <option value="BUSINESS">Business Org</option>
            <option value="MARKET_MAKER">Market Maker</option>
            <option value="PLATFORM_ADMIN">Platform Admin</option>
          </select>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 px-8 flex items-center justify-between shrink-0">
          <div className="text-sm text-slate-400">
            Lifecycle Stage:{' '}
            <span className="text-emerald-400 font-semibold">{stageLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-200">PT Solusi Teknologi</p>
              <p className="text-xs text-slate-400">Ajar Economic Node</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-400">
              A
            </div>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}