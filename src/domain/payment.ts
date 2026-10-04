



export type PaymentMethod = 'bank_transfer' | 'echannel' | 'qris' | 'gopay' | 'shopeepay'
export type VaBank = 'bca' | 'bni' | 'bri' | 'permata' | 'cimb'
export type PaymentStatus = 'pending' | 'settlement' | 'expire' | 'cancel' | 'deny' | 'failure'

export interface PaymentInput {
  method: PaymentMethod

  bank?: VaBank
}

export interface Payment {
  id: string
  transactionId: string

  orderId: string
  method: PaymentMethod

  bank?: VaBank | 'mandiri'

  amountIdr: number
  status: PaymentStatus
  vaNumber?: string
  billerCode?: string
  billKey?: string

  qrUrl?: string

  deeplinkUrl?: string
  expiresAt: string
  createdAt: string
  paidAt?: string
}


export const PAYMENT_OPTIONS: { key: string; label: string; group: 'va' | 'instant'; input: PaymentInput }[] = [
  ...(['bca', 'bni', 'bri', 'permata', 'cimb'] as const).map((bank) => ({
    key: bank, label: { bca: 'BCA', bni: 'BNI', bri: 'BRI', permata: 'Permata', cimb: 'CIMB Niaga' }[bank], group: 'va' as const,
    input: { method: 'bank_transfer' as const, bank },
  })),
  { key: 'mandiri', label: 'Mandiri', group: 'va', input: { method: 'echannel' } },
  { key: 'qris', label: 'QRIS', group: 'instant', input: { method: 'qris' } },
  { key: 'gopay', label: 'GoPay', group: 'instant', input: { method: 'gopay' } },
  { key: 'shopeepay', label: 'ShopeePay', group: 'instant', input: { method: 'shopeepay' } },
]


export const paymentExpiryMs = (method: PaymentMethod) => (method === 'bank_transfer' || method === 'echannel' ? 24 * 3_600_000 : 15 * 60_000)

export function paymentLabel(p: Pick<Payment, 'method' | 'bank'>) {
  if (p.method === 'bank_transfer') return `VA ${PAYMENT_OPTIONS.find((o) => o.key === p.bank)?.label ?? p.bank?.toUpperCase()}`
  return { echannel: 'Mandiri Bill', qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay' }[p.method]
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Menunggu pembayaran', settlement: 'Pembayaran diterima', expire: 'Pembayaran kedaluwarsa',
  cancel: 'Pembayaran dibatalkan', deny: 'Pembayaran ditolak', failure: 'Pembayaran gagal',
}


export const paymentOpen = (p: Payment | null | undefined, now = Date.now()) =>
  !!p && p.status === 'pending' && new Date(p.expiresAt).getTime() > now


export function howToPay(p: Payment): string[] {
  const va = p.vaNumber ?? ''
  const vaSteps = (app: string, menu: string) => [`Buka ${app}`, `Pilih ${menu}`, `Masukkan nomor ${va}`, 'Periksa nama dan jumlah, lalu konfirmasi dengan PIN']
  switch (p.method) {
    case 'bank_transfer':
      return {
        bca: vaSteps('BCA mobile, KlikBCA, atau ATM BCA', 'm-Transfer → BCA Virtual Account'),
        bni: vaSteps('BNI Mobile Banking atau ATM BNI', 'Transfer → Virtual Account Billing'),
        bri: vaSteps('BRImo atau ATM BRI', 'Pembayaran → BRIVA'),
        permata: vaSteps('PermataMobile X atau ATM Permata', 'Pembayaran Tagihan → Virtual Account'),
        cimb: vaSteps('OCTO Mobile atau ATM CIMB Niaga', 'Transfer → Virtual Account'),
      }[p.bank as VaBank] ?? vaSteps('aplikasi bank kamu', 'Transfer → Virtual Account')
    case 'echannel':
      return ["Buka Livin' by Mandiri atau ATM Mandiri", `Pilih Bayar → Multipayment → Midtrans (kode ${p.billerCode ?? ''})`, `Masukkan kode bayar ${p.billKey ?? ''}`, 'Periksa jumlah, lalu konfirmasi dengan PIN']
    case 'qris':
      return ['Buka aplikasi bank atau e-wallet yang mendukung QRIS', 'Pindai kode QR di atas', 'Periksa jumlah, lalu bayar']
    case 'gopay':
      return ['Pindai kode QR dengan aplikasi Gojek atau GoPay, atau tekan Buka GoPay di HP', 'Periksa jumlah, lalu bayar dengan PIN']
    case 'shopeepay':
      return ['Tekan Buka ShopeePay di HP yang terpasang aplikasi Shopee', 'Periksa jumlah, lalu bayar dengan PIN']
  }
}
