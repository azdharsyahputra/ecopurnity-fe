import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { User } from '@/domain/types'
import type { InvitationAction, MmApplication, MmApplicationInput, NewOrgInput, OrgInvitation } from '@/domain/roles'
import { useSetMe } from '@/features/auth/hooks'

// Role activation (PRD F6). Writes that change the account return the fresh user so the switcher updates at once.

export const useMmApplication = () => useQuery({ queryKey: ['me', 'mm-application'], queryFn: () => api<MmApplication | null>('/me/mm-application') })

export function useApplyMm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MmApplicationInput) => api<MmApplication>('/me/mm-application', { method: 'POST', json: input }),
    onSuccess: (a) => qc.setQueryData(['me', 'mm-application'], a),
  })
}

export const useInvitations = () => useQuery({ queryKey: ['me', 'invitations'], queryFn: () => api<OrgInvitation[]>('/me/invitations') })

export function useAnswerInvitation() {
  const qc = useQueryClient()
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (v: { id: string; action: InvitationAction }) => api<User>(`/me/invitations/${v.id}`, { method: 'POST', json: { action: v.action } }),
    onSuccess: (user) => {
      setMe(user)
      return qc.invalidateQueries({ queryKey: ['me', 'invitations'] })
    },
  })
}

export function useCreateOrg() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (input: NewOrgInput) => api<{ orgId: string; user: User }>('/orgs', { method: 'POST', json: input }),
    onSuccess: ({ user }) => setMe(user),
  })
}

/** Admin review queue; the 'admin' prefix lets useAdminAction refresh it. */
export const useMmApplications = () => useQuery({ queryKey: ['admin', 'mm-applications'], queryFn: () => api<MmApplication[]>('/admin/mm-applications') })
