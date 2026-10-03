import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AllocationLine, AppNotification, Auction, AuctionDetail, AuctionEvaluation, CreateAuctionInput, DashboardSummary, Identity, Listing,
  ListingDetail, ListingInput, MyBid, MyMarket, NotificationPrefs, PersonalOpportunity, Qualification, Transaction, TransactionDetail,
} from '@/domain/types'
import type { QualificationStatus } from '@/domain/status'
import type { TradeActionInput } from '@/domain/trade'
import type { KycLevel } from '@/domain/kyc'
import type { Contract, ContractAction, ContractEvery } from '@/domain/contract'

// Personal workspace data (PRD §8). Every key starts with 'me' so a sign-out or a live event can
// invalidate the whole workspace at once.

const json = (method: string, body?: unknown) => ({ method, json: body })

function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[][]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

export const useDashboard = () => useQuery({ queryKey: ['me', 'dashboard'], queryFn: () => api<DashboardSummary>('/me/dashboard') })

// ── Identity ──
export const useIdentity = () => useQuery({ queryKey: ['me', 'identity'], queryFn: () => api<Identity>('/me/identity') })

export function useSaveIdentity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (i: Identity) => api<Identity>('/me/identity', json('PUT', i)),
    onSuccess: (i) => {
      qc.setQueryData(['me', 'identity'], i)
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

// ── Listings ──
export const useListings = (kind: 'supply' | 'demand') =>
  useQuery({ queryKey: ['me', 'listings', kind], queryFn: () => api<Listing[]>(`/me/listings?kind=${kind}`) })

export const useListing = (id: string | undefined) =>
  useQuery({ queryKey: ['me', 'listings', 'detail', id], queryFn: () => api<ListingDetail>(`/me/listings/${id}`), enabled: !!id })

export function useSaveListing(id?: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: ListingInput) => (id ? api<Listing>(`/me/listings/${id}`, json('PATCH', input)) : api<Listing>('/me/listings', json('POST', input))),
    onSuccess: () => invalidate(['me', 'listings'], ['me', 'dashboard']),
  })
}

export function useListingAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (a: { type: 'archive' } | { type: 'market'; marketId: string }) =>
      a.type === 'archive' ? api<Listing>(`/me/listings/${id}/archive`, json('POST')) : api<Listing>(`/me/listings/${id}/market`, json('POST', { marketId: a.marketId })),
    onSuccess: () => invalidate(['me', 'listings'], ['me', 'markets'], ['me', 'dashboard']),
  })
}

// ── Opportunities ──
export const usePersonalOpportunities = (tab: string) =>
  useQuery({ queryKey: ['me', 'opportunities', tab], queryFn: () => api<PersonalOpportunity[]>(`/me/opportunities?tab=${tab}`) })

export function useOpportunityAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (
      a:
        | { type: 'join'; id: string; kind: 'supply' | 'demand'; listingId: string; quantity: { value: number; unit: string } }
        | { type: 'follow' | 'leave'; id: string },
    ) =>
      a.type === 'join'
        ? api(`/me/opportunities/${a.id}/join`, json('POST', { kind: a.kind, listingId: a.listingId, quantity: a.quantity }))
        : a.type === 'follow'
          ? api(`/me/opportunities/${a.id}/follow`, json('POST'))
          : api(`/me/opportunities/${a.id}`, json('DELETE')),
    onSuccess: () => invalidate(['me', 'opportunities'], ['me', 'dashboard'], ['opportunities']),
  })
}

// ── Markets ──
export const useMyMarkets = () => useQuery({ queryKey: ['me', 'markets'], queryFn: () => api<MyMarket[]>('/me/markets') })

export function useMarketAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (a: { type: 'join' | 'leave'; id: string } | { type: 'watch'; id: string; priceIdr?: number }) =>
      a.type === 'watch' ? api(`/me/markets/${a.id}/watch`, json('PUT', { priceIdr: a.priceIdr })) : api(`/me/markets/${a.id}/${a.type}`, json('POST')),
    onSuccess: () => invalidate(['me', 'markets']),
  })
}

// ── Auctions ──
export const useMyAuctions = () =>
  useQuery({
    queryKey: ['me', 'auctions'],
    queryFn: () => api<{ eligible: (Auction & { qualification: QualificationStatus })[]; bids: MyBid[]; owned: Auction[] }>('/me/auctions'),
    refetchInterval: 10_000,
  })

/** Qualification, own bid, and ownership for one auction room. */
export const useAuctionMe = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['me', 'auction', id],
    queryFn: () => api<{ qualification: Qualification; bid: MyBid | null; owner: boolean; evaluateHref?: string }>(`/auctions/${id}/me`),
    enabled,
  })

export function useAuctionAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (
      a:
        | { type: 'qualify'; documentName: string; acceptRules: boolean }
        | { type: 'bid'; priceIdr: number }
        | { type: 'withdraw' }
        | { type: 'accept' },
    ) => {
      switch (a.type) {
        case 'qualify':
          return api<unknown>(`/auctions/${id}/qualification`, json('POST', { documentName: a.documentName, acceptRules: a.acceptRules }))
        case 'bid':
          return api<unknown>(`/auctions/${id}/bids`, json('POST', { priceIdr: a.priceIdr }))
        case 'withdraw':
          return api<unknown>(`/auctions/${id}/bids/mine`, json('DELETE'))
        case 'accept':
          return api<{ transactionId: string }>(`/auctions/${id}/accept`, json('POST'))
      }
    },
    onSuccess: () => invalidate(['me', 'auction', id], ['me', 'auctions'], ['me', 'dashboard'], ['auctions', 'detail', id], ['me', 'transactions']),
  })
}

