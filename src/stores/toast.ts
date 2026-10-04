import { create } from 'zustand'
import type { Tone } from '@/domain/status'

export interface Toast {
  id: number
  title: string
  body?: string
  tone?: Tone
  href?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let next = 0


export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++next
    set({ toasts: [...get().toasts, { ...t, id }].slice(-3) })
    setTimeout(() => get().dismiss(id), 6_000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t)
