import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { AuditEntry, OpportunityDetail } from '@/domain/types'
import type {
  CreateMarketInput, CreateRoundInput, DisputeAction, MarketStatusAction, MmAnalytics, MmMarketOps, MmOverview, ParticipantAction, PipelineCard,
  PipelineStage,
} from '@/domain/mm'
import type { MarketRules } from '@/domain/marketRules'

// Market Maker workspace data (PRD §10). Keys start with 'mm'; mutations also refresh the public
// economy lists because markets, rounds and opportunity statuses are shared with them.

const json = (method: string, body?: unknown) => ({ method, json: body })

function useMmMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(['mm', 'markets', 'auctions', 'opportunities'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}

export const useMmOverview = () => useQuery({ queryKey: ['mm', 'overview'], queryFn: () => api<MmOverview>('/mm/overview'), refetchInterval: 15_000 })

export const usePipeline = () => useQuery({ queryKey: ['mm', 'pipeline'], queryFn: () => api<PipelineCard[]>('/mm/opportunities') })

export const useMoveOpportunity = () =>
  useMmMutation((v: { id: string; stage: PipelineStage; reason?: string }) => api(`/mm/opportunities/${v.id}/stage`, json('POST', { stage: v.stage, reason: v.reason })))

/** Full opportunity (participants, mechanism reason) for prefilling the wizard. */
export const useMmOpportunity = (id: string | null) =>
  useQuery({ queryKey: ['mm', 'opportunity', id], queryFn: () => api<OpportunityDetail>(`/opportunities/${id}`), enabled: !!id })

export const useCreateMarket = () => useMmMutation((input: CreateMarketInput) => api<{ id: string }>('/mm/markets', json('POST', input)))

export const useMmMarket = (id: string) =>
  useQuery({ queryKey: ['mm', 'market', id], queryFn: () => api<MmMarketOps>(`/mm/markets/${id}`), refetchInterval: 5_000 })

export const useMarketAudit = (id: string) => useQuery({ queryKey: ['mm', 'audit', id], queryFn: () => api<AuditEntry[]>(`/mm/markets/${id}/audit`) })

export const useParticipantAction = (marketId: string) =>
  useMmMutation((v: { id: string; action: ParticipantAction; reason?: string }) => api(`/mm/markets/${marketId}/participants/${v.id}`, json('POST', { action: v.action, reason: v.reason })))

export const useCreateRound = (marketId: string) => useMmMutation((input: CreateRoundInput) => api<{ id: string }>(`/mm/markets/${marketId}/rounds`, json('POST', input)))

export const useSaveRules = (marketId: string) =>
  useMmMutation((v: { rules: MarketRules; reason?: string }) => api(`/mm/markets/${marketId}/rules`, json('PUT', v)))

export const useMarketStatus = (marketId: string) =>
  useMmMutation((v: { action: MarketStatusAction; reason: string }) => api(`/mm/markets/${marketId}/status`, json('POST', v)))

export const useDisputeAction = (marketId: string) =>
  useMmMutation((v: { id: string; action: DisputeAction; note?: string }) => api(`/mm/markets/${marketId}/disputes/${v.id}`, json('POST', { action: v.action, note: v.note })))

export const useMmAnalytics = (marketId?: string) =>
  useQuery({ queryKey: ['mm', 'analytics', marketId ?? 'all'], queryFn: () => api<MmAnalytics>(`/mm/analytics${marketId ? `?market=${marketId}` : ''}`) })

/** One search param as state (replace navigation, '' removes it). */
export function useParam(key: string) {
  const [params, setParams] = useSearchParams()
  const set = (v: string) => setParams((p) => (v ? p.set(key, v) : p.delete(key), p), { replace: true })
  return [params.get(key) ?? '', set] as const
}
