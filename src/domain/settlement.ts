

export interface Member {
  id: string

  quantity: number
}





export function splitProRata(total: number, members: Member[]): { id: string; quantity: number; share: number }[] {
  const pool = members.reduce((s, m) => s + Math.max(0, m.quantity), 0)
  if (pool <= 0 || total <= 0) return members.map((m) => ({ id: m.id, quantity: 0, share: 0 }))
  const exact = members.map((m) => (Math.max(0, m.quantity) / pool) * total)
  const base = exact.map(Math.floor)
  let left = Math.round(total) - base.reduce((s, x) => s + x, 0)
  const order = exact.map((_, i) => i).sort((a, b) => exact[b] - base[b] - (exact[a] - base[a]) || members[b].quantity - members[a].quantity)
  for (const i of order) {
    if (left <= 0) break
    base[i]++
    left--
  }
  return members.map((m, i) => ({ id: m.id, quantity: base[i], share: base[i] / Math.round(total) }))
}





export function membersForLot(lotQty: number, contributions: Member[], fillers: string[]): Member[] {
  const contributed = contributions.reduce((s, m) => s + m.quantity, 0)
  const rest = Math.max(0, lotQty - contributed)
  const each = fillers.length ? rest / fillers.length : 0
  return [...contributions, ...(each > 0 ? fillers.map((id) => ({ id, quantity: each })) : [])]
}





export function splitPool<M extends { quantity: number }>(members: M[], lotQty: number, priceIdr: number) {
  const split = splitProRata(lotQty, members.map((m, i) => ({ id: String(i), quantity: m.quantity })))
  return members.map((m, i) => ({ ...m, quantity: split[i].quantity, share: split[i].share, amountIdr: split[i].quantity * priceIdr }))
}

export interface Settlement {
  auctionId: string
  title: string
  side: 'procurement' | 'selling'
  unit: string
  lotQty: number
  priceIdr: number
  winner: string

  lines: { memberId: string; member: string; userId?: string; orgId?: string; quantity: number; share: number; amountIdr: number }[]
  settled: { at: string; trades: number; by: string } | null
}
