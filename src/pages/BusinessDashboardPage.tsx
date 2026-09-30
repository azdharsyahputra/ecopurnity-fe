import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Package, TrendingUp, Users, ArrowRight, Activity, PlusCircle, Building2, Zap, CheckCircle2, X } from 'lucide-react'

interface BusinessDashboardData {
  stats: {
    activeProcurement: number
    totalSuppliers: number
    spendEfficiencyPercent: number
    activeFormations: number
  }
  recentProcurement: {
    id: string
    name: string
    status: string
    deadlineDate: string
    valueIdr: number
  }[]
  topSuppliers: {
    id: string
    name: string
    reliabilityScore: number
    tier: string
  }[]
}

const STATUS_LABELS: Record<string, string> = {
  IN_FULFILLMENT: 'In Fulfillment',
  PENDING_ALLOCATION: 'Pending Allocation',
  COMPLETED: 'Completed',
  AGREEMENT: 'Agreement',
}

export default function BusinessDashboardPage() {
  const [data, setData] = useState<BusinessDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showOppForm, setShowOppForm] = useState(false)
  const [oppSuccess, setOppSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [oppForm, setOppForm] = useState({ title: '', category: 'PRODUCT', quantity: '', unit: 'units', maxBudgetPerUnit: '', description: '' })

  useEffect(() => {
    fetch('/api/v1/business/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load dashboard. Please try again.</div>
  }

  if (loading || !data) {
    return <div className="text-slate-400 text-sm">Loading business dashboard...</div>
  }

  const { stats, recentProcurement, topSuppliers } = data

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-400" />
            Business Organization
          </h1>
          <p className="text-slate-400">Manage procurement, inventory, and supplier relationships</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => { setShowOppForm(true); setOppSuccess(false) }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <Zap className="mr-2 h-4 w-4" /> Create Opportunity Request
          </Button>
          <Link to="/registry">
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <PlusCircle className="mr-2 h-4 w-4" /> Register Supply/Demand
            </Button>
          </Link>
        </div>
      </div>

      {/* Opportunity Request Form Panel */}
      {showOppForm && (
        <Card className="bg-slate-900/60 backdrop-blur-md border-emerald-500/30 shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" /> Create Opportunity Request
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-1">
                  Submit your business demand to the engine. The system will detect matching opportunities and form a market automatically.
                </CardDescription>
              </div>
              <button onClick={() => setShowOppForm(false)} className="text-slate-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {oppSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-200">Opportunity Request Submitted!</p>
                <p className="text-xs text-slate-400">The engine will scan for matching supply and form a market if demand threshold is reached.</p>
                <Button onClick={() => { setShowOppForm(false); setOppSuccess(false) }} className="mt-4 bg-slate-800 text-slate-200 hover:bg-slate-700">Close</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium text-slate-300">Opportunity Title</label>
                  <Input
                    placeholder="e.g. Bulk Eco Packaging Q4 2026"
                    value={oppForm.title}
                    onChange={e => setOppForm({ ...oppForm, title: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Category</label>
                  <select
                    value={oppForm.category}
                    onChange={e => setOppForm({ ...oppForm, category: e.target.value })}
                    className="w-full rounded-md bg-slate-950 border border-slate-800 text-slate-100 text-sm px-3 py-2"
                  >
                    {['PRODUCT', 'SERVICE', 'CAPACITY', 'LOGISTICS', 'RESOURCE'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Required Quantity</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="10000"
                      value={oppForm.quantity}
                      onChange={e => setOppForm({ ...oppForm, quantity: e.target.value })}
                      className="bg-slate-950 border-slate-800 text-slate-100 flex-1"
                    />
                    <Input
                      placeholder="units"
                      value={oppForm.unit}
                      onChange={e => setOppForm({ ...oppForm, unit: e.target.value })}
                      className="bg-slate-950 border-slate-800 text-slate-100 w-24"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Max Budget / Unit (IDR)</label>
                  <Input
                    type="number"
                    placeholder="2000"
                    value={oppForm.maxBudgetPerUnit}
                    onChange={e => setOppForm({ ...oppForm, maxBudgetPerUnit: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">Additional Notes</label>
                  <Input
                    placeholder="e.g. Must be certified sustainable packaging"
                    value={oppForm.description}
                    onChange={e => setOppForm({ ...oppForm, description: e.target.value })}
                    className="bg-slate-950 border-slate-800 text-slate-100"
                  />
                </div>
                <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowOppForm(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </Button>
                  <Button
                    disabled={submitting || !oppForm.title || !oppForm.quantity}
                    onClick={async () => {
                      setSubmitting(true)
                      await fetch('/api/v1/demand', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...oppForm, isActive: true, isOpportunityRequest: true }),
                      })
                      setSubmitting(false)
                      setOppSuccess(true)
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {submitting ? 'Submitting...' : 'Submit to Opportunity Engine'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Active Procurement
              <Package className="h-4 w-4 text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.activeProcurement} Orders</div>
            <p className="text-xs text-slate-500 mt-1">In progress right now</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Total Suppliers
              <Users className="h-4 w-4 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.totalSuppliers}</div>
            <p className="text-xs text-slate-500 mt-1">Reliable partners across tiers</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Spend Efficiency
              <TrendingUp className="h-4 w-4 text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">+{stats.spendEfficiencyPercent}%</div>
            <p className="text-xs text-slate-500 mt-1">Compared to last quarter</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Active Formations
              <Activity className="h-4 w-4 text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.activeFormations} Markets</div>
            <p className="text-xs text-slate-500 mt-1">Waiting for completion</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Recent Procurement Activity</CardTitle>
            <CardDescription>Your latest strategic purchases and their fulfillment status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProcurement.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">{item.name}</h4>
                    <p className="text-xs text-slate-500">
                      {new Date(item.deadlineDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-emerald-400">
                      Rp {(item.valueIdr / 1_000_000).toFixed(0)}M
                    </span>
                    <Badge variant="outline" className="border-slate-700 text-slate-300">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-4 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
              View All Procurement <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Top Suppliers</CardTitle>
            <CardDescription>By reliability score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topSuppliers.map((sup) => (
                <div key={sup.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                      {sup.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{sup.name}</p>
                      <p className="text-xs text-emerald-500">{sup.tier}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-300">{sup.reliabilityScore}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
