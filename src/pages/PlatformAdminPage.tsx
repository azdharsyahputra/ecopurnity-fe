import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldAlert, Search, AlertOctagon, CheckCircle2, History, Gavel, RefreshCw, FileText, Scale, ChevronDown, ChevronUp, Clock, AlertTriangle, User } from 'lucide-react'

interface AdminStats {
  activeDisputes: number
  pendingVerifications: number
  fraudFlags: number
}

interface FraudLog {
  id: string
  title: string
  description: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  entityName: string
}

interface Dispute {
  id: string
  txRef: string
  issue: string
  escrowAmount: number
  buyerClaim: string
  supplierResponse?: string
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED'
  daysOpen?: number
  buyerName?: string
  supplierName?: string
}

interface AuditEntry {
  time: string
  event: string
  by: string
}

interface AdminDashboard {
  stats: AdminStats
  fraudLogs: FraudLog[]
  disputes: Dispute[]
  auditTrail: AuditEntry[]
}

const SEVERITY_CONFIG = {
  HIGH: { label: 'Investigate', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  MEDIUM: { label: 'Verify', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  LOW: { label: 'Monitor', color: 'text-slate-400', bg: 'bg-slate-700/30', border: 'border-slate-600' },
}

type DisputePhase = 'idle' | 'proof_requested' | 'mediating' | 'resolved'

interface DisputeState {
  phase: DisputePhase
  expanded: boolean
  loading: boolean
  mediationForm: {
    outcome: 'RELEASE_TO_BUYER' | 'RELEASE_TO_SUPPLIER' | 'SPLIT_50_50' | 'PENALTY_SUPPLIER' | ''
    notes: string
  }
  resolution?: {
    outcome: string
    notes: string
    timestamp: string
  }
}

const OUTCOME_OPTIONS = [
  { value: 'RELEASE_TO_BUYER', label: '⚖️ Release Escrow → Buyer', description: 'Supplier failed to meet contractual obligations', color: 'border-amber-500/40 text-amber-300' },
  { value: 'RELEASE_TO_SUPPLIER', label: '✅ Release Escrow → Supplier', description: 'Buyer claim is unsubstantiated, goods verified as compliant', color: 'border-emerald-500/40 text-emerald-300' },
  { value: 'SPLIT_50_50', label: '🔀 Split Escrow 50/50', description: 'Partial fault on both sides, shared settlement', color: 'border-blue-500/40 text-blue-300' },
  { value: 'PENALTY_SUPPLIER', label: '🚨 Penalty + Partial Release', description: 'Supplier penalized, 80% returned to buyer', color: 'border-rose-500/40 text-rose-300' },
]

export default function PlatformAdminPage() {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [disputeStates, setDisputeStates] = useState<Record<string, DisputeState>>({})
  const [proofDeadlines, setProofDeadlines] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/v1/admin/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  const refresh = () => {
    setLoading(true)
    setError(false)
    fetch('/api/v1/admin/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }

  const getState = (id: string): DisputeState =>
    disputeStates[id] ?? { phase: 'idle', expanded: false, loading: false, mediationForm: { outcome: '', notes: '' } }

  const updateState = (id: string, patch: Partial<DisputeState>) =>
    setDisputeStates(prev => ({ ...prev, [id]: { ...getState(id), ...patch } }))

  const handleRequestProof = async (id: string) => {
    updateState(id, { loading: true })
    await fetch(`/api/v1/admin/disputes/${id}/request-proof`, { method: 'POST' })
      .catch(() => {})
    const deadline = new Date(Date.now() + 48 * 3600000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    setProofDeadlines(prev => ({ ...prev, [id]: deadline }))
    updateState(id, { loading: false, phase: 'proof_requested', expanded: true })
  }

  const handleOpenMediation = (id: string) => {
    updateState(id, { phase: 'mediating', expanded: true })
  }

  const handleSubmitMediation = async (id: string) => {
    const state = getState(id)
    if (!state.mediationForm.outcome || !state.mediationForm.notes.trim()) return
    updateState(id, { loading: true })
    await fetch(`/api/v1/admin/disputes/${id}/mediate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: state.mediationForm.outcome, notes: state.mediationForm.notes }),
    })
    updateState(id, {
      loading: false,
      phase: 'resolved',
      resolution: {
        outcome: state.mediationForm.outcome,
        notes: state.mediationForm.notes,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      },
    })
  }

  if (error) {
    return <div className="text-rose-400 text-sm">Failed to load admin dashboard. Please try refreshing.</div>
  }

  if (loading || !data) {
    return <div className="text-slate-400 text-sm">Loading admin dashboard...</div>
  }

  const { stats, fraudLogs, disputes, auditTrail } = data

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-rose-400" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Platform Admin</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            System oversight, moderation, and fraud detection. You cannot alter market prices or allocation outcomes.
          </p>
        </div>
        <Button
          onClick={refresh}
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Active Disputes <AlertOctagon className="h-4 w-4 text-amber-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.activeDisputes}</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting moderation</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Pending Verifications <CheckCircle2 className="h-4 w-4 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.pendingVerifications}</div>
            <p className="text-xs text-slate-500 mt-1">KYC / KYB documents</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex justify-between">
              Fraud Flags <Search className="h-4 w-4 text-rose-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{stats.fraudFlags}</div>
            <p className="text-xs text-rose-400 mt-1">High severity anomalies</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fraud Detection */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Search className="h-5 w-5 text-amber-400" /> Fraud Detection Log
            </CardTitle>
            <CardDescription>AI-flagged anomalies in economic interactions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fraudLogs.map(log => {
              const sev = SEVERITY_CONFIG[log.severity]
              return (
                <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{log.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{log.description}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Entity: {log.entityName}</p>
                  </div>
                  <Badge className={`${sev.bg} ${sev.color} ${sev.border} shrink-0 ml-2`}>{sev.label}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Dispute Resolution */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Gavel className="h-5 w-5 text-indigo-400" /> Active Disputes
            </CardTitle>
            <CardDescription>Transaction mediation requiring admin oversight</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {disputes.map(dispute => {
              const ds = getState(dispute.id)
              return (
                <div key={dispute.id} className={`rounded-lg border transition-all ${
                  ds.phase === 'resolved' ? 'border-emerald-500/30 bg-emerald-500/5' :
                  ds.phase === 'mediating' ? 'border-indigo-500/40 bg-indigo-500/5' :
                  ds.phase === 'proof_requested' ? 'border-blue-500/30 bg-blue-500/5' :
                  'border-slate-800 bg-slate-950'
                }`}>
                  {/* Header row */}
                  <div className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-200">{dispute.txRef}: {dispute.issue}</p>
                          {ds.phase === 'resolved' && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Resolved</Badge>}
                          {ds.phase === 'proof_requested' && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Proof Requested</Badge>}
                          {ds.phase === 'mediating' && <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px]">In Mediation</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {dispute.daysOpen ?? 2} days open ·
                          <span className="font-semibold text-rose-400">Rp {(dispute.escrowAmount / 1_000_000).toFixed(0)}M Locked</span>
                        </p>
                      </div>
                      <button
                        onClick={() => updateState(dispute.id, { expanded: !ds.expanded })}
                        className="text-slate-500 hover:text-slate-300 ml-2"
                      >
                        {ds.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Collapsed preview */}
                    {!ds.expanded && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-1">{dispute.buyerClaim}</p>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {ds.expanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-slate-800/60 pt-3">
                      {/* Claims */}
                      <div className="grid grid-cols-1 gap-2">
                        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/20">
                          <p className="text-[10px] font-semibold text-amber-400 flex items-center gap-1 mb-1">
                            <User className="h-3 w-3" /> Buyer Claim
                          </p>
                          <p className="text-xs text-slate-300">{dispute.buyerClaim}</p>
                        </div>
                        {dispute.supplierResponse && (
                          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-blue-500/20">
                            <p className="text-[10px] font-semibold text-blue-400 flex items-center gap-1 mb-1">
                              <User className="h-3 w-3" /> Supplier Response
                            </p>
                            <p className="text-xs text-slate-300">{dispute.supplierResponse}</p>
                          </div>
                        )}
                      </div>

                      {/* Phase: IDLE */}
                      {ds.phase === 'idle' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleRequestProof(dispute.id)}
                            disabled={ds.loading}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {ds.loading ? 'Requesting...' : 'Request Proof from Both Parties'}
                          </button>
                          <button
                            onClick={() => handleOpenMediation(dispute.id)}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex-1 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Scale className="h-3.5 w-3.5" /> Open Mediation
                          </button>
                        </div>
                      )}

                      {/* Phase: PROOF REQUESTED */}
                      {ds.phase === 'proof_requested' && (
                        <div className="space-y-2">
                          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                            <p className="font-semibold text-blue-300 flex items-center gap-1.5 mb-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Proof Request Sent
                            </p>
                            <p className="text-slate-400">Both parties have been notified to submit supporting documents (photos, invoices, contracts) within <strong className="text-slate-200">48 hours</strong>.</p>
                            <p className="text-slate-500 mt-1">Deadline: <strong className="text-amber-400">{proofDeadlines[dispute.id] ?? '—'}</strong></p>
                          </div>
                          <button
                            onClick={() => handleOpenMediation(dispute.id)}
                            className="text-xs w-full bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Scale className="h-3.5 w-3.5" /> Proceed to Mediation
                          </button>
                        </div>
                      )}

                      {/* Phase: MEDIATING */}
                      {ds.phase === 'mediating' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                            <Scale className="h-3.5 w-3.5" /> Select Mediation Outcome
                          </div>
                          <div className="space-y-2">
                            {OUTCOME_OPTIONS.map(opt => (
                              <label key={opt.value} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                ds.mediationForm.outcome === opt.value
                                  ? `${opt.color} bg-slate-800/80`
                                  : 'border-slate-700 hover:border-slate-600'
                              }`}>
                                <input
                                  type="radio"
                                  name={`outcome-${dispute.id}`}
                                  value={opt.value}
                                  checked={ds.mediationForm.outcome === opt.value}
                                  onChange={() => updateState(dispute.id, { mediationForm: { ...ds.mediationForm, outcome: opt.value as DisputeState['mediationForm']['outcome'] } })}
                                  className="mt-0.5 shrink-0"
                                />
                                <div>
                                  <p className="text-xs font-semibold text-slate-200">{opt.label}</p>
                                  <p className="text-[11px] text-slate-500">{opt.description}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-medium text-slate-400">Official Mediation Notes <span className="text-rose-400">*</span></label>
                            <textarea
                              rows={3}
                              placeholder="Describe your decision rationale. This note will be permanently logged and sent to both parties..."
                              value={ds.mediationForm.notes}
                              onChange={e => updateState(dispute.id, { mediationForm: { ...ds.mediationForm, notes: e.target.value } })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 p-2.5 resize-none focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateState(dispute.id, { phase: ds.mediationForm.outcome ? 'proof_requested' : 'idle' })}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded flex-1 transition-colors"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => handleSubmitMediation(dispute.id)}
                              disabled={ds.loading || !ds.mediationForm.outcome || !ds.mediationForm.notes.trim()}
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex-1 disabled:opacity-40 transition-colors font-semibold"
                            >
                              {ds.loading ? 'Finalizing...' : 'Confirm & Submit Decision'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Phase: RESOLVED */}
                      {ds.phase === 'resolved' && ds.resolution && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                          <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> Dispute Resolved — {ds.resolution.timestamp}
                          </p>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <p className="text-xs font-semibold text-slate-200">
                              {OUTCOME_OPTIONS.find(o => o.value === ds.resolution?.outcome)?.label}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-400 border-l-2 border-emerald-500/40 pl-2">{ds.resolution.notes}</p>
                          <p className="text-[11px] text-slate-500">Escrow has been released per decision. Both parties have been notified. This decision is now recorded in the Audit Trail.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* System Audit */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <History className="h-5 w-5 text-slate-400" /> System Audit Trail
          </CardTitle>
          <CardDescription>Immutable log of platform-wide critical events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auditTrail.map((log, i) => (
              <div key={i} className="flex justify-between items-center text-xs p-2 border-b border-slate-800/50 last:border-0">
                <div className="flex items-center gap-4">
                  <span className="text-slate-500 shrink-0">{log.time}</span>
                  <span className="text-slate-300 font-medium">{log.event}</span>
                </div>
                <span className="text-slate-500 shrink-0 ml-4">Auto: {log.by}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
