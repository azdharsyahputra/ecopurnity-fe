import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Transaction, TransactionStatus } from '@/types/transaction'
import {
  ArrowRight, CheckCircle2, Package, FileText,
  AlertTriangle, Handshake, Lock, Truck
} from 'lucide-react'

const STATUS_CONFIG: Record<TransactionStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  AGREEMENT:       { label: 'Agreement',        color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: Handshake },
  ESCROW_LOCKED:   { label: 'Escrow Locked',    color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  icon: Lock },
  IN_FULFILLMENT:  { label: 'In Fulfillment',   color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Truck },
  PROOF_SUBMITTED: { label: 'Proof Submitted',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: FileText },
  COMPLETED:       { label: 'Completed',        color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle2 },
  DISPUTED:        { label: 'Disputed',         color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    icon: AlertTriangle },
}

const ROLE_CONFIG = {
  BUYER:    { label: 'Buyer',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  SUPPLIER: { label: 'Supplier', color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30' },
}

export default function TransactionPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/v1/transactions')
      .then((r) => r.json())
      .then((data) => { setTransactions(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load transactions. Please try again.</div>
  }

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading transaction history...</div>
  }

  const active = transactions.filter((t) => t.status !== 'COMPLETED' && t.status !== 'DISPUTED')
  const completed = transactions.filter((t) => t.status === 'COMPLETED' || t.status === 'DISPUTED')

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-400" />
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Transactions</h2>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          Track agreements, fulfillments, and settlements across all your economic contracts.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Contracts', value: active.length, color: 'text-amber-400' },
          { label: 'Completed', value: completed.length, color: 'text-emerald-400' },
          { label: 'Total Value', value: `Rp ${(transactions.reduce((s, t) => s + t.totalValueIdr, 0) / 1_000_000_000).toFixed(2)}B`, color: 'text-blue-400' },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Transactions */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Active Contracts</h3>
          {active.map((tx) => {
            const status = STATUS_CONFIG[tx.status]
            const role = ROLE_CONFIG[tx.role]
            const StatusIcon = status.icon
            return (
              <Card key={tx.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                onClick={() => navigate(`/transactions/${tx.id}`)}>
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl ${status.bg} border ${status.border} flex items-center justify-center flex-shrink-0`}>
                      <StatusIcon className={`h-5 w-5 ${status.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-100">{tx.title}</p>
                        <Badge className={`text-[10px] ${role.bg} ${role.color} ${role.border}`}>{role.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        {tx.counterpartyCount ? `${tx.counterpartyCount} parties` : tx.counterpartyName} · Deadline: {new Date(tx.deadline).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Contract Value</p>
                      <p className="text-base font-bold text-slate-100">Rp {(tx.totalValueIdr / 1_000_000).toFixed(0)}M</p>
                    </div>
                    <Badge className={`${status.bg} ${status.color} ${status.border} text-[10px]`}>{status.label}</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-600" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Completed Transactions */}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Completed</h3>
          {completed.map((tx) => {
            const status = STATUS_CONFIG[tx.status]
            const role = ROLE_CONFIG[tx.role]
            const StatusIcon = status.icon
            return (
              <Card key={tx.id} className="bg-slate-900/60 border-slate-800/60 hover:border-slate-700 transition-colors cursor-pointer opacity-80 hover:opacity-100"
                onClick={() => navigate(`/transactions/${tx.id}`)}>
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl ${status.bg} border ${status.border} flex items-center justify-center flex-shrink-0`}>
                      <StatusIcon className={`h-5 w-5 ${status.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-200">{tx.title}</p>
                        <Badge className={`text-[10px] ${role.bg} ${role.color} ${role.border}`}>{role.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{tx.counterpartyName} · {new Date(tx.createdAt).toLocaleDateString('id-ID')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Value</p>
                      <p className="text-base font-bold text-slate-300">Rp {(tx.totalValueIdr / 1_000_000).toFixed(0)}M</p>
                    </div>
                    <Badge className={`${status.bg} ${status.color} ${status.border} text-[10px]`}>{status.label}</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-700" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Reputation CTA — shown after completed transactions */}
      {completed.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-200">Your economic reputation has been updated.</p>
              <p className="text-xs text-slate-400 mt-0.5">Completed transactions feed directly into your Reputation Graph and affect future auction priority.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/reputation')}
            className="ml-4 shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 whitespace-nowrap"
          >
            View Reputation <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
