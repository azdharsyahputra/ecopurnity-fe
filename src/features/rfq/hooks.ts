import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useChannel } from '@/lib/realtime'
import type { Conversation, Quote, Rfq, TradeParty } from '@/domain/types'
import type { QuoteAction } from '@/domain/rfq'

// RFQ + conversations (PRD F6). Keys start with 'me' so live notifications refresh them.

export type RfqView = Rfq & { side: 'buyer' | 'supplier' }
export type NewRfq = Pick<Rfq, 'item' | 'categoryId' | 'quantity' | 'targetPriceIdr' | 'deadline' | 'location' | 'spec' | 'source'> & {
  inviteUserIds?: string[]
  inviteNames?: string[]
}

const json = (method: string, body?: unknown) => ({ method, json: body })

export const useRfqs = (side: 'buyer' | 'supplier') =>
  useQuery({ queryKey: ['me', 'rfqs', side], queryFn: () => api<RfqView[]>(`/me/rfqs?side=${side}`), refetchInterval: 8_000 })

export const useRfq = (id: string) =>
  useQuery({ queryKey: ['me', 'rfqs', 'detail', id], queryFn: () => api<RfqView>(`/me/rfqs/${id}`), refetchInterval: 5_000 })

function useInvalidateRfq() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['me', 'rfqs'] }), qc.invalidateQueries({ queryKey: ['me', 'transactions'] }), qc.invalidateQueries({ queryKey: ['me', 'conversations'] })])
}

export function useCreateRfq() {
  const invalidate = useInvalidateRfq()
  return useMutation({ mutationFn: (input: NewRfq) => api<RfqView>('/me/rfqs', json('POST', input)), onSuccess: invalidate })
}

export function useRfqAction(id: string) {
  const invalidate = useInvalidateRfq()
  return useMutation({
    mutationFn: (
      a:
        | { type: 'quote'; quote: Pick<Quote, 'priceIdr' | 'quantity' | 'leadTimeDays' | 'terms' | 'note'> }
        | { type: 'action'; quoteId: string; action: QuoteAction; priceIdr?: number; note?: string }
        | { type: 'close' },
    ) =>
      a.type === 'quote'
        ? api<RfqView>(`/me/rfqs/${id}/quotes`, json('POST', a.quote))
        : a.type === 'close'
          ? api<RfqView>(`/me/rfqs/${id}/close`, json('POST'))
          : api<RfqView>(`/me/rfqs/${id}/quotes/${a.quoteId}/actions`, json('POST', { action: a.action, priceIdr: a.priceIdr, note: a.note })),
    onSuccess: invalidate,
  })
}

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'
type Message = Conversation['messages'][number]

// Against the API, threads update live from `conversation:{id}`; the mock has no chat feed, so it polls.
export const useConversations = () =>
  useQuery({ queryKey: ['me', 'conversations'], queryFn: () => api<Conversation[]>('/me/conversations'), refetchInterval: MOCKS ? 10_000 : 30_000 })

export function useConversation(id: string) {
  const qc = useQueryClient()
  useChannel<Message>(id ? `conversation:${id}` : undefined, ({ type, payload: m }) => {
    if (type !== 'message.created') return
    qc.setQueryData<Conversation>(['me', 'conversations', id], (c) =>
      c && !c.messages.some((x) => x.id === m.id) ? { ...c, messages: [...c.messages, m], updatedAt: m.at } : c,
    )
    qc.invalidateQueries({ queryKey: ['me', 'conversations'], exact: true })
  })
  return useQuery({
    queryKey: ['me', 'conversations', id],
    queryFn: () => api<Conversation>(`/me/conversations/${id}`),
    refetchInterval: MOCKS ? 4_000 : false,
    enabled: !!id,
  })
}

export function useSendMessage(id: string) {
  const qc = useQueryClient()
  return useMutation({
    // clientMsgId makes a retried send idempotent on the server.
    mutationFn: (text: string) => api<Conversation>(`/me/conversations/${id}/messages`, json('POST', { text, clientMsgId: crypto.randomUUID() })),
    onSuccess: (c) => {
      qc.setQueryData(['me', 'conversations', id], c)
      qc.invalidateQueries({ queryKey: ['me', 'conversations'], exact: true })
    },
  })
}

export function useStartConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { subject: string; with: TradeParty; link?: Conversation['link']; text?: string }) => api<Conversation>('/me/conversations', json('POST', b)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'conversations'] }),
  })
}
