import { useEffect, useRef } from 'react'
import type { RealtimeMessage } from '@/domain/types'

// Channel pub/sub (PRD §12.2). Today the mock source in src/mocks/realtime.ts calls `publish`;
// when BE ships, a WebSocket's onmessage calls the same `publish` and nothing else changes.

type Handler<T> = (msg: RealtimeMessage<T>) => void

const listeners = new Map<string, Set<Handler<unknown>>>()

export function publish(msg: RealtimeMessage) {
  listeners.get(msg.channel)?.forEach((h) => h(msg))
}

export function subscribe<T>(channel: string, handler: Handler<T>) {
  const set = listeners.get(channel) ?? new Set()
  set.add(handler as Handler<unknown>)
  listeners.set(channel, set)
  return () => {
    set.delete(handler as Handler<unknown>)
  }
}

/** Subscribe for the component's lifetime; the latest handler is always used. */
export function useChannel<T>(channel: string, handler: Handler<T>) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => subscribe<T>(channel, (m) => ref.current(m)), [channel])
}
