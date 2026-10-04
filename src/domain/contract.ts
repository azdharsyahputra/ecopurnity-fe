import type { PaymentTerms, TradeParty } from './types'




export type ContractEvery = 'weekly' | 'biweekly' | 'monthly'
export type ContractStatus = 'proposed' | 'active' | 'paused' | 'ended' | 'declined'
export type ContractAction = 'accept' | 'decline' | 'pause' | 'resume' | 'end' | 'run_now'

export const EVERY: Record<ContractEvery, string> = { weekly: 'Tiap minggu', biweekly: 'Tiap 2 minggu', monthly: 'Tiap bulan' }

export interface Contract {
  id: string
  code: string
  item: string
  buyer: TradeParty
  supplier: TradeParty
  quantity: { value: number; unit: string }
  unitPriceIdr: number
  terms: PaymentTerms
  every: ContractEvery

  runs: number
  nextAt: string
  status: ContractStatus

  proposedBy: 'buyer' | 'supplier'
  sourceTxId?: string

  orders: { at: string; buyerTxId?: string; supplierTxId?: string }[]
  createdAt: string
}

export function nextRun(fromIso: string, every: ContractEvery): string {
  const d = new Date(fromIso)
  if (every === 'monthly') d.setMonth(d.getMonth() + 1)
  else d.setDate(d.getDate() + (every === 'weekly' ? 7 : 14))
  return d.toISOString()
}


export function contractActions(c: Pick<Contract, 'status' | 'proposedBy'>, side: 'buyer' | 'supplier'): ContractAction[] {
  switch (c.status) {
    case 'proposed':
      return side === c.proposedBy ? ['end'] : ['accept', 'decline']
    case 'active':
      return side === 'buyer' ? ['run_now', 'pause', 'end'] : ['pause', 'end']
    case 'paused':
      return ['resume', 'end']
    default:
      return []
  }
}

export function contractTransition(status: ContractStatus, action: ContractAction): ContractStatus | null {
  const to: Partial<Record<ContractAction, [ContractStatus[], ContractStatus]>> = {
    accept: [['proposed'], 'active'], decline: [['proposed'], 'declined'], pause: [['active'], 'paused'],
    resume: [['paused'], 'active'], end: [['proposed', 'active', 'paused'], 'ended'], run_now: [['active'], 'active'],
  }
  const t = to[action]
  return t && t[0].includes(status) ? t[1] : null
}
