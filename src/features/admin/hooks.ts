import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '@/lib/api'
import type { AuditEntry } from '@/domain/types'
import type {
  AdminAuction, AdminAuctionDetail, AdminMarket, AdminOverview, AdminUser, AdminUserDetail, AdminWithdrawal, AdminWithdrawalDetail, DisputeCase,
  DisputeSummary, FraudAlert, VerificationRequest, WithdrawalStatus,
} from './types'



export const useAdminOverview = () => useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<AdminOverview>('/admin/overview') })

export const useAdminUsers = (q: string, status: string) =>
  useQuery({
    queryKey: ['admin', 'users', q, status],
    queryFn: () => api<AdminUser[]>(`/admin/users${qs({ q, status })}`),
    placeholderData: keepPreviousData,
  })
export const useAdminUser = (id: string) => useQuery({ queryKey: ['admin', 'users', 'detail', id], queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`) })

export const useVerifications = () => useQuery({ queryKey: ['admin', 'verifications'], queryFn: () => api<VerificationRequest[]>('/admin/verifications') })
export const useVerification = (id: string) =>
  useQuery({ queryKey: ['admin', 'verifications', id], queryFn: () => api<VerificationRequest>(`/admin/verifications/${id}`) })

export const useAdminMarkets = () => useQuery({ queryKey: ['admin', 'markets'], queryFn: () => api<AdminMarket[]>('/admin/markets') })
export const useAdminMarket = (id: string) =>
  useQuery({ queryKey: ['admin', 'markets', id], queryFn: () => api<AdminMarket & { auctions: AdminAuction[]; audit: AuditEntry[] }>(`/admin/markets/${id}`) })

export const useAdminAuctions = () => useQuery({ queryKey: ['admin', 'auctions'], queryFn: () => api<AdminAuction[]>('/admin/auctions') })
export const useAdminAuction = (id: string) => useQuery({ queryKey: ['admin', 'auctions', id], queryFn: () => api<AdminAuctionDetail>(`/admin/auctions/${id}`) })

export const useDisputes = () => useQuery({ queryKey: ['admin', 'disputes'], queryFn: () => api<DisputeSummary[]>('/admin/disputes') })
export const useDispute = (id: string) => useQuery({ queryKey: ['admin', 'disputes', id], queryFn: () => api<DisputeCase>(`/admin/disputes/${id}`) })

export const useAlerts = () => useQuery({ queryKey: ['admin', 'alerts'], queryFn: () => api<FraudAlert[]>('/admin/alerts') })
export const useAlert = (id: string) =>
  useQuery({ queryKey: ['admin', 'alerts', id], queryFn: () => api<FraudAlert & { audit: AuditEntry[] }>(`/admin/alerts/${id}`) })

export const useAdminWithdrawals = (status: WithdrawalStatus) =>
  useQuery({
    queryKey: ['admin', 'withdrawals', status],
    queryFn: () => api<AdminWithdrawal[]>(`/admin/withdrawals${qs({ status })}`),
    placeholderData: keepPreviousData,
  })

export const useAdminWithdrawal = (id: string) =>
  useQuery({
    queryKey: ['admin', 'withdrawals', 'detail', id],
    queryFn: () => api<AdminWithdrawalDetail>(`/admin/withdrawals/${id}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

export const useAuditTrail = () => useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<AuditEntry[]>('/admin/audit') })





export function useAdminAction<T = unknown>(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: object) => api<T>(`/admin/${path}/actions`, { method: 'POST', json: body }),
    onSuccess: () => Promise.all([['admin'], ['auctions'], ['markets'], ['me'], ['profile']].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  })
}