export function useCreateAuction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: CreateAuctionInput) => api<AuctionDetail>('/me/auctions', json('POST', input)),
    onSuccess: () => invalidate(['me', 'auctions'], ['me', 'listings'], ['auctions']),
  })
}

export const useEvaluation = (id: string) =>
  useQuery({ queryKey: ['me', 'evaluation', id], queryFn: () => api<AuctionEvaluation>(`/auctions/${id}/evaluation`), refetchInterval: 5_000 })

export function useAward(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (lines: AllocationLine[]) => api<{ transactionIds: string[] }>(`/auctions/${id}/award`, json('POST', { lines })),
    onSuccess: () => invalidate(['me'], ['auctions']),
  })
}

// ── Transactions ──
export const useTransactions = (role?: string) =>
  useQuery({ queryKey: ['me', 'transactions', role ?? 'all'], queryFn: () => api<Transaction[]>(`/me/transactions${role ? `?role=${role}` : ''}`) })

export const useTransaction = (id: string) =>
  useQuery({ queryKey: ['me', 'transactions', 'detail', id], queryFn: () => api<TransactionDetail>(`/me/transactions/${id}`) })

export function useTransactionAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TradeActionInput) => api<TransactionDetail>(`/me/transactions/${id}/actions`, json('POST', body)),
    onSuccess: (t) => {
      qc.setQueryData(['me', 'transactions', 'detail', id], t)
      qc.invalidateQueries({ queryKey: ['me', 'transactions'] })
      qc.invalidateQueries({ queryKey: ['me', 'dashboard'] })
    },
  })
}

// ── Notifications ──
export const useNotifications = (enabled = true) =>
  useQuery({ queryKey: ['me', 'notifications'], queryFn: () => api<AppNotification[]>('/me/notifications'), enabled })

export function useMarkRead() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids?: string[]) => api('/me/notifications/read', json('POST', { ids })),
    onSuccess: () => invalidate(['me', 'notifications']),
  })
}

export const useNotificationPrefs = () =>
  useQuery({ queryKey: ['me', 'notification-prefs'], queryFn: () => api<NotificationPrefs>('/me/notification-prefs') })

export function useSaveNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: NotificationPrefs) => api<NotificationPrefs>('/me/notification-prefs', json('PUT', p)),
    onSuccess: (p) => qc.setQueryData(['me', 'notification-prefs'], p),
  })
}

// ── Finance (PRD F6) ──
export interface Finance {
  escrowHeldIdr: number
  receivableIdr: number
  availableIdr: number
  withdrawnIdr: number
  bank?: { bank: string; accountNo: string; holder: string }
  withdrawals: { id: string; amountIdr: number; at: string; status: 'processing' | 'paid' }[]
  entries: { id: string; at: string; label: string; amountIdr: number; kind: 'escrow' | 'payout' | 'refund' | 'payment' | 'withdrawal' | 'fee' }[]
}

export const useFinance = () => useQuery({ queryKey: ['me', 'finance'], queryFn: () => api<Finance>('/me/finance') })

export function useFinanceAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { type: 'bank'; bank: Finance['bank'] } | { type: 'withdraw'; amountIdr: number }) =>
      a.type === 'bank' ? api<Finance>('/me/finance/bank', json('PUT', a.bank)) : api<Finance>('/me/finance/withdrawals', json('POST', { amountIdr: a.amountIdr })),
    onSuccess: (f) => qc.setQueryData(['me', 'finance'], f),
  })
}

export interface Kyc {
  level: KycLevel
  label: string
  limitIdr: number
  next?: string
  verification: Identity['profile']['verification']
  otpPending: boolean
}

export const useKyc = () => useQuery({ queryKey: ['me', 'kyc'], queryFn: () => api<Kyc>('/me/kyc') })

export type KycAction = { type: 'phone'; phone: string } | { type: 'otp'; code: string } | { type: 'identity'; nik: string; fullName: string; ktpFile?: string; selfieFile?: string }

export function useKycAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ type, ...body }: KycAction) => api<Kyc>({ phone: '/me/kyc/phone', otp: '/me/kyc/phone/verify', identity: '/me/kyc/identity' }[type], json('POST', body)),
    onSuccess: () => invalidate(['me', 'kyc'], ['me', 'identity']),
  })
}

export type ContractView = Contract & { side: 'buyer' | 'supplier'; actions: ContractAction[] }

export const useContracts = () => useQuery({ queryKey: ['me', 'contracts'], queryFn: () => api<ContractView[]>('/me/contracts'), refetchInterval: 10_000 })
export const useContract = (id: string) => useQuery({ queryKey: ['me', 'contracts', id], queryFn: () => api<ContractView>(`/me/contracts/${id}`), refetchInterval: 10_000 })

export function useCreateContract() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (b: { fromTx: string; every: ContractEvery; runs: number; startAt: string }) => api<ContractView>('/me/contracts', json('POST', b)),
    onSuccess: () => invalidate(['me', 'contracts']),
  })
}

export function useContractAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (action: ContractAction) => api<ContractView>(`/me/contracts/${id}/actions`, json('POST', { action })),
    onSuccess: () => invalidate(['me', 'contracts'], ['me', 'transactions'], ['me', 'dashboard']),
  })
}
