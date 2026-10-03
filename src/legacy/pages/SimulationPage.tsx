import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

import { Calculator, Zap, Users, ArrowRight, TrendingDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function SimulationPage() {
  const navigate = useNavigate()
  const [commodity, setCommodity] = useState('Eco Packaging Box')
  const [buyersCount, setBuyersCount] = useState(5)
  const [avgDemandPerBuyer, setAvgDemandPerBuyer] = useState(1000)
  const [currentUnitPrice, setCurrentUnitPrice] = useState(5000)
  
  const totalVolume = buyersCount * avgDemandPerBuyer
  const standardCost = totalVolume * currentUnitPrice
  
  // What-if simulation logic (economy of scale)
  const discountRate = Math.min(0.3, Math.log10(totalVolume) * 0.05) // Max 30% discount based on volume
  const simulatedUnitPrice = currentUnitPrice * (1 - discountRate)
  const simulatedCost = totalVolume * simulatedUnitPrice
  const potentialSavings = standardCost - simulatedCost

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
          <Calculator className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Economic Simulation</h1>
          <p className="text-slate-400">What-if engine for collective procurement & market formation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Simulation Parameters</CardTitle>
            <CardDescription>Adjust variables to see potential economic impact</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Commodity / Resource</label>
              <Input 
                value={commodity}
                onChange={e => setCommodity(e.target.value)}
                className="bg-slate-950 border-slate-800 text-slate-100"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <label className="font-medium text-slate-300">Number of Businesses Pooling</label>
                <span className="text-blue-400 font-bold">{buyersCount}</span>
              </div>
              <input 
                type="range" 
                min="1" max="50" 
                value={buyersCount}
                onChange={e => setBuyersCount(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <label className="font-medium text-slate-300">Avg Demand per Business</label>
                <span className="text-blue-400 font-bold">{avgDemandPerBuyer.toLocaleString()} units</span>
              </div>
              <input 
                type="range" 
                min="100" max="50000" step="100"
                value={avgDemandPerBuyer}
                onChange={e => setAvgDemandPerBuyer(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Current Unit Price (IDR)</label>
              <Input 
                type="number"
                value={currentUnitPrice}
                onChange={e => setCurrentUnitPrice(Number(e.target.value))}
                className="bg-slate-950 border-slate-800 text-slate-100"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950 border-blue-500/30 shadow-[0_0_30px_-10px_rgba(59,130,246,0.2)]">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <Zap className="h-5 w-5" /> Projected Outcome
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Pooled Volume</p>
                <p className="text-xl font-bold text-slate-100">{totalVolume.toLocaleString()} units</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center">
                <Users className="h-5 w-5 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Standard Cost (Solo)</p>
                <p className="text-lg font-semibold text-slate-300">Rp {(standardCost / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-slate-500">Rp {currentUnitPrice.toLocaleString()} / unit</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Collective Cost</p>
                <p className="text-lg font-semibold text-emerald-400">Rp {(simulatedCost / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-emerald-500 flex items-center">
                  Rp {Math.round(simulatedUnitPrice).toLocaleString()} / unit 
                  <TrendingDown className="h-3 w-3 ml-1" />
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <p className="text-sm text-slate-400 mb-2">Potential Total Savings</p>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-black text-emerald-400">Rp {(potentialSavings / 1000000).toFixed(1)}M</span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 mb-1">
                  {(discountRate * 100).toFixed(1)}% Cost Reduction
                </Badge>
              </div>
            </div>
            
            <Button 
              onClick={() => navigate('/legacy/market/form')}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white mt-4"
            >
              Convert to Real Coalition <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
