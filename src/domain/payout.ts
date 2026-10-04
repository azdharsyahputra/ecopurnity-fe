


export function payoutDueAt(requestedAt: string) {
  const t = new Date(requestedAt).getTime()
  const dow = new Date(t + 7 * 3_600_000).getUTCDay()
  const days = dow === 5 ? 3 : dow === 6 ? 2 : 1
  return new Date(t + days * 86_400_000).toISOString()
}


export const normName = (s: string) => s.toUpperCase().split(/[^\p{L}]+/u).filter(Boolean).join(' ')
