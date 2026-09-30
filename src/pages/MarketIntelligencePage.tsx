import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Activity, TrendingUp, TrendingDown, Factory, Box, PackageOpen, Target, Sparkles } from 'lucide-react'

interface MarketIntelligenceData {
  stats: {
    aggregatedDemandIdr: number
    aggregatedDemandChange: number
    unusedCapacityUnits: number
    unusedCapacityNote: string
    criticalSupplyGapIdr: number
    criticalSupplyGapNote: string
    marketLiquidity: string
    activeAuctions: number
  }
  demandTrends: { category: string; growth: number; volumeIdr: number }[]
  unusedCapacity: { supplierName: string; resource: string; amount: string; utilizationPercent: number }[]
  topOpportunities: { title: string; gapLabel: string; valueIdr: number; demanders: number }[]
}

export default function MarketIntelligencePage() {
  const [data, setData] = useState<MarketIntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/v1/market-intelligence')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load market intelligence. Please try again.</div>
  }

  if (loading || !data) {
    return <div className="text-slate-400 text-sm">Loading market intelligence from network...</div>
  }

  const { stats, demandTrends, unusedCapacity, topOpportunities } = data

  const fmtBillion = (n: number) => `Rp ${(n / 1_000_000_000).toFixed(1)}B`
  const fmtMillion = (n: number) => `Rp ${(n / 1_000_000).toFixed(0)}M`

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-400" />
            Market Intelligence
          </h1>
          <p className="text-slate-400">Macro-economic data and predictive insights from the network</p>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Aggregated Demand
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{fmtBillion(stats.aggregatedDemandIdr)}</div>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> +{stats.aggregatedDemandChange}% from last week
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Unused Capacity
              <Factory className="h-4 w-4 text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.unusedCapacityUnits.toLocaleString()} Units</div>
            <p className="text-xs text-slate-500 mt-1">{stats.unusedCapacityNote}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Critical Supply Gap
              <PackageOpen className="h-4 w-4 text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">{fmtBillion(stats.criticalSupplyGapIdr)}</div>
            <p className="text-xs text-slate-500 mt-1">{stats.criticalSupplyGapNote}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Market Liquidity
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.marketLiquidity}</div>
            <p className="text-xs text-slate-500 mt-1">{stats.activeAuctions} active auctions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Trends */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Demand Trends by Category</CardTitle>
            <CardDescription>Fastest growing procurement sectors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {demandTrends.map((trend, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-200">{trend.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{fmtMillion(trend.volumeIdr)}</span>
                    <Badge variant="outline" className={trend.growth > 0 ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10' : 'text-rose-400 border-rose-500/50 bg-rose-500/10'}>
                      {trend.growth > 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                      {Math.abs(trend.growth)}%
                    </Badge>
                  </div>
                </div>
                <Progress value={trend.growth > 0 ? 50 + trend.growth : 50 + trend.growth} className="h-1.5 bg-slate-800" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Unused Capacity Tracker */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Unused Capacity Heatmap</CardTitle>
            <CardDescription>Identify dormant resources that can be mobilized</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unusedCapacity.map((cap, i) => (
                <div key={i} className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{cap.resource}</h4>
                      <p className="text-xs text-slate-500">{cap.supplierName}</p>
                    </div>
                    <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                      {cap.amount} Idle
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={cap.utilizationPercent} className="h-1.5 flex-1 bg-slate-800" />
                    <span className="text-[10px] text-slate-400 w-12 text-right">{cap.utilizationPercent}% Used</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Opportunities */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-400" /> Top Value Opportunities
          </CardTitle>
          <CardDescription>The most lucrative supply-demand gaps right now</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topOpportunities.map((opp, i) => (
              <div key={i} className="p-4 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] mb-2 uppercase">High Value</Badge>
                <h4 className="font-semibold text-slate-200 mb-1">{opp.title}</h4>
                <div className="text-2xl font-bold text-emerald-400 mb-3">{fmtMillion(opp.valueIdr)}</div>
                <div className="flex justify-between text-xs text-slate-400 border-t border-slate-800/50 pt-3">
                  <span className="flex items-center gap-1"><Box className="h-3 w-3" /> {opp.gapLabel} Short</span>
                  <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {opp.demanders} Buyers</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
