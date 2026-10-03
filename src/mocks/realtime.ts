import { publish } from '@/lib/realtime'
import { db, makeActivity } from './db'

// Fake event source standing in for the WebSocket server.
// ponytail: fixed intervals; per-channel scenarios (e.g. a scripted auction) get added with the features that need them.

const now = () => new Date().toISOString()
const jitter = (n: number) => Math.round(n * (Math.random() * 0.02 - 0.005))

export function startMockRealtime() {
  setInterval(() => {
    const s = db.stats
    s.activeParticipants += jitter(s.activeParticipants)
    s.transactionVolumeIdr += Math.round(Math.random() * 40_000_000)
    publish({ channel: 'public:stats', type: 'stats.updated', payload: { ...s }, ts: now() })
  }, 5_000)

  setInterval(() => {
    const event = makeActivity()
    db.activity.unshift(event)
    db.activity.length = Math.min(db.activity.length, 50)
    publish({ channel: 'public:activity', type: 'activity.created', payload: event, ts: now() })
  }, 7_000)
}
