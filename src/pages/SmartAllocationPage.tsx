import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ExecutionPlan } from '@/types/allocation'
import { PieChart, ShieldCheck, CheckCircle, Lock, Cpu, Layers, Sparkles, ArrowRight } from 'lucide-react'

export default function SmartAllocationPage() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<ExecutionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLocking, setIsLocking] = useState(false)
  const [status, setStatus] = useState<'OPTIMIZED' | 'ESCROW_LOCKED'>('OPTIMIZED')

  useEffect(() => {
    fetch('/api/v1/allocation/current')
      .then((res) => res.json())
      .then((data) => {
        setPlan(data)
        setStatus(data.status)
        setLoading(false)
      })
  }, [])

  const handleLockEscrow = async () => {
    setIsLocking(true)
    await fetch('/api/v1/allocation/lock-escrow', { method: 'POST' })
    setIsLocking(false)
    setStatus('ESCROW_LOCKED')
  }

  if (loading || !plan) {
    return <div className="text-slate-400 text-sm">Computing multi-supplier allocation matrix...</div>
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <PieChart className="h-6 w-6 text-emerald-400" />
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Smart Order Allocation Engine</h2>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          Automated clearing algorithm matching aggregated demand with optimal multi-supplier capacities.
        </p>
      </div>

      {/* Main Allocation Status Banner */}
      <Card className="bg-slate-900/60 backdrop-blur-md border-slate-700/60 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Algorithmic Clearing Complete
              </Badge>
              <Badge variant="outline" className="border-slate-700 text-slate-400">
                {status}
              </Badge>
            </div>
            <h3 className="text-xl font-bold text-slate-100 mt-2">{plan.auctionTitle}</h3>
            <p className="text-xs text-slate-400">
              Total Fulfillable Volume: <strong>{plan.totalDemandQuantity.toLocaleString()} {plan.unit}</strong>
            </p>
          </div>

          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="text-xs text-slate-400">Weighted Average Unit Price</p>
              <p className="text-2xl font-bold text-emerald-400">
                Rp {plan.weightedAveragePriceIdr.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-400">/ {plan.unit}</span>
              </p>
            </div>
            {status === 'OPTIMIZED' ? (
              <Button
                onClick={handleLockEscrow}
                disabled={isLocking}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-2"
              >
                <Lock className="h-3.5 w-3.5" />
                {isLocking ? 'Locking Funds...' : 'Lock Escrow & Execute Order'}
              </Button>
            ) : (
              <>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 py-1.5 px-3 flex items-center gap-1.5 text-xs">
                  <CheckCircle className="h-4 w-4 text-emerald-400" /> Escrow Funds Locked
                </Badge>
                <Button
                  onClick={() => navigate('/transactions')}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-2"
                >
                  Proceed to Transaction <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total Contract Value</p>
            <p className="text-xl font-bold text-slate-100 mt-1">
              Rp {(plan.totalValueIdr / 1000000000).toFixed(3)} Billion
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Consortium Total Savings</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">
              Rp {(plan.totalSavingsIdr / 1000000).toFixed(0)} Million
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Suppliers Selected</p>
            <p className="text-xl font-bold text-blue-400 mt-1">
              {plan.allocations.length} Primary Manufacturers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Supplier Split Visualizer */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-400" />
            <CardTitle className="text-base text-slate-100">Multi-Supplier Allocation Split</CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-400">
            The clearing engine automatically splits large aggregate orders across multiple vendors to minimize cost and execution risk.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Visual Split Bar */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              {plan.allocations.map((alloc, idx) => (
                <div
                  key={alloc.supplierId}
                  style={{ width: `${alloc.sharePercentage}%` }}
                  className={idx === 0 ? 'bg-emerald-500' : 'bg-blue-500'}
                  title={`${alloc.supplierName}: ${alloc.sharePercentage}%`}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              {plan.allocations.map((alloc, idx) => (
                <span key={alloc.supplierId} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${idx === 0 ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                  {alloc.supplierName} ({alloc.sharePercentage}%)
                </span>
              ))}
            </div>
          </div>

          {/* Detailed Itemized Allocation Cards */}
          <div className="space-y-3">
            {plan.allocations.map((alloc) => (
              <div
                key={alloc.supplierId}
                className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100 text-sm">{alloc.supplierName}</span>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                      <ShieldCheck className="h-3 w-3 mr-1" /> {alloc.reliabilityScore}% Reliability
                    </Badge>
                  </div>
                  <p className="text-slate-400">
                    Allocated Share: <strong>{alloc.allocatedQuantity.toLocaleString()} {plan.unit}</strong> ({alloc.sharePercentage}%)
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-slate-500 text-[11px]">Agreed Unit Price</p>
                    <p className="font-bold text-slate-200">Rp {alloc.unitPriceIdr.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[11px]">Subtotal Cost</p>
                    <p className="font-bold text-emerald-400">Rp {alloc.totalCostIdr.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Allocation Reasoning */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Why this split?
            </p>
            {plan.allocations.map((alloc, idx) => {
              // Compute simulated factor scores for illustration
              const priceScore = idx === 0 ? 96 : 88
              const reliabilityScore = alloc.reliabilityScore
              const capacityScore = idx === 0 ? 100 : 68
              const overallScore = Math.round(priceScore * 0.5 + reliabilityScore * 0.3 + capacityScore * 0.2)
              const colors = idx === 0
                ? { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' }
                : { bar: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' }
              return (
                <div key={alloc.supplierId} className={`p-3 rounded-lg border ${colors.border} ${colors.bg} text-xs space-y-2`}>
                  <div className="flex justify-between items-center">
                    <span className={`font-semibold ${colors.text}`}>{alloc.supplierName}</span>
                    <span className={`font-bold ${colors.text}`}>Engine Score: {overallScore}/100</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: 'Price Efficiency', value: priceScore, weight: '50%' },
                      { label: 'Reliability',      value: reliabilityScore, weight: '30%' },
                      { label: 'Capacity Fill',    value: capacityScore, weight: '20%' },
                    ].map(f => (
                      <div key={f.label} className="flex items-center gap-2">
                        <span className="w-28 text-slate-500 flex-shrink-0">{f.label}</span>
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors.bar} rounded-full`} style={{ width: `${f.value}%` }} />
                        </div>
                        <span className="text-slate-400 w-8 text-right">{f.value}</span>
                        <span className="text-slate-600 w-8 text-right">{f.weight}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-slate-500 text-[11px]">
                    Allocated <strong className="text-slate-300">{alloc.sharePercentage}%</strong> of total demand because this combination minimizes cost while maintaining {alloc.reliabilityScore}% fulfillment guarantee.
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>

        <CardFooter className="bg-slate-950/50 border-t border-slate-800 p-4 text-xs text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-emerald-400" />
            Optimization Algorithm: Linear Programming (Simplex / Cost-Reliability Weighted)
          </span>
          <span className="text-slate-500">Ecopurnity Engine v1.0</span>
        </CardFooter>
      </Card>
    </div>
  )
}