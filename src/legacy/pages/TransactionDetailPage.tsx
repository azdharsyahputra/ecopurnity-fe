import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Transaction, TransactionStatus } from '@/types/transaction'
import {
  ArrowLeft, CheckCircle2, FileText,
  Handshake, Lock, Truck, Upload,
  Sparkles, TrendingDown
} from 'lucide-react'

const TIMELINE_STEPS: { status: TransactionStatus; label: string; icon: React.ElementType }[] = [
  { status: 'AGREEMENT',       label: 'Agreement Signed',      icon: Handshake },
  { status: 'ESCROW_LOCKED',   label: 'Escrow Locked',         icon: Lock },
  { status: 'IN_FULFILLMENT',  label: 'In Fulfillment',        icon: Truck },
  { status: 'PROOF_SUBMITTED', label: 'Proof Submitted',       icon: FileText },
  { status: 'COMPLETED',       label: 'Completed',             icon: CheckCircle2 },
]

const STATUS_ORDER: TransactionStatus[] = [
  'AGREEMENT', 'ESCROW_LOCKED', 'IN_FULFILLMENT', 'PROOF_SUBMITTED', 'COMPLETED'
]

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tx, setTx] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/transactions/${id}`)
      .then((r) => r.json())
      .then((data) => { setTx(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [id])

  const handleSubmitProof = async () => {
    setSubmitting(true)
    await fetch(`/api/v1/transactions/${id}/proof`, { method: 'POST' }).catch(() => {})
    setSubmitting(false)
    setSubmitted(true)
  }

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load transaction details. Please try again.</div>
  }

  if (loading || !tx) {
    return <div className="text-slate-400 text-sm">Loading transaction detail...</div>
  }

  const currentStepIdx = STATUS_ORDER.indexOf(tx.status as TransactionStatus)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back Button */}
      <button
        onClick={() => navigate('/legacy/transactions')}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Transactions
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">{tx.title}</h2>
          <Badge className={`text-xs ${tx.role === 'BUYER' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'}`}>
            You are the {tx.role}
          </Badge>
        </div>
        <p className="text-slate-400 text-sm mt-1">{tx.category} · ID: {tx.id}</p>
      </div>

      {/* Status Timeline */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300">Transaction Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0">
            {TIMELINE_STEPS.map((step, idx) => {
              const isDone = STATUS_ORDER.indexOf(step.status) <= currentStepIdx
              const isCurrent = step.status === tx.status
              const StepIcon = step.icon
              return (
                <div key={step.status} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      isCurrent
                        ? 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : isDone
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : 'bg-slate-800 border-slate-700'
                    }`}>
                      <StepIcon className={`h-4 w-4 ${isCurrent ? 'text-emerald-400' : isDone ? 'text-emerald-500/70' : 'text-slate-600'}`} />
                    </div>
                    <p className={`text-[10px] text-center max-w-[70px] leading-tight ${isCurrent ? 'text-emerald-400 font-semibold' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                      {step.label}
                    </p>
                  </div>
                  {idx < TIMELINE_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 mb-5 ${STATUS_ORDER.indexOf(TIMELINE_STEPS[idx + 1].status) <= currentStepIdx ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invoice & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total Volume</p>
            <p className="text-xl font-bold text-slate-100 mt-1">{tx.totalQuantity.toLocaleString()} {tx.unit}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Contract Value</p>
            <p className="text-xl font-bold text-blue-400 mt-1">Rp {(tx.totalValueIdr / 1_000_000).toFixed(0)}M</p>
          </CardContent>
        </Card>
        {tx.savingsIdr && (
          <Card className="bg-emerald-950/30 border-emerald-800/40">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-400/70">Collective Savings</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">Rp {(tx.savingsIdr / 1_000_000).toFixed(0)}M</p>
              </div>
              <TrendingDown className="h-7 w-7 text-emerald-500/40" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invoice Breakdown */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" /> Invoice Breakdown
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            {tx.counterpartyCount ? `${tx.counterpartyCount} suppliers in this consortium order` : `Counterparty: ${tx.counterpartyName}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tx.invoiceItems.map((item) => (
            <div key={item.supplierId} className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-200">{item.supplierName}</p>
                <p className="text-slate-500">{item.quantity.toLocaleString()} {item.unit} × Rp {item.unitPriceIdr.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-[11px]">Subtotal</p>
                <p className="text-base font-bold text-emerald-400">Rp {(item.subtotalIdr / 1_000_000).toFixed(0)}M</p>
              </div>
            </div>
          ))}

          {/* Total Row */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300">Total</p>
            <p className="text-base font-bold text-slate-100">Rp {(tx.totalValueIdr / 1_000_000).toFixed(0)}M</p>
          </div>
        </CardContent>
      </Card>

      {/* Action: Submit Proof */}
      {(tx.status === 'IN_FULFILLMENT' || tx.status === 'ESCROW_LOCKED') && tx.role === 'SUPPLIER' && !submitted && (
        <Card className="bg-slate-900 border-amber-500/20">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-slate-200">Submit Proof of Fulfillment</p>
                <p className="text-xs text-slate-400">Upload delivery confirmation to trigger escrow release</p>
              </div>
            </div>
            <Button
              onClick={handleSubmitProof}
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs flex-shrink-0"
            >
              {submitting ? 'Submitting...' : 'Submit Proof'}
            </Button>
          </CardContent>
        </Card>
      )}

      {submitted && (
        <Card className="bg-emerald-950/30 border-emerald-500/30">
          <CardContent className="p-5 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">Proof submitted successfully</p>
              <p className="text-xs text-slate-400">Your reputation score will update once the buyer confirms delivery.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {tx.status === 'COMPLETED' && (
        <Card className="bg-emerald-950/20 border-emerald-800/30">
          <CardContent className="p-5 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <p className="text-sm text-emerald-300 font-medium">This transaction has been completed and has positively contributed to your reputation score.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
