import { useQueryClient } from '@tanstack/react-query'
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

/** Pushes `user:{id}:notifications` into a toast and refreshes the workspace data it touches. */
export function useLiveNotifications(userId: string | undefined) {
  const qc = useQueryClient()
  useChannel<AppNotification>(`user:${userId ?? 'none'}:notifications`, ({ payload: n }) => {
    qc.invalidateQueries({ queryKey: ['me'] })
    toast({ title: n.title, body: n.body, href: n.href, tone: NOTIFICATION_TONE[n.type] })
  })
}
