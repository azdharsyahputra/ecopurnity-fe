export type TransactionStatus =
  | 'AGREEMENT'
  | 'ESCROW_LOCKED'
  | 'IN_FULFILLMENT'
  | 'PROOF_SUBMITTED'
  | 'COMPLETED'
  | 'DISPUTED'

export interface InvoiceItem {
  supplierId: string
  supplierName: string
  quantity: number
  unit: string
  unitPriceIdr: number
  subtotalIdr: number
}

export interface Transaction {
  id: string
  title: string
  category: string
  role: 'BUYER' | 'SUPPLIER'
  status: TransactionStatus
  totalValueIdr: number
  totalQuantity: number
  unit: string
  counterpartyName: string
  counterpartyCount?: number // for collective
  createdAt: string
  updatedAt: string
  deadline: string
  invoiceItems: InvoiceItem[]
  proofUrl?: string
  savingsIdr?: number
}
