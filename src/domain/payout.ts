// Manual payouts (admin /admin/withdrawals). Same rules as the API (internal/server/payouts.go).

/** One working day after the request, in WIB: Friday to Sunday requests are due Monday (no holiday calendar). */
export function payoutDueAt(requestedAt: string) {
  const t = new Date(requestedAt).getTime()
  const dow = new Date(t + 7 * 3_600_000).getUTCDay() // 0 = Sunday, in WIB
  const days = dow === 5 ? 3 : dow === 6 ? 2 : 1
  return new Date(t + days * 86_400_000).toISOString()
}

/** Holder vs KTP name: letters only, case and spacing ignored. */
export const normName = (s: string) => s.toUpperCase().split(/[^\p{L}]+/u).filter(Boolean).join(' ')
