import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { OpportunityItem } from '@/types/opportunity'
import { Zap, Users, TrendingUp, MapPin, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function OpportunityFeedPage() {
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/v1/opportunities')
      .then((res) => res.json())
      .then((data) => {
        setOpportunities(data)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="text-slate-400 text-sm">Scanning regional economic data...</div>
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-amber-400" />
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Opportunity Feed</h2>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          Opportunities detected by the engine based on regional supply-demand matching.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {opportunities.map((opp) => {
          const supplyPercentage = Math.min(
            100,
            Math.round((opp.currentSupplyAmount / opp.aggregatedDemandAmount) * 100)
          )
          const supplyGap = opp.aggregatedDemandAmount - opp.currentSupplyAmount

          return (
            <Card key={opp.id} className="bg-slate-900 border-slate-800 flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                    ⚡ {opp.type.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Radius {opp.locationRadiusKm} km
                  </span>
                </div>
                <CardTitle className="text-lg text-slate-100">{opp.title}</CardTitle>
                <CardDescription className="text-slate-400 text-xs">{opp.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div>
                    <p className="text-slate-500">Combined Demand</p>
                    <p className="font-semibold text-slate-200 mt-0.5">
                      {opp.aggregatedDemandAmount.toLocaleString()} {opp.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Supply Gap</p>
                    <p className="font-semibold text-rose-400 mt-0.5">
                      {supplyGap > 0 ? `${supplyGap.toLocaleString()} ${opp.unit}` : 'Fulfilled'}
                    </p>
                  </div>
                </div>

                {/* Progress Coverage */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Supply Coverage</span>
                    <span>{supplyPercentage}%</span>
                  </div>
                  <Progress value={supplyPercentage} className="h-2 bg-slate-800" />
                </div>

                <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-3">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Users className="h-4 w-4 text-emerald-400" />
                    <strong>{opp.buyersCount}</strong> Buyers Joined
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <TrendingUp className="h-4 w-4" /> {opp.potentialValueIdr}
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-2 border-t border-slate-800/50 flex gap-2">
                <Button
                  onClick={() => navigate(`/legacy/graph?opp=${opp.id}`)}
                  variant="outline"
                  className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300 text-xs"
                >
                  Explore Graph
                </Button>
                <Button
                  onClick={() => navigate('/legacy/market/form')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center justify-center gap-1"
                >
                  Form Market <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}