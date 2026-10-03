import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useChannel } from '@/lib/realtime'
import type { ActivityEvent, PublicStats } from '@/domain/types'

const STATS = ['public', 'stats'] as const
const activityKey = (limit: number) => ['public', 'activity', limit] as const

/** Live network stats: fetched once, then patched from `public:stats` (PRD §12.2). */
export function usePublicStats() {
  const qc = useQueryClient()
  useChannel<PublicStats>('public:stats', (m) => qc.setQueryData(STATS, m.payload))
  return useQuery({ queryKey: STATS, queryFn: () => api<PublicStats>('/public/stats') })
}

/** Public activity feed, newest first; new events are prepended from `public:activity`. */
export function usePublicActivity(limit = 20) {
  const qc = useQueryClient()
  useChannel<ActivityEvent>('public:activity', (m) =>
    qc.setQueryData<ActivityEvent[]>(activityKey(limit), (old) => old && [m.payload, ...old].slice(0, limit)),
  )
  return useQuery({ queryKey: activityKey(limit), queryFn: () => api<ActivityEvent[]>(`/public/activity?limit=${limit}`) })
}
