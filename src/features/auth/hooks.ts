import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { OnboardingInput, User } from '@/domain/types'
import { useUi } from '@/stores/ui'

const ME = ['auth', 'me'] as const

/** Goal picked on the landing page ("Mulai untuk bisnis"), pre-selected in onboarding. */
export const ONBOARDING_GOAL_KEY = 'ecp-onboarding-goal'
/** Where a new user was headed before signing up; offered again after onboarding (PRD §6 auth gate). */
export const ONBOARDING_RETURN_KEY = 'ecp-onboarding-return'

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

/** Store the signed-in user; call before navigating so guarded routes see the session. */
export function useSetMe() {
  const qc = useQueryClient()
  return (user: User) => qc.setQueryData(ME, user)
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<User>('/auth/login', { method: 'POST', json: body }),
  })
}

export const useAppeal = () =>
  useMutation({ mutationFn: (body: { email: string; password: string; reason: string }) => api<{ ok: true }>('/auth/appeal', { method: 'POST', json: body }) })

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

export function useRegister() {
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) => api<User>('/auth/register', { method: 'POST', json: body }),
  })
}

export function useGoogleSignIn() {
  return useMutation({
    mutationFn: (code: string) => api<User>('/auth/google', { method: 'POST', json: { code } }),
  })
}

export function useVerifyEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api<User>('/auth/verify-email', { method: 'POST', json: { token } }),
    onSuccess: (user) => qc.setQueryData(ME, (old: User | null | undefined) => (old?.id === user.id ? user : old)),
  })
}

export function useResendVerification() {
  return useMutation({ mutationFn: () => api<void>('/auth/resend-verification', { method: 'POST' }) })
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api<void>('/auth/forgot-password', { method: 'POST', json: { email } }) })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) => api<void>('/auth/reset-password', { method: 'POST', json: body }),
  })
}

export function useCompleteOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OnboardingInput) => api<User>('/me/onboarding', { method: 'PATCH', json: input }),
    onSuccess: (user) => qc.setQueryData(ME, user),
  })
}
