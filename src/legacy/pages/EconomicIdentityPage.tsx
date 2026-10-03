import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { EconomicProfile } from '@/types/economic'
import { Cpu, Box, ShoppingCart, ShieldCheck, Activity } from 'lucide-react'

export default function EconomicIdentityPage() {
  const [profile, setProfile] = useState<EconomicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/profile/me')
      .then((res) => res.json())
      .then((data) => {
        setProfile(data)
        setLoading(false)
      })
  }, [])

  if (loading || !profile) {
    return <div className="text-slate-400 text-sm">Loading Economic Profile from MSW...</div>
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Profile Title */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">{profile.name}</h2>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            {profile.entityType}
          </Badge>
        </div>
        <p className="text-slate-400 text-sm mt-1">{profile.headline}</p>
      </div>

      {/* Grid Status Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Reliability Score</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{profile.stats.reliabilityScore}%</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-500/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Economic Activity</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">{profile.stats.totalTransactions} Tx</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Fulfillment Rate</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">{profile.stats.fulfillmentRate}%</p>
            </div>
            <Box className="h-8 w-8 text-indigo-500/40" />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Dispute Rate</p>
              <p className="text-2xl font-bold text-rose-400 mt-1">{profile.stats.disputeRate}%</p>
            </div>
            <ShieldCheck className="h-8 w-8 text-rose-500/40" />
          </CardContent>
        </Card>
      </div>

      {/* Grid Capacity, Assets, and Demand */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Capacity */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-200">
              <Cpu className="h-4 w-4 text-emerald-400" />
              CAPACITY
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">What this node can produce or deliver</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.capacities.map((cap) => (
              <div key={cap.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-200">{cap.name}</p>
                  <p className="text-xs text-slate-500">{cap.category}</p>
                </div>
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">
                  {cap.amount}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Available Assets */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-200">
              <Box className="h-4 w-4 text-blue-400" />
              AVAILABLE ASSETS
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">Hardware, infra & physical resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.assets.map((asset) => (
              <div key={asset.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-200">{asset.name}</p>
                  <p className="text-xs text-slate-500">{asset.details}</p>
                </div>
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-xs">
                  {asset.category}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Demand */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-200">
              <ShoppingCart className="h-4 w-4 text-amber-400" />
              DEMAND
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">Resources or services needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.demands.map((demand) => (
              <div key={demand.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-200">{demand.name}</p>
                  <p className="text-xs text-slate-500">Need: {demand.quantity}</p>
                </div>
                <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
                  {demand.urgency}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}