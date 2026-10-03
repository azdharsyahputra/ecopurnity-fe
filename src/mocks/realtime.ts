import { publish } from '@/lib/realtime'
import type { ActivityEvent, AuctionDetail, AuctionEvent } from '@/domain/types'
import { db, makeActivity } from './db'
import { economy } from './economy'
import { onAuctionClosed, onCompetitorBid } from './personalHandlers'
import { savePersonal } from './personal'

// Fake event source standing in for the WebSocket server.
// ponytail: random but plausible bidding on a timer; scripted scenarios come if QA needs repeatable runs.

const now = () => new Date().toISOString()
const jitter = (n: number) => Math.round(n * (Math.random() * 0.02 - 0.005))
const isLive = (a: AuctionDetail) => a.status === 'live' || a.status === 'extended'

// ponytail: extension cap lives in the mock only; the BE should expose it as an auction rule.
const MAX_EXTENSIONS = 3
const extensions = new Map<string, number>()

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
  const base = economy.bestPrice.get(a.id) ?? a.currentPriceIdr ?? a.openingPriceIdr
  // Sealed bids aren't bound by the step; they just land somewhere sensible.
  const price = a.type === 'sealed' ? Math.round(a.openingPriceIdr * (0.85 + Math.random() * 0.12)) : base + dir * steps * Math.max(a.minStepIdr, 1)
  // Bots have a walk-away price: 25% below opening in procurement, 25% above in selling.
  if (a.type !== 'sealed' && (dir < 0 ? price < a.openingPriceIdr * 0.75 : price > a.openingPriceIdr * 1.25)) return
  if (a.type !== 'sealed' || price < base) economy.bestPrice.set(a.id, a.type === 'sealed' ? Math.min(base, price) : price)
  if (economy.owners.has(a.id)) savePersonal()
  a.bidCount++
  if (Math.random() < (a.participants < 4 ? 0.7 : 0.15)) a.participants++ // new auctions fill up fast
  const hidden = a.visibility !== 'full'
  if (!hidden) a.currentPriceIdr = price

  const bid = { id: `${a.id}-live-${a.bidCount}`, bidder: `${a.type === 'reverse' ? 'Supplier' : 'Bidder'} ${1 + Math.floor(Math.random() * a.participants)}`, priceIdr: price, at: now() }
  if (!hidden) a.bids = [bid, ...a.bids].slice(0, 30)
  if (a.type !== 'sealed') onCompetitorBid(a.id, price)
  auctionEvent(a, {
    kind: 'bid',
    bid: hidden ? { ...bid, priceIdr: 0 } : bid,
    currentPriceIdr: a.currentPriceIdr,
    bidCount: a.bidCount,
    participants: a.participants,
  })

  const left = new Date(a.endsAt).getTime() - Date.now()
  const used = extensions.get(a.id) ?? 0
  if (left < a.extension.windowMinutes * 60_000 && used < MAX_EXTENSIONS) {
    extensions.set(a.id, used + 1)
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
    onAuctionClosed(a.id)
    if (economy.owners.has(a.id)) savePersonal()
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
