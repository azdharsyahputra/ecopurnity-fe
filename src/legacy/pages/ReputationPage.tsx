import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { ReputationProfile } from '@/types/reputation'
import {
  ShieldCheck, Star, Repeat2, AlertTriangle, CheckCircle2,
  Clock, XCircle, TrendingUp, Award, Zap
} from 'lucide-react'

const TIER_CONFIG = {
  TRUSTED_ELITE: { label: 'Trusted Elite', color: 'emerald', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  VERIFIED:      { label: 'Verified',      color: 'blue',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-400' },
  BUILDING:      { label: 'Building',      color: 'amber',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400' },
  NEW:           { label: 'New Member',    color: 'slate',   bg: 'bg-slate-700/30',   border: 'border-slate-600',      text: 'text-slate-400' },
}

const OUTCOME_CONFIG = {
  FULFILLED:  { icon: CheckCircle2,  color: 'text-emerald-400', label: 'Fulfilled' },
  LATE:       { icon: Clock,         color: 'text-amber-400',   label: 'Late' },
  DISPUTED:   { icon: AlertTriangle, color: 'text-rose-400',    label: 'Disputed' },
  CANCELLED:  { icon: XCircle,       color: 'text-slate-500',   label: 'Cancelled' },
}

const BADGE_COLORS = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
  indigo:  'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
}

export default function ReputationPage() {
  const [rep, setRep] = useState<ReputationProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/v1/reputation/me')
      .then((r) => r.json())
      .then((data) => { setRep(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load reputation data. Please try again.</div>
  }

  if (loading || !rep) {
    return <div className="text-slate-400 text-sm">Loading reputation data...</div>
  }

  const tier = TIER_CONFIG[rep.tier]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Economic Reputation</h2>
        </div>
        <p className="text-slate-400 text-sm mt-1">
          Your reputation score is built from actual economic interactions — not ratings.
        </p>
      </div>

      {/* Tier Banner */}
      <Card className={`border ${tier.border} bg-slate-900/60 backdrop-blur-md shadow-xl relative overflow-hidden`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-2xl ${tier.bg} border ${tier.border} flex items-center justify-center`}>
              <Star className={`h-8 w-8 ${tier.text}`} />
            </div>
            <div>
              <Badge className={`${tier.bg} ${tier.text} ${tier.border} mb-1`}>{tier.label}</Badge>
              <p className="text-3xl font-bold text-slate-100">{rep.overallScore}<span className="text-lg text-slate-400 font-normal">/100</span></p>
              <p className="text-xs text-slate-400 mt-0.5">Overall Economic Score</p>
            </div>
          </div>
          <div className="w-full md:w-64 space-y-2">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Score progress to Elite</span>
              <span>{rep.overallScore}%</span>
            </div>
            <Progress value={rep.overallScore} className="h-2 bg-slate-800" />
            <p className="text-[11px] text-slate-500">Based on {rep.totalTransactions} verified transactions</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Fulfillment Rate', value: `${rep.fulfillmentRate}%`, icon: CheckCircle2, color: 'text-emerald-400', iconBg: 'text-emerald-500/40' },
          { label: 'On-Time Delivery', value: `${rep.onTimeDelivery}%`, icon: Clock, color: 'text-blue-400', iconBg: 'text-blue-500/40' },
          { label: 'Dispute Rate', value: `${rep.disputeRate}%`, icon: AlertTriangle, color: 'text-rose-400', iconBg: 'text-rose-500/40' },
          { label: 'Repeat Contracts', value: `${rep.repeatContracts}`, icon: Repeat2, color: 'text-indigo-400', iconBg: 'text-indigo-500/40' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-slate-900 border-slate-800">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.iconBg}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Badges & History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Badges */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" /> Achievement Badges
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">Earned from verified economic interactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rep.badges.map((badge) => (
              <div key={badge.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${BADGE_COLORS[badge.color].split(' ')[0]}`}>
                  <Zap className={`h-4 w-4 ${BADGE_COLORS[badge.color].split(' ')[1]}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{badge.label}</p>
                  <p className="text-xs text-slate-500">{badge.description}</p>
                </div>
                <Badge className={`ml-auto text-[10px] ${BADGE_COLORS[badge.color]}`}>Earned</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* History */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" /> Reputation History
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">Score changes from recent transactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rep.history.map((entry) => {
              const cfg = OUTCOME_CONFIG[entry.outcome]
              const isPositive = entry.impactScore > 0
              return (
                <div key={entry.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <cfg.icon className={`h-4 w-4 ${cfg.color} flex-shrink-0`} />
                    <div>
                      <p className="text-xs font-medium text-slate-200 leading-tight">{entry.title}</p>
                      <p className="text-[11px] text-slate-500">{entry.role} · {entry.date}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? '+' : ''}{entry.impactScore}
                    </p>
                    <p className={`text-[10px] ${cfg.color}`}>{cfg.label}</p>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* How reputation affects allocation */}
      <Card className="bg-slate-900/50 border-slate-800 border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <Zap className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-200">How this score affects you</p>
            <p className="text-xs text-slate-400 mt-1">
              Your reputation score is a live input to the <strong className="text-slate-300">Smart Allocation Engine</strong>.
              Higher reliability scores increase your allocation priority in auctions.
              A score above 95% grants priority matching in collective procurement pools.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
