import type { TransactionStatus } from './status'

// Transaction state machine (PRD §8.9). Shared by the UI (which buttons to show)
// and the mock API (which requests to accept); the BE should enforce the same table.

export type TransactionAction = 'issue_invoice' | 'pay' | 'ship' | 'upload_proof' | 'confirm_receipt' | 'cancel' | 'dispute'
export type Role = 'buyer' | 'supplier'

const FLOW: Record<TransactionAction, { from: TransactionStatus[]; by: Role[]; to: TransactionStatus }> = {
  issue_invoice: { from: ['agreement'], by: ['supplier'], to: 'invoiced' },
  pay: { from: ['invoiced'], by: ['buyer'], to: 'paid' },
  ship: { from: ['paid'], by: ['supplier'], to: 'fulfilling' },
  upload_proof: { from: ['fulfilling'], by: ['supplier'], to: 'delivered' },
  confirm_receipt: { from: ['delivered'], by: ['buyer'], to: 'completed' },
  cancel: { from: ['agreement', 'invoiced'], by: ['buyer', 'supplier'], to: 'cancelled' },
  dispute: { from: ['paid', 'fulfilling', 'delivered'], by: ['buyer', 'supplier'], to: 'disputed' },
}

export const ACTION_LABEL: Record<TransactionAction, string> = {
  issue_invoice: 'Terbitkan invoice',
  pay: 'Bayar ke escrow',
  ship: 'Tandai dikirim',
  upload_proof: 'Unggah bukti kirim',
  confirm_receipt: 'Konfirmasi diterima',
  cancel: 'Batalkan',
  dispute: 'Ajukan dispute',
}

/** Happy path, in order, for the timeline. */
export const TIMELINE: TransactionStatus[] = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'completed']

export function allowedActions(status: TransactionStatus, role: Role): TransactionAction[] {
  return (Object.keys(FLOW) as TransactionAction[]).filter((a) => FLOW[a].from.includes(status) && FLOW[a].by.includes(role))
}

/** Next status, or null when the action isn't allowed for this role right now. */
export function transition(status: TransactionStatus, role: Role, action: TransactionAction): TransactionStatus | null {
  return allowedActions(status, role).includes(action) ? FLOW[action].to : null
}
