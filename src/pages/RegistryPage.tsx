import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SupplyEntry, DemandEntry, SupplyCategory, DemandCategory, UrgencyLevel } from '@/types/registry'
import {
  Database, Plus, Package, Cpu, Wrench, Truck,
  Layers, CheckCircle2, AlertCircle, X
} from 'lucide-react'

const SUPPLY_CATEGORY_ICONS: Record<SupplyCategory, React.ElementType> = {
  PRODUCT: Package, SERVICE: Wrench, SKILL: Cpu,
  CAPACITY: Layers, ASSET: Database, LOGISTICS: Truck,
}

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: 'HIGH',   color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/30' },
  MEDIUM: { label: 'MEDIUM', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  LOW:    { label: 'LOW',    color: 'text-slate-400',  bg: 'bg-slate-700/30',  border: 'border-slate-600' },
}

const SUPPLY_CATEGORIES: SupplyCategory[] = ['PRODUCT', 'SERVICE', 'SKILL', 'CAPACITY', 'ASSET', 'LOGISTICS']
const DEMAND_CATEGORIES: DemandCategory[] = ['PRODUCT', 'SERVICE', 'CAPACITY', 'RESOURCE', 'LOGISTICS']

type Tab = 'supply' | 'demand'
type FormMode = 'supply' | 'demand' | null

export default function RegistryPage() {
  const [tab, setTab] = useState<Tab>('supply')
  const [supplies, setSupplies] = useState<SupplyEntry[]>([])
  const [demands, setDemands] = useState<DemandEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '', category: '', description: '', quantity: '',
    unit: '', price: '', locationCity: '', urgency: 'MEDIUM',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/supply/me').then((r) => r.json()),
      fetch('/api/v1/demand/me').then((r) => r.json()),
    ]).then(([s, d]) => {
      setSupplies(s)
      setDemands(d)
      setLoading(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const endpoint = formMode === 'supply' ? '/api/v1/supply' : '/api/v1/demand'
    const payload = formMode === 'supply'
      ? { ...formData, pricePerUnit: Number(formData.price), isActive: true }
      : { ...formData, maxBudgetPerUnit: Number(formData.price), isActive: true }
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    setSubmitting(false)
    setFormMode(null)
    setSuccessMsg(data.message)
    setFormData({ name: '', category: '', description: '', quantity: '', unit: '', price: '', locationCity: '', urgency: 'MEDIUM' })
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading your economic registry...</div>

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-indigo-400" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Economic Registry</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Register your supply and demand — this is the economic data the Opportunity Engine reads.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setFormMode('supply')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Supply
          </Button>
          <Button
            onClick={() => setFormMode('demand')}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add Demand
          </Button>
        </div>
      </div>

      {/* Success Toast */}
      {successMsg && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
          <span className="text-xs text-emerald-400/60 ml-auto">The Opportunity Engine will scan this data.</span>
        </div>
      )}

      {/* Registration Form Modal */}
      {formMode && (
        <Card className={`border ${formMode === 'supply' ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-amber-500/20 bg-amber-950/10'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-slate-200">
                {formMode === 'supply' ? '+ Register New Supply' : '+ Register New Demand'}
              </CardTitle>
              <button onClick={() => setFormMode(null)} className="text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardDescription className="text-xs text-slate-400">
              {formMode === 'supply'
                ? 'What can you offer to the market? (Product, Service, Skill, Capacity, Asset, Logistics)'
                : 'What do you need? (Product, Service, Capacity, Resource, Logistics)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Name / Title *</label>
                <input
                  required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={formMode === 'supply' ? 'e.g., Backend Development' : 'e.g., GPU Compute'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Category *</label>
                <select
                  required value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/50 appearance-none"
                >
                  <option value="">Select category...</option>
                  {(formMode === 'supply' ? SUPPLY_CATEGORIES : DEMAND_CATEGORIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs text-slate-400">Description</label>
                <input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the details, specs, conditions..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Quantity *</label>
                <input
                  required value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="e.g., 5000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Unit *</label>
                <input
                  required value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g., units/day, hrs/week, Kg"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  {formMode === 'supply' ? 'Price per Unit (Rp)' : 'Max Budget per Unit (Rp)'}
                </label>
                <input
                  type="number" value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="e.g., 1500"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">City / Location *</label>
                <input
                  required value={formData.locationCity}
                  onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
                  placeholder="e.g., Jakarta"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {formMode === 'demand' && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Urgency</label>
                  <select
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              )}

              <div className={`${formMode === 'demand' ? '' : 'md:col-span-2'} flex justify-end gap-2 pt-2`}>
                <Button type="button" variant="outline" onClick={() => setFormMode(null)}
                  className="border-slate-700 text-black hover:bg-slate-800 text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}
                  className={`text-white text-xs ${formMode === 'supply' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
                  {submitting ? 'Registering...' : `Register ${formMode === 'supply' ? 'Supply' : 'Demand'}`}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
        {(['supply', 'demand'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'supply' ? `Supply (${supplies.length})` : `Demand (${demands.length})`}
          </button>
        ))}
      </div>

      {/* Supply List */}
      {tab === 'supply' && (
        <div className="space-y-3">
          {supplies.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-500 text-sm">
              No supply registered yet. Click "Add Supply" to start.
            </div>
          )}
          {supplies.map((s) => {
            const CatIcon = SUPPLY_CATEGORY_ICONS[s.category]
            return (
              <Card key={s.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                      <CatIcon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-100">{s.name}</p>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">{s.category}</Badge>
                        {s.isActive && <Badge className="bg-slate-700/50 text-slate-400 border-slate-600 text-[10px]">Active</Badge>}
                      </div>
                      <p className="text-xs text-slate-500">{s.description} · {s.locationCity}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-100">{s.quantity} {s.unit}</p>
                    {s.pricePerUnit && (
                      <p className="text-xs text-emerald-400">Rp {s.pricePerUnit.toLocaleString()}/unit</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Demand List */}
      {tab === 'demand' && (
        <div className="space-y-3">
          {demands.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-slate-500 text-sm">
              No demand registered yet. Click "Add Demand" to start.
            </div>
          )}
          {demands.map((d) => {
            const urgency = URGENCY_CONFIG[d.urgency]
            return (
              <Card key={d.id} className="bg-slate-900 border-slate-800">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-slate-100">{d.name}</p>
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">{d.category}</Badge>
                        <Badge className={`text-[10px] ${urgency.bg} ${urgency.color} ${urgency.border}`}>{urgency.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{d.description} · {d.locationCity}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-100">{d.quantity} {d.unit}</p>
                    {d.maxBudgetPerUnit && (
                      <p className="text-xs text-amber-400">Budget: Rp {d.maxBudgetPerUnit.toLocaleString()}/unit</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
