export { cn } from "cn"


export function safeReturnTo(raw: string | null, fallback = '/app') {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
}
