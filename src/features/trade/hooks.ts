import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TransactionDetail } from '@/domain/types'
import type { TradeActionInput } from '@/domain/trade'
import type { Payment, PaymentInput } from '@/domain/payment'




export interface TradeScope {

  actionUrl: (id: string) => string

  paymentsUrl: (id: string) => string

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


export const useCurrentPayment = (scope: TradeScope, id: string) =>
  useQuery({
    queryKey: paymentKey(scope, id),
    queryFn: () => api<Payment | null>(`${scope.paymentsUrl(id)}/current`),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 10_000 : false),
  })


export function usePaymentActions(scope: TradeScope, id: string) {
  const qc = useQueryClient()
  const onSuccess = (p: Payment) => qc.setQueryData(paymentKey(scope, id), p)
  return {
    create: useMutation({ mutationFn: (b: PaymentInput) => api<Payment>(scope.paymentsUrl(id), { method: 'POST', json: b }), onSuccess }),
    cancel: useMutation({ mutationFn: () => api<Payment>(`${scope.paymentsUrl(id)}/current/cancel`, { method: 'POST' }), onSuccess }),
  }
}
