import { useEffect, useRef } from 'react'
import type { RealtimeMessage } from '@/domain/types'




type Handler<T> = (msg: RealtimeMessage<T>) => void

const listeners = new Map<string, Set<Handler<unknown>>>()

export function publish(msg: RealtimeMessage) {
  listeners.get(msg.channel)?.forEach((h) => h(msg))
}

export function subscribe<T>(channel: string, handler: Handler<T>) {
  const set = listeners.get(channel) ?? new Set()
  set.add(handler as Handler<unknown>)
  listeners.set(channel, set)
  if (set.size === 1) socket?.join(channel)
  return () => {
    set.delete(handler as Handler<unknown>)
    if (set.size === 0) {
      listeners.delete(channel)
      socket?.leave(channel)
    }
  }
}


export function useChannel<T>(channel: string | undefined, handler: Handler<T>) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => (channel ? subscribe<T>(channel, (m) => ref.current(m)) : undefined), [channel])
}



interface Frame {
  type: string
  channel?: string
  seq?: number
  payload?: unknown
  ts?: string
  ref?: string
  ok?: boolean
  headSeq?: number
  error?: { code: string; message: string }
}





export type ResyncHandler = (channel: string) => void

class Socket {
  private ws?: WebSocket
  private lastSeq = new Map<string, number>()
  private replaying = new Set<string>()
  private pending = new Map<string, string>()
  private nextId = 0
  private retry = 0
  private timer?: ReturnType<typeof setTimeout>
  private ping?: ReturnType<typeof setInterval>
  private pong?: ReturnType<typeof setTimeout>
  private closed = false

  private onResync: ResyncHandler

  constructor(onResync: ResyncHandler) {
    this.onResync = onResync
    this.open()
  }

  join(channel: string) {
    this.send({ type: 'subscribe', channel, sinceSeq: this.lastSeq.get(channel) }, channel)
  }

  leave(channel: string) {
    this.lastSeq.delete(channel)
    this.replaying.delete(channel)
    this.send({ type: 'unsubscribe', channel })
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    clearInterval(this.ping)
    clearTimeout(this.pong)
    this.ws?.close(1000)
  }

  private send(frame: Record<string, unknown>, channel?: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    const id = String(++this.nextId)
    if (channel) {
      this.pending.set(id, channel)
      if (frame.sinceSeq !== undefined) this.replaying.add(channel)
    }
    this.ws.send(JSON.stringify({ ...frame, id }))
  }

  private open() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/ws`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.pending.clear()
      this.replaying.clear()
      listeners.forEach((_, channel) => this.join(channel))
      clearInterval(this.ping)
      this.ping = setInterval(() => {
        this.send({ type: 'ping' }, 'ping')
        clearTimeout(this.pong)
        this.pong = setTimeout(() => ws.close(4000), 10_000)
      }, 25_000)
    }
    ws.onmessage = (e) => this.receive(JSON.parse(e.data as string) as Frame)
    ws.onclose = (e) => {
      clearInterval(this.ping)
      clearTimeout(this.pong)
      if (this.closed || e.code === 1000 || e.code === 1008) return

      if (e.code === 4401 || e.code === 4403) this.onResync('auth')
      const slow = e.code === 1013 || e.code === 4429
      const delay = Math.max(slow ? 30_000 : 0, Math.min(1000 * 2 ** this.retry++, 30_000)) + Math.random() * 1000
      this.timer = setTimeout(() => this.open(), delay)
    }
  }

  private receive(f: Frame) {
    if (f.type === 'ack') {
      const channel = f.ref ? this.pending.get(f.ref) : undefined
      if (!channel) return
      this.pending.delete(f.ref!)
      if (channel === 'ping') return clearTimeout(this.pong)
      const replayed = this.replaying.delete(channel)
      if (!f.ok) {
        this.lastSeq.delete(channel)
        if (f.error?.code === 'resync_required' && listeners.has(channel)) {
          this.onResync(channel)
          this.join(channel)
        }
        return
      }
      if (f.headSeq !== undefined) this.lastSeq.set(channel, f.headSeq)

      if (!replayed) this.onResync(channel)
      return
    }
    if (!f.channel || f.type === 'error') return
    if (f.seq !== undefined) {
      if (this.replaying.has(f.channel) && !this.isReplayFrame(f)) return
      const last = this.lastSeq.get(f.channel)
      if (last !== undefined && f.seq <= last) return
      if (last !== undefined && f.seq > last + 1) {
        this.join(f.channel)
        return
      }
      this.lastSeq.set(f.channel, f.seq)
    }
    publish({ channel: f.channel, type: f.type, payload: f.payload, ts: f.ts ?? new Date().toISOString() })
  }


  private isReplayFrame(f: Frame) {
    return f.seq === (this.lastSeq.get(f.channel!) ?? -1) + 1
  }
}

let socket: Socket | undefined


export function resetRealtime(onResync: ResyncHandler) {
  socket?.close()
  socket = new Socket(onResync)
  return () => {
    socket?.close()
    socket = undefined
  }
}
