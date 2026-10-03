export { cn } from "cn"

/** Only same-site paths, never `//evil.com` (open redirect). */
export function safeReturnTo(raw: string | null, fallback = '/app') {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
}
