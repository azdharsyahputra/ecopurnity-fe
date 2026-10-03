import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Award, BellRing, CreditCard, Gavel, Sparkles, Store, Timer, TrendingDown, Truck, type LucideIcon } from 'lucide-react'
import { useChannel } from '@/lib/realtime'
import { toast } from '@/stores/toast'
import type { AppNotification, NotificationType } from '@/domain/types'
import type { Tone } from '@/domain/status'

export const NOTIFICATION_TONE: Record<NotificationType, Tone> = {
  opportunity_detected: 'lime', new_market: 'teal', auction_invitation: 'blue', outbid: 'red', winning_bid: 'green',
  auction_ending: 'orange', transaction_update: 'blue', payment: 'purple', delivery: 'teal', reputation_update: 'yellow',
}

export const NOTIFICATION_META: Record<NotificationType, [LucideIcon, string]> = {
  opportunity_detected: [Sparkles, 'Opportunity terdeteksi'],
  new_market: [Store, 'Market baru'],
  auction_invitation: [Gavel, 'Undangan auction'],
  outbid: [TrendingDown, 'Tersalip (outbid)'],
  winning_bid: [Award, 'Menang bid'],
  auction_ending: [Timer, 'Auction berakhir'],
  transaction_update: [BellRing, 'Update transaksi'],
  payment: [CreditCard, 'Pembayaran'],
  delivery: [Truck, 'Pengiriman'],
  reputation_update: [Award, 'Update reputasi'],
}

/** Handles `user:{id}`: notifications become toasts; bid and trade changes refresh what they touch. */
export function useLiveNotifications(userId: string | undefined) {
  const qc = useQueryClient()
  useChannel<unknown>(userId ? `user:${userId}` : undefined, ({ type, payload }) => {
    switch (type) {
      case 'notification.created': {
        const n = payload as AppNotification
        qc.invalidateQueries({ queryKey: ['me'] })
        // Role changes (market maker approval) arrive as notifications; refresh the account so the switcher follows.
        qc.invalidateQueries({ queryKey: ['auth', 'me'] })
        toast({ title: n.title, body: n.body, href: n.href, tone: NOTIFICATION_TONE[n.type] })
        return
      }
      case 'bid.status':
        qc.invalidateQueries({ queryKey: ['me', 'auction', (payload as { auctionId: string }).auctionId] })
        qc.invalidateQueries({ queryKey: ['me', 'auctions'] })
        return
      case 'trade.updated':
        qc.invalidateQueries({ queryKey: ['me', 'transactions'] })
        qc.invalidateQueries({ queryKey: ['org'] })
    }
  })
}

/** What to refetch when a channel's frames may have been missed (see lib/realtime). */
export function resyncQueries(qc: QueryClient, channel: string) {
  const [kind, id] = channel.split(':')
  const keys: Record<string, unknown[][]> = {
    auth: [['auth', 'me']],
    public: [['public']],
    user: [['me'], ['org']],
    auction: [['auctions', 'detail', id], ['me', 'auction', id]],
    conversation: [['me', 'conversations', id]],
  }
  for (const queryKey of keys[kind] ?? []) qc.invalidateQueries({ queryKey })
}
