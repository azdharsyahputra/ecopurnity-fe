import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TransactionDetail } from '@/domain/types'
import type { TradeActionInput } from '@/domain/trade'

// One F6 trade UI for both workspaces: the personal and org pages pass a scope saying where actions go
// and which caches to refresh.

export interface TradeScope {
  /** POST endpoint for an action on trade `id`. */
  actionUrl: (id: string) => string
  onSuccess: (qc: QueryClient, t: TransactionDetail) => unknown
}

export function useTradeAction(scope: TradeScope, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TradeActionInput) => api<TransactionDetail>(scope.actionUrl(id), { method: 'POST', json: body }),
    onSuccess: (t) => scope.onSuccess(qc, t),
  })
}
