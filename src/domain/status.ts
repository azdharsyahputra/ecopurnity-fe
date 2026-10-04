


export type Tone = 'gray' | 'teal' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'pink' | 'lime'

type Meta = readonly [label: string, tone: Tone, live?: true]

export const STATUS = {
  supply: {
    available: ['Tersedia', 'blue'],
    reserved: ['Dipesan', 'yellow'],
    in_market: ['Di market', 'teal'],
    sold: ['Terjual', 'green'],
    expired: ['Kedaluwarsa', 'gray'],
  },
  demand: {
    open: ['Terbuka', 'blue'],
    matched: ['Cocok', 'purple'],
    in_market: ['Di market', 'teal'],
    fulfilled: ['Terpenuhi', 'green'],
    expired: ['Kedaluwarsa', 'gray'],
    cancelled: ['Dibatalkan', 'gray'],
  },
  opportunity: {
    detected: ['Terdeteksi', 'lime'],
    forming: ['Sedang dibentuk', 'yellow'],
    market_live: ['Market aktif', 'teal'],
    dismissed: ['Dikesampingkan', 'gray'],
    closed: ['Ditutup', 'gray'],
  },
  market: {
    draft: ['Draf', 'gray'],
    formation: ['Pembentukan', 'yellow'],
    active: ['Aktif', 'green'],
    paused: ['Dijeda', 'orange'],
    closed: ['Ditutup', 'gray'],
    suspended: ['Ditangguhkan', 'red'],
  },
  auction: {
    scheduled: ['Terjadwal', 'gray'],
    qualification: ['Kualifikasi', 'blue'],
    live: ['Berlangsung', 'lime', true],]
    extended: ['Diperpanjang', 'lime', true],
    closed: ['Ditutup', 'gray'],
    awarded: ['Pemenang ditetapkan', 'green'],
    cancelled: ['Dibatalkan', 'gray'],
    frozen: ['Dibekukan', 'red'],
  },
  bid: {
    draft: ['Draf', 'gray'],
    submitted: ['Diajukan', 'blue'],
    leading: ['Unggul', 'green'],
    outbid: ['Terlampaui', 'orange'],
    won: ['Menang', 'green'],
    lost: ['Kalah', 'gray'],
    withdrawn: ['Ditarik', 'gray'],
  },
  transaction: {
    agreement: ['Perjanjian', 'blue'],
    invoiced: ['Ditagih', 'blue'],
    paid: ['Dibayar', 'teal'],
    fulfilling: ['Dalam pengiriman', 'purple'],
    delivered: ['Terkirim', 'teal'],
    accepted: ['Diterima', 'teal'],
    completed: ['Selesai', 'green'],
    cancelled: ['Dibatalkan', 'gray'],
    disputed: ['Dalam sengketa', 'red'],
  },
  qualification: {
    not_started: ['Belum kualifikasi', 'gray'],
    pending: ['Menunggu peninjauan', 'yellow'],
    qualified: ['Terkualifikasi', 'green'],
    rejected: ['Ditolak', 'red'],
  },
  dispute: {
    open: ['Terbuka', 'orange'],
    evidence: ['Bukti', 'yellow'],
    review: ['Ditinjau', 'blue'],
    resolved: ['Diselesaikan', 'green'],
  },
} as const satisfies Record<string, Record<string, Meta>>

export type Entity = keyof typeof STATUS
export type StatusOf<E extends Entity> = keyof (typeof STATUS)[E] & string

export type SupplyStatus = StatusOf<'supply'>
export type DemandStatus = StatusOf<'demand'>
export type OpportunityStatus = StatusOf<'opportunity'>
export type MarketStatus = StatusOf<'market'>
export type AuctionStatus = StatusOf<'auction'>
export type BidStatus = StatusOf<'bid'>
export type TransactionStatus = StatusOf<'transaction'>
export type DisputeStatus = StatusOf<'dispute'>
export type QualificationStatus = StatusOf<'qualification'>

export function statusMeta<E extends Entity>(entity: E, status: StatusOf<E>) {
  const [label, tone, live] = (STATUS[entity] as Record<string, Meta>)[status]
  return { label, tone, live: live === true }
}
