import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TransactionDetail } from '@/domain/types'
import type { TradeActionInput } from '@/domain/trade'
import type { Payment, PaymentInput } from '@/domain/payment'

// One F6 trade UI for both workspaces: the personal and org pages pass a scope saying where actions go
// and which caches to refresh.

export interface TradeScope {
  /** POST endpoint for an action on trade `id`. */
  actionUrl: (id: string) => string
  /** Payment endpoints of trade `id` (`…/transactions/{id}/payments`). */
  paymentsUrl: (id: string) => string
  /** Query key of trade `id`'s detail. Its current payment is cached under it, so refreshing the trade refreshes it. */
  tradeKey: (id: string) => unknown[]
  onSuccess: (qc: QueryClient, t: TransactionDetail) => unknown
}

export function useTradeAction(scope: TradeScope, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TradeActionInput) => api<TransactionDetail>(scope.actionUrl(id), { method: 'POST', json: body }),
    onSuccess: (t) => scope.onSuccess(qc, t),
  })
}

const paymentKey = (scope: TradeScope, id: string) => [...scope.tradeKey(id), 'payment']

/** The newest payment attempt (or null); polled every 10 s while pending (trade.updated frames refresh it too). */
export const useCurrentPayment = (scope: TradeScope, id: string) =>
  useQuery({
    queryKey: paymentKey(scope, id),
    queryFn: () => api<Payment | null>(`${scope.paymentsUrl(id)}/current`),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 10_000 : false),
  })

/** Start a payment (cancels a pending one: "Ganti metode") or cancel the pending one. */
export function usePaymentActions(scope: TradeScope, id: string) {
  const qc = useQueryClient()
  const onSuccess = (p: Payment) => qc.setQueryData(paymentKey(scope, id), p)
  return {
    create: useMutation({ mutationFn: (b: PaymentInput) => api<Payment>(scope.paymentsUrl(id), { method: 'POST', json: b }), onSuccess }),
    cancel: useMutation({ mutationFn: () => api<Payment>(`${scope.paymentsUrl(id)}/current/cancel`, { method: 'POST' }), onSuccess }),
  }
}
