import { QueryClient } from '@tanstack/react-query'
import type { ApiErrorBody } from '@/domain/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>

  constructor(status: number, body?: Partial<ApiErrorBody>) {
    super(body?.error?.message ?? `Request failed (${status})`)
    this.status = status
    this.code = body?.error?.code ?? 'unknown'
    this.fields = body?.error?.fields
  }
}

/** A field-level message from `error.fields`, for showing under that input. */
export const fieldError = (error: unknown, name: string) => (error instanceof ApiError ? error.fields?.[name] : undefined)

let backendReady: Promise<unknown> = Promise.resolve()

/** Requests wait for this (the mock service worker while it boots) instead of blocking the first render. */
export function waitForBackend(p: Promise<unknown>) {
  backendReady = p
}

/** The only place that calls fetch. Session rides on an httpOnly cookie (PRD §13). */
export async function api<T>(path: string, init: Omit<RequestInit, 'body'> & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  await backendReady
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...rest,
    headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => undefined))
  return res.status === 204 ? (undefined as T) : res.json()
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx won't fix itself; retry the rest twice.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})
