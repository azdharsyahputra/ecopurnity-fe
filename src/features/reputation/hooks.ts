import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReputationReport } from '@/domain/reputation'
import type { BusinessProfile, Match, MatchAction, PublicProfile } from './types'



export const useMatches = () => useQuery({ queryKey: ['me', 'matches'], queryFn: () => api<Match[]>('/me/matches') })

export function useMatchAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: MatchAction; reason?: string }) => api<Match>(`/me/matches/${encodeURIComponent(id)}`, { method: 'POST', json: body }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['me', 'matches'] }), qc.invalidateQueries({ queryKey: ['me', 'opportunities'] })]),
  })
}

export const useReputation = () => useQuery({ queryKey: ['me', 'reputation'], queryFn: () => api<ReputationReport>('/me/reputation') })

export const usePublicProfile = (username: string) =>
  useQuery({ queryKey: ['profile', 'u', username], queryFn: () => api<PublicProfile>(`/profiles/u/${encodeURIComponent(username)}`) })

export const useBusinessProfile = (slug: string) =>
  useQuery({ queryKey: ['profile', 'b', slug], queryFn: () => api<BusinessProfile>(`/profiles/b/${encodeURIComponent(slug)}`) })


export const scoreBand = (score: number) => (score >= 90 ? 'Sangat baik' : score >= 80 ? 'Baik' : score >= 60 ? 'Cukup' : 'Perlu perhatian')
