import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Coalition } from '@/types/market'
import { Users, Gavel, PlusCircle, ArrowRight, ShieldCheck } from 'lucide-react'

export default function MarketMakerDashboard() {
  const [coalitions, setCoalitions] = useState<Coalition[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/coalitions')
      .then(res => res.json())
      .then(data => {
        setCoalitions(data)
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            Market Maker Dashboard
          </h1>
          <p className="text-slate-400">Manage coalitions, pools, and active market mechanisms</p>
        </div>
        <div className="flex gap-3">
          <Button className="bg-slate-800 text-slate-200 hover:bg-slate-700">
            <PlusCircle className="mr-2 h-4 w-4" /> New Coalition
          </Button>
          <Link to="/market/form">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
              <Gavel className="mr-2 h-4 w-4" /> Form Market
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active Coalitions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{coalitions.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Value Locked (TVL)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">Rp 4.2B</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Market Formations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">12</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold text-slate-100 mt-8 mb-4">Your Managed Coalitions</h2>
      {loading ? (
        <div className="text-slate-400">Loading coalitions...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {coalitions.map((c) => (
            <Card key={c.id} className="bg-slate-900/50 border-slate-800 flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-slate-100 text-lg">{c.name}</CardTitle>
                    <CardDescription>{c.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className={c.status === 'READY' ? 'border-emerald-500/50 text-emerald-400' : 'border-amber-500/50 text-amber-400'}>
                    {c.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Users className="h-4 w-4 text-slate-500" />
                    <span>{c.membersCount} Members Joined</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Pooled Capacity</span>
                      <span className="text-slate-200 font-medium">{c.totalCapacity.toLocaleString()} {c.unit}</span>
                    </div>
                    <Progress value={(c.totalCapacity / (c.totalCapacity * 1.5)) * 100} className="h-2 bg-slate-800" />
                  </div>
                </div>
              </CardContent>
              <div className="p-4 border-t border-slate-800 mt-auto bg-slate-950/50 flex justify-end">
                <Button variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                  Manage Coalition <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
