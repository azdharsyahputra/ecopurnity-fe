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


export const fieldError = (error: unknown, name: string) => (error instanceof ApiError ? error.fields?.[name] : undefined)

let backendReady: Promise<unknown> = Promise.resolve()


export function waitForBackend(p: Promise<unknown>) {
  backendReady = p
}


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

  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,

      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})


export const qs = (params: object) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]),
  ).toString()
  return s ? `?${s}` : ''
}
