import { useEffect, useState } from 'react'


export function useLocalDraft<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial
    try {
      const saved = localStorage.getItem(key)
      return saved ? { ...initial, ...(JSON.parse(saved) as T) } : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // per-session only
    }
  }, [key, value])
  const clear = () => {
    try {
      if (key) localStorage.removeItem(key)
    } catch {
      // nothing saved
    }
  }
  return [value, setValue, clear] as const
}
