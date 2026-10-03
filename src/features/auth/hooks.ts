import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { User } from '@/domain/types'
import { useUi } from '@/stores/ui'

const ME = ['auth', 'me'] as const

/** Current user, or null when logged out. FE depends only on GET /auth/me (PRD §13). */
export function useMe() {
  return useQuery({
    queryKey: ME,
    queryFn: () =>
      api<User>('/auth/me').catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }),
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<User>('/auth/login', { method: 'POST', json: body }),
    onSuccess: (user) => qc.setQueryData(ME, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear()
      qc.setQueryData(ME, null)
    },
  })
}

/**
 * Wrap any write action on a public page: runs it when logged in, otherwise asks to log in
 * and brings the user back to this page afterwards (PRD §6).
 *
 *   const gate = useAuthGate()
 *   <Button onClick={() => gate('ikut bid di auction ini', placeBid)}>Bid</Button>
 */
export function useAuthGate() {
  const { data: me } = useMe()
  const open = useUi((s) => s.openAuthGate)
  return (reason: string, action: () => void) => (me ? action() : open(reason))
}
