import { publish } from '@/lib/realtime'
import type { ActivityEvent, AuctionDetail, AuctionEvent } from '@/domain/types'
import { db, makeActivity } from './db'
import { economy } from './economy'

// Fake event source standing in for the WebSocket server.
// ponytail: random but plausible bidding on a timer; scripted scenarios come if QA needs repeatable runs.

const now = () => new Date().toISOString()
const jitter = (n: number) => Math.round(n * (Math.random() * 0.02 - 0.005))
const isLive = (a: AuctionDetail) => a.status === 'live' || a.status === 'extended'

function emitActivity(event: ActivityEvent) {
  db.activity.unshift(event)
  db.activity.length = Math.min(db.activity.length, 50)
  publish({ channel: 'public:activity', type: 'activity.created', payload: event, ts: now() })
}

function auctionEvent(a: AuctionDetail, payload: AuctionEvent) {
  publish({ channel: `auction:${a.id}`, type: `auction.${payload.kind}`, payload, ts: now() })
}

/** One competitive bid on a random live auction; extends the clock inside the extension window. */
function bidTick() {
  const live = economy.auctions.filter((a) => isLive(a) && a.type !== 'dutch')
  const a = live[Math.floor(Math.random() * live.length)]
  if (!a) return

  const dir = a.type === 'forward' ? 1 : -1
  const steps = 1 + Math.floor(Math.random() * 3)
  const price = (a.currentPriceIdr ?? a.openingPriceIdr) + dir * steps * Math.max(a.minStepIdr, 1)
  a.bidCount++
  if (Math.random() < 0.15) a.participants++
  const hidden = a.visibility !== 'full'
  if (!hidden) a.currentPriceIdr = price

  const bid = { id: `${a.id}-live-${a.bidCount}`, bidder: `${a.type === 'reverse' ? 'Supplier' : 'Bidder'} ${1 + Math.floor(Math.random() * a.participants)}`, priceIdr: price, at: now() }
  if (!hidden) a.bids = [bid, ...a.bids].slice(0, 30)
  auctionEvent(a, {
    kind: 'bid',
    bid: hidden ? { ...bid, priceIdr: 0 } : bid,
    currentPriceIdr: a.currentPriceIdr,
    bidCount: a.bidCount,
    participants: a.participants,
  })

  const left = new Date(a.endsAt).getTime() - Date.now()
  if (left < a.extension.windowMinutes * 60_000) {
    a.endsAt = new Date(new Date(a.endsAt).getTime() + a.extension.extendMinutes * 60_000).toISOString()
    a.status = 'extended'
    auctionEvent(a, { kind: 'extended', endsAt: a.endsAt })
  }

  if (Math.random() < 0.35) {
    emitActivity({ ...makeActivity(), type: 'bid_placed', title: `Bid baru di auction ${a.title}`, amountIdr: hidden ? undefined : price * a.lot.quantity.value })
  }
}

/** Dutch auctions step their ask down until someone accepts (no acceptances in the mock yet). */
function dutchTick() {
  for (const a of economy.auctions.filter((x) => isLive(x) && x.type === 'dutch')) {
    a.currentPriceIdr = Math.max((a.currentPriceIdr ?? a.openingPriceIdr) - a.minStepIdr, Math.round(a.openingPriceIdr * 0.8))
    auctionEvent(a, { kind: 'price', currentPriceIdr: a.currentPriceIdr })
  }
}

function closeTick() {
  for (const a of economy.auctions.filter(isLive)) {
    if (new Date(a.endsAt).getTime() > Date.now()) continue
    a.status = 'closed'
    auctionEvent(a, { kind: 'closed', status: a.status })
    emitActivity({ ...makeActivity(), type: 'auction_closed', title: `Auction ditutup: ${a.title}` })
  }
}

export function startMockRealtime() {
  setInterval(() => {
    const s = db.stats
    s.activeParticipants += jitter(s.activeParticipants)
    s.transactionVolumeIdr += Math.round(Math.random() * 40_000_000)
    publish({ channel: 'public:stats', type: 'stats.updated', payload: { ...s }, ts: now() })
  }, 5_000)

  setInterval(() => emitActivity(makeActivity()), 9_000)
  setInterval(bidTick, 3_500)
  setInterval(dutchTick, 10_000)
  setInterval(closeTick, 1_000)
}
