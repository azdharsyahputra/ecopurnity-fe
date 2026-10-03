import type { TransactionDetail } from '@/domain/types'
import type { AuctionStatus, MarketStatus, TransactionStatus } from '@/domain/status'
import type {
  AccountStatus, DisputeCase, DisputeParty, Evidence, FraudAlert, MarketFlag, UserReport, VerificationRequest,
} from '@/features/admin/types'
import { economy } from './economy'

// Governance mock store (PRD §11). Seeded once, then persisted as one blob like personal.ts.
// ponytail: seeds are written with relative times on first load and then frozen in storage; clear the key to reseed.

const KEY = 'ecp-mock-admin'
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const H = 60
const D = 1440

/** Accounts that exist only for governance demos (no login). Ids never start with `usr-new-`. */
export interface ExtraAccount {
  id: string
  name: string
  username: string
  email: string
  location: string
  kind: 'person' | 'business'
  joinedAt: string
  bio: string
}

/** Seeded dispute: carries its own transaction snapshot. Real disputes live in users' personal stores. */
export interface SeedDispute {
  id: string
  parties: DisputeParty[]
  marketId?: string
  openedBy: string
  transaction: TransactionDetail
}

export interface DisputeOverlay {
  evidence: Evidence[]
  timeline: DisputeCase['timeline']
  resolution?: DisputeCase['resolution']
}

interface AdminState {
  accounts: ExtraAccount[]
  users: Record<string, { status: AccountStatus; verified?: boolean }>
  reports: Record<string, UserReport[]>
  verifications: VerificationRequest[]
  markets: Record<string, { flags: MarketFlag[]; reports: UserReport[]; reviewedAt?: string; status?: MarketStatus }>
  /** auctionId → status before the freeze. */
  frozen: Record<string, AuctionStatus>
  alerts: FraudAlert[]
  seedDisputes: SeedDispute[]
  disputes: Record<string, DisputeOverlay>
}

const acct = (id: string, name: string, username: string, location: string, kind: ExtraAccount['kind'], joinedDaysAgo: number, bio: string): ExtraAccount => ({
  id, name, username, email: `${username.replace(/\W/g, '')}@mail.demo`, location, kind, joinedAt: ago(joinedDaysAgo * D), bio,
})

function tx(id: string, title: string, buyer: string, supplier: string, status: TransactionStatus, qty: number, unit: string, price: number, daysAgo: number): TransactionDetail {
  const order: TransactionStatus[] = ['agreement', 'invoiced', 'paid', 'fulfilling', 'delivered', 'completed']
  const reached = status === 'disputed' ? 4 : order.indexOf(status)
  return {
    id, code: `TRX-${id.slice(-4).toUpperCase()}`, title, role: 'buyer', counterparty: { name: supplier, kind: 'business', verified: true }, status,
    quantity: { value: qty, unit }, unitPriceIdr: price, totalIdr: qty * price,
    createdAt: ago(daysAgo * D), updatedAt: ago(D), dueAt: ago(-3 * D),
    timeline: order.map((s, i) => ({ status: s, at: i <= reached ? ago((daysAgo - i) * D) : undefined })),
    documents: [
      { id: `${id}-o`, kind: 'order', name: `PO-${id.slice(-4).toUpperCase()}.pdf`, at: ago(daysAgo * D) },
      { id: `${id}-i`, kind: 'invoice', name: `INV-${id.slice(-4).toUpperCase()}.pdf`, at: ago((daysAgo - 1) * D) },
      { id: `${id}-p`, kind: 'proof', name: 'bukti-serah-terima.jpg', at: ago((daysAgo - 4) * D) },
    ],
    payment: { status: 'escrow', paidAt: ago((daysAgo - 2) * D) },
    delivery: { address: `Gudang ${buyer}`, proof: 'bukti-serah-terima.jpg' },
  }
}

function seed(): AdminState {
  const accounts = [
    acct('usr-x-kilat', 'CV Kilat Jaya', 'kilatjaya', 'DKI Jakarta', 'business', 64, 'Produsen box karton dan kemasan e-commerce.'),
    acct('usr-x-mitra', 'PT Mitra Karton Abadi', 'mitrakarton', 'DKI Jakarta', 'business', 120, 'Pabrik karton gelombang untuk ritel dan e-commerce.'),
    acct('usr-x-budi1', 'Budi Santoso', 'budi.s01', 'Jawa Barat', 'person', 6, 'Supplier pupuk dan sarana tani.'),
    acct('usr-x-budi2', 'Budi Santosa', 'budi.s02', 'Jawa Barat', 'person', 5, 'Jual pupuk organik murah.'),
    acct('usr-x-budi3', 'B. Santoso', 'bsantoso', 'Jawa Barat', 'person', 4, 'Pupuk granul siap kirim.'),
    acct('usr-x-hendra', 'Hendra Gunawan', 'hendra', 'Jawa Timur', 'person', 210, 'Operator truk berpendingin Surabaya–Malang.'),
    acct('usr-x-tani', 'Koperasi Mitra Tani', 'mitratani', 'Jawa Tengah', 'business', 400, 'Koperasi sarana produksi pertanian Jawa Tengah.'),
    acct('usr-x-dewi', 'Dewi Lestari', 'dewi', 'Jawa Barat', 'person', 300, 'Pemilik usaha katering, aktif di pengadaan kolektif kemasan.'),
  ]

  const reports: AdminState['reports'] = {
    'usr-x-kilat': [
      { id: 'rep-1', reporter: 'Dewi Lestari', reason: 'Menarik bid di menit terakhir berulang kali lalu masuk lagi dengan harga lebih tinggi.', at: ago(2 * D), context: 'AUC-2290 · Box karton' },
      { id: 'rep-2', reporter: 'PT Kemas Prima', reason: 'Diduga memakai dua akun untuk menahan harga.', at: ago(5 * H), context: 'MKT-316 · Box Karton E-commerce Jakarta' },
    ],
    'usr-x-budi1': [{ id: 'rep-3', reporter: 'Rina Wulandari', reason: 'Meminta pembayaran ditransfer di luar escrow platform.', at: ago(20 * H) }],
    'usr-x-hendra': [{ id: 'rep-4', reporter: 'Koperasi Kopi Jabar', reason: 'Truk datang 3 hari terlambat dan suhu tidak sesuai.', at: ago(3 * D), context: 'TRX-S2C0' }],
    'usr-rina': [{ id: 'rep-5', reporter: 'Kedai Kopi Senja', reason: 'Selisih berat 6 kg dari yang tertulis di invoice.', at: ago(12 * D), context: 'TRX-S3D0' }],
  }

  const verifications: VerificationRequest[] = [
    {
      id: 'ver-agro', business: 'PT Agro Lestari Garut', owner: 'Rina Wulandari', submittedAt: ago(54 * H), status: 'pending',
      form: [
        { label: 'Nama badan usaha', value: 'PT Agro Lestari Garut' }, { label: 'NIB', value: '9120301827364' },
        { label: 'NPWP', value: '01.234.567.8-443.000' }, { label: 'Alamat', value: 'Jl. Cikajang No. 12, Garut' },
        { label: 'Penanggung jawab', value: 'Rina Wulandari' }, { label: 'Bidang usaha', value: 'Perdagangan hasil pertanian' },
      ],
      documents: [
        { kind: 'nib', fileName: 'NIB-agro-lestari.pdf', fields: [{ label: 'NIB', value: '9120301827364' }, { label: 'Nama badan usaha', value: 'PT Agro Lestari Garut' }, { label: 'Diterbitkan', value: '14 Februari 2024' }] },
        { kind: 'npwp', fileName: 'NPWP-agro-lestari.jpg', fields: [{ label: 'NPWP', value: '01.234.567.8-443.000' }, { label: 'Nama badan usaha', value: 'PT AGRO LESTARI GARUT' }, { label: 'KPP', value: 'KPP Pratama Garut' }] },
        { kind: 'akta', fileName: 'Akta-pendirian.pdf', fields: [{ label: 'Nomor akta', value: '17' }, { label: 'Notaris', value: 'Hj. Euis Kartika, S.H.' }, { label: 'Penanggung jawab', value: 'Rina Wulandari' }] },
      ],
    },
    {
      id: 'ver-kilat', business: 'CV Kilat Jaya', owner: 'CV Kilat Jaya', submittedAt: ago(30 * H), status: 'pending',
      form: [
        { label: 'Nama badan usaha', value: 'CV Kilat Jaya' }, { label: 'NIB', value: '8120007718291' },
        { label: 'NPWP', value: '02.881.112.4-031.000' }, { label: 'Alamat', value: 'Jl. Daan Mogot Km 14, Jakarta Barat' },
        { label: 'Penanggung jawab', value: 'Agus Salim' }, { label: 'Bidang usaha', value: 'Industri kemasan karton' },
      ],
      documents: [
        { kind: 'nib', fileName: 'NIB-kilat.pdf', fields: [{ label: 'NIB', value: '8120007718291' }, { label: 'Nama badan usaha', value: 'CV Kilat Jaya' }, { label: 'Diterbitkan', value: '3 Juli 2025' }] },
        { kind: 'npwp', fileName: 'NPWP-kilat.png', fields: [{ label: 'NPWP', value: '02.881.112.4-031.001' }, { label: 'Nama badan usaha', value: 'CV KILAT JAYA' }, { label: 'KPP', value: 'KPP Pratama Kembangan' }] },
        { kind: 'akta', fileName: 'Akta-kilat.pdf', fields: [{ label: 'Nomor akta', value: '41' }, { label: 'Notaris', value: 'Ratna Dewi, S.H., M.Kn.' }, { label: 'Penanggung jawab', value: 'Agus Salim Wijaya' }] },
      ],
    },
    {
      id: 'ver-rezeki', business: 'UD Sumber Rezeki', owner: 'Dewi Lestari', submittedAt: ago(6 * H), status: 'pending',
      form: [
        { label: 'Nama badan usaha', value: 'UD Sumber Rezeki' }, { label: 'NIB', value: '0220119283746' },
        { label: 'NPWP', value: '07.552.901.3-424.000' }, { label: 'Alamat', value: 'Jl. Soekarno-Hatta 210, Bandung' },
        { label: 'Penanggung jawab', value: 'Dewi Lestari' }, { label: 'Bidang usaha', value: 'Katering dan makanan olahan' },
      ],
      documents: [
        { kind: 'nib', fileName: 'NIB-sumber-rezeki.pdf', fields: [{ label: 'NIB', value: '0220119283746' }, { label: 'Nama badan usaha', value: 'UD Sumber Rezeki' }, { label: 'Diterbitkan', value: '9 Januari 2023' }] },
        { kind: 'npwp', fileName: 'NPWP-sumber-rezeki.jpg', fields: [{ label: 'NPWP', value: '07.552.901.3-424.000' }, { label: 'Nama badan usaha', value: 'UD SUMBER REZEKI' }, { label: 'KPP', value: 'KPP Pratama Bandung Cibeunying' }] },
      ],
    },
    {
      id: 'ver-tani', business: 'Koperasi Mitra Tani', owner: 'Koperasi Mitra Tani', submittedAt: ago(4 * D), status: 'reupload',
      form: [
        { label: 'Nama badan usaha', value: 'Koperasi Mitra Tani' }, { label: 'NIB', value: '1203990182736' },
        { label: 'NPWP', value: '03.118.226.0-511.000' }, { label: 'Alamat', value: 'Jl. Raya Boyolali 77, Jawa Tengah' },
        { label: 'Penanggung jawab', value: 'Slamet Riyadi' }, { label: 'Bidang usaha', value: 'Koperasi sarana produksi pertanian' },
      ],
      documents: [
        { kind: 'nib', fileName: 'NIB-mitra-tani-buram.jpg', fields: [{ label: 'NIB', value: '12039901827??' }, { label: 'Nama badan usaha', value: 'Koperasi Mitra Tani' }] },
        { kind: 'akta', fileName: 'Akta-koperasi.pdf', fields: [{ label: 'Nomor akta', value: '5' }, { label: 'Notaris', value: 'Bambang Wirawan, S.H.' }, { label: 'Penanggung jawab', value: 'Slamet Riyadi' }] },
      ],
      decision: { at: ago(3 * D), by: 'Sari Kusuma (Admin)', note: 'Scan NIB buram, nomor tidak terbaca. Unggah ulang dengan resolusi lebih tinggi.' },
    },
  ]

  const markets: AdminState['markets'] = {
    'mkt-karton-jkt': {
      flags: [{ id: 'flg-1', by: 'Sistem', label: 'Dua supplier terkait mendominasi 78% bid (lihat FRD-1032)', at: ago(9 * H) }],
      reports: [reports['usr-x-kilat'][1]],
    },
    'mkt-aren-toba': {
      flags: [{ id: 'flg-2', by: 'Sistem', label: 'Harga turun 18% dalam 1 jam tanpa perubahan supply', at: ago(26 * H) }],
      reports: [{ id: 'rep-6', reporter: 'PT Rasa Nusantara', reason: 'Harga dutch auction turun di luar jadwal yang diumumkan.', at: ago(20 * H) }],
    },
    'mkt-pupuk-jateng': { flags: [], reports: [{ id: 'rep-7', reporter: 'Gapoktan Sumber Rejeki', reason: 'Ada tiga akun baru dengan nama mirip menawar pupuk di bawah harga pokok.', at: ago(30 * H) }] },
  }

  const graph = (nodes: NonNullable<FraudAlert['graph']>['nodes'], edges: NonNullable<FraudAlert['graph']>['edges']) => ({ nodes, edges })
  const alerts: FraudAlert[] = [
    {
      id: 'frd-1031', code: 'FRD-1031', type: 'bid_manipulation', source: 'system', title: 'Bid shading berulang di auction box karton', score: 82, confidence: 0.78, status: 'new', detectedAt: ago(3 * H),
      subjects: [{ type: 'user', id: 'usr-x-kilat', label: 'CV Kilat Jaya' }, { type: 'auction', id: 'auc-karton-100k', label: 'AUC-2290 · 100.000 box karton' }],
      evidence: ['6 kali tarik–masuk ulang bid dalam 40 menit terakhir', 'Setiap bid baru tepat 1 langkah (Rp 25) di bawah bid terbaik', 'Pola sama di 2 auction karton sebelumnya'],
    },
    {
      id: 'frd-1032', code: 'FRD-1032', type: 'collusion', source: 'system', title: 'Pola kolusi dua supplier karton', score: 88, confidence: 0.81, status: 'new', detectedAt: ago(9 * H),
      subjects: [{ type: 'user', id: 'usr-x-kilat', label: 'CV Kilat Jaya' }, { type: 'user', id: 'usr-x-mitra', label: 'PT Mitra Karton Abadi' }, { type: 'market', id: 'mkt-karton-jkt', label: 'MKT-316 · Box Karton E-commerce Jakarta' }],
      evidence: ['Bergantian menang di 9 dari 11 auction market ini', 'Alamat gudang dan rekening penerima pembayaran sama', 'Jarak bid keduanya selalu < Rp 30 per unit'],
      graph: graph(
        [
          { id: 'kilat', label: 'CV Kilat Jaya', kind: 'business', flagged: true }, { id: 'mitra', label: 'PT Mitra Karton Abadi', kind: 'business', flagged: true },
          { id: 'rek', label: 'Rekening BCA •••4410', kind: 'device' }, { id: 'a1', label: 'AUC-2290', kind: 'auction' }, { id: 'a2', label: 'AUC-2271', kind: 'auction' }, { id: 'a3', label: 'AUC-2265', kind: 'auction' },
        ],
        [
          { source: 'kilat', target: 'rek', label: 'payout' }, { source: 'mitra', target: 'rek', label: 'payout' },
          { source: 'kilat', target: 'a1', label: 'bid' }, { source: 'mitra', target: 'a1', label: 'bid' }, { source: 'kilat', target: 'a2', label: 'menang' }, { source: 'mitra', target: 'a3', label: 'menang' },
        ],
      ),
    },
    {
      id: 'frd-1033', code: 'FRD-1033', type: 'fake_accounts', source: 'system', title: 'Tiga akun baru dengan perangkat yang sama', score: 74, confidence: 0.86, status: 'investigating', detectedAt: ago(28 * H),
      subjects: [{ type: 'user', id: 'usr-x-budi1', label: 'Budi Santoso' }, { type: 'user', id: 'usr-x-budi2', label: 'Budi Santosa' }, { type: 'user', id: 'usr-x-budi3', label: 'B. Santoso' }],
      evidence: ['Ketiga akun dibuat dalam 48 jam dari perangkat yang sama', 'Nomor telepon berbeda satu digit', 'Hanya menawar di market pupuk dengan harga di bawah HPP'],
      graph: graph(
        [
          { id: 'b1', label: 'budi.s01', kind: 'person', flagged: true }, { id: 'b2', label: 'budi.s02', kind: 'person', flagged: true }, { id: 'b3', label: 'bsantoso', kind: 'person', flagged: true },
          { id: 'dev', label: 'Perangkat Android #A93F', kind: 'device' }, { id: 'pupuk', label: 'AUC-2292 · Pupuk', kind: 'auction' },
        ],
        [
          { source: 'b1', target: 'dev', label: 'login' }, { source: 'b2', target: 'dev', label: 'login' }, { source: 'b3', target: 'dev', label: 'login' },
          { source: 'b1', target: 'pupuk', label: 'bid' }, { source: 'b2', target: 'pupuk', label: 'bid' },
        ],
      ),
      investigation: { openedAt: ago(20 * H), by: 'Sari Kusuma (Admin)', notes: [{ at: ago(19 * H), by: 'Sari Kusuma (Admin)', text: 'Minta tim KYC cek KTP ketiga akun.' }] },
    },
    {
      id: 'frd-1034', code: 'FRD-1034', type: 'abnormal_bidding', source: 'system', title: '21 bid dalam 4 menit di auction pupuk', score: 63, confidence: 0.6, status: 'new', detectedAt: ago(14 * H),
      subjects: [{ type: 'auction', id: 'auc-pupuk-800', label: 'AUC-2292 · Pupuk organik 800 ton' }],
      evidence: ['Frekuensi bid 7× rata-rata market', '2 peserta menyumbang 90% bid di jendela tersebut', 'Tidak ada perubahan harga terbaik yang berarti'],
    },
    {
      id: 'frd-1035', code: 'FRD-1035', type: 'wash_trading', source: 'system', title: 'Transaksi bolak-balik dengan nilai sama', score: 79, confidence: 0.72, status: 'new', detectedAt: ago(2 * D),
      subjects: [{ type: 'user', id: 'usr-x-hendra', label: 'Hendra Gunawan' }, { type: 'user', id: 'usr-x-tani', label: 'Koperasi Mitra Tani' }],
      evidence: ['4 transaksi saling beli-jual Rp 48 jt dalam 10 hari', 'Barang tidak pernah berpindah gudang (bukti kirim identik)', 'Reputasi kedua akun naik 9 poin dari transaksi ini'],
      graph: graph(
        [{ id: 'h', label: 'Hendra Gunawan', kind: 'person', flagged: true }, { id: 't', label: 'Koperasi Mitra Tani', kind: 'business', flagged: true }],
        [{ source: 'h', target: 't', label: 'jual Rp 48 jt ×2' }, { source: 't', target: 'h', label: 'jual Rp 48 jt ×2' }],
      ),
    },
    {
      id: 'frd-1036', code: 'FRD-1036', type: 'price_manipulation', source: 'system', title: 'Harga gula aren turun 18% dalam 1 jam', score: 58, confidence: 0.52, status: 'new', detectedAt: ago(26 * H),
      subjects: [{ type: 'market', id: 'mkt-aren-toba', label: 'MKT-318 · Gula Aren Toba' }, { type: 'auction', id: 'auc-aren-30', label: 'AUC-2295 · Gula aren 30 ton' }],
      evidence: ['Penurunan harga di luar jadwal dutch auction', 'Supply tidak berubah di periode yang sama', 'Satu pembeli menerima harga 2 menit setelah penurunan'],
    },
    {
      id: 'frd-1037', code: 'FRD-1037', type: 'transaction_network', source: 'system', title: 'Jaringan transaksi melingkar 4 akun', score: 85, confidence: 0.7, status: 'new', detectedAt: ago(5 * H),
      subjects: [{ type: 'user', id: 'usr-x-hendra', label: 'Hendra Gunawan' }, { type: 'user', id: 'usr-x-tani', label: 'Koperasi Mitra Tani' }, { type: 'user', id: 'usr-x-budi1', label: 'Budi Santoso' }],
      evidence: ['Dana berputar kembali ke pengirim awal dalam 6 hari', 'Tiga dari empat akun dibuat < 30 hari', 'Volume naik tiba-tiba tepat sebelum kualifikasi auction'],
      graph: graph(
        [
          { id: 'h', label: 'Hendra Gunawan', kind: 'person', flagged: true }, { id: 't', label: 'Koperasi Mitra Tani', kind: 'business' },
          { id: 'b1', label: 'Budi Santoso', kind: 'person', flagged: true }, { id: 'x', label: 'UD Cahaya Baru', kind: 'business' },
        ],
        [
          { source: 'h', target: 't', label: 'Rp 48 jt' }, { source: 't', target: 'b1', label: 'Rp 46 jt' }, { source: 'b1', target: 'x', label: 'Rp 45 jt' }, { source: 'x', target: 'h', label: 'Rp 44 jt' },
        ],
      ),
    },
  ]

  const party = (role: DisputeParty['role'], name: string, kind: DisputeParty['kind'], userId?: string): DisputeParty => ({ role, name, kind, verified: true, userId })
  const t1 = tx('trx-s1b0', 'Standing pouch 5.000 unit', 'Rina Wulandari', 'PT Solusi Kemasan Nusantara', 'disputed', 5_000, 'unit', 1_900, 9)
  t1.dispute = { status: 'evidence', reason: 'Cetakan logo bergeser di ±800 pouch dan zipper tidak rapat.', openedAt: ago(3 * D) }
  const t2 = tx('trx-s2c0', 'Cold chain 12 trip Surabaya–Malang', 'Koperasi Kopi Jabar', 'Hendra Gunawan', 'disputed', 12, 'trip', 1_550_000, 12)
  t2.counterparty = { name: 'Hendra Gunawan', kind: 'person', verified: false }
  t2.dispute = { status: 'review', reason: 'Truk datang 3 hari terlambat; suhu tercatat −6 °C, bukan −18 °C.', openedAt: ago(5 * D) }
  const t3 = tx('trx-s3d0', 'Green bean arabika 120 kg', 'Kedai Kopi Senja', 'Rina Wulandari', 'completed', 120, 'kg', 89_000, 20)
  t3.counterparty = { name: 'Rina Wulandari', kind: 'person', verified: true }
  t3.payment = { status: 'released', paidAt: ago(18 * D) }
  t3.dispute = { status: 'resolved', reason: 'Berat diterima 114 kg, invoice 120 kg.', openedAt: ago(14 * D) }

  const seedDisputes: SeedDispute[] = [
    { id: 'dsp-s1', parties: [party('buyer', 'Rina Wulandari', 'person', 'usr-rina'), party('supplier', 'PT Solusi Kemasan Nusantara', 'business', 'usr-ajar')], marketId: 'mkt-kemasan-bdg', openedBy: 'Rina Wulandari', transaction: t1 },
    { id: 'dsp-s2', parties: [party('buyer', 'Koperasi Kopi Jabar', 'business', 'usr-dimas'), party('supplier', 'Hendra Gunawan', 'person', 'usr-x-hendra')], marketId: 'mkt-coldchain-sby', openedBy: 'Koperasi Kopi Jabar', transaction: t2 },
    { id: 'dsp-s3', parties: [party('buyer', 'Kedai Kopi Senja', 'business'), party('supplier', 'Rina Wulandari', 'person', 'usr-rina')], marketId: 'mkt-kopi-garut', openedBy: 'Kedai Kopi Senja', transaction: t3 },
  ]
  const ev = (id: string, side: Evidence['side'], by: string, text: string, at: string, file?: string): Evidence => ({ id, side, by, text, at, file })
  const disputes: AdminState['disputes'] = {
    'dsp-s1': {
      evidence: [
        ev('ev-1', 'buyer', 'Rina Wulandari', 'Foto 12 sampel pouch dengan logo bergeser dan zipper terbuka.', ago(3 * D), 'foto-pouch-cacat.zip'),
        ev('ev-2', 'supplier', 'PT Solusi Kemasan Nusantara', 'QC internal lolos; pergeseran < 2 mm masih dalam toleransi spesifikasi.', ago(2 * D), 'laporan-qc-batch-17.pdf'),
      ],
      timeline: [
        { at: ago(3 * D), by: 'Rina Wulandari', label: 'Dispute dibuka' },
        { at: ago(2.5 * D), by: 'Sari Kusuma (Admin)', label: 'Bukti diminta dari kedua pihak' },
      ],
    },
    'dsp-s2': {
      evidence: [
        ev('ev-3', 'buyer', 'Koperasi Kopi Jabar', 'Log suhu data logger menunjukkan −6 °C selama 9 jam.', ago(5 * D), 'log-suhu.csv'),
        ev('ev-4', 'supplier', 'Hendra Gunawan', 'Keterlambatan karena penutupan jalan; unit pendingin sempat mati 2 jam.', ago(4 * D)),
      ],
      timeline: [
        { at: ago(5 * D), by: 'Koperasi Kopi Jabar', label: 'Dispute dibuka' },
        { at: ago(4.5 * D), by: 'Sari Kusuma (Admin)', label: 'Bukti diminta dari kedua pihak' },
        { at: ago(2 * D), by: 'Sari Kusuma (Admin)', label: 'Review dimulai' },
      ],
    },
    'dsp-s3': {
      evidence: [
        ev('ev-5', 'buyer', 'Kedai Kopi Senja', 'Foto timbangan saat bongkar: 114 kg.', ago(14 * D), 'timbangan.jpg'),
        ev('ev-6', 'supplier', 'Rina Wulandari', 'Penyusutan kadar air selama perjalanan ±1%.', ago(13 * D)),
      ],
      timeline: [
        { at: ago(14 * D), by: 'Kedai Kopi Senja', label: 'Dispute dibuka' },
        { at: ago(12 * D), by: 'Sari Kusuma (Admin)', label: 'Review dimulai' },
        { at: ago(11 * D), by: 'Sari Kusuma (Admin)', label: 'Diputuskan: refund sebagian' },
      ],
      resolution: { kind: 'partial', refundIdr: 534_000, releaseIdr: 10_146_000, reason: 'Selisih 6 kg melebihi toleransi susut 1%; refund senilai 6 kg.', at: ago(11 * D), by: 'Sari Kusuma (Admin)' },
    },
  }

  const verified = { status: 'active' as const, verified: true }
  const users = { 'usr-x-mitra': verified, 'usr-x-tani': verified, 'usr-x-dewi': verified, 'usr-x-hendra': verified }
  return { accounts, users, reports, verifications, markets, frozen: {}, alerts, seedDisputes, disputes }
}

export const admin: AdminState = (() => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AdminState
  } catch {
    // corrupt or blocked: reseed
  }
  return seed()
})()

export function saveAdmin() {
  try {
    localStorage.setItem(KEY, JSON.stringify(admin))
  } catch {
    // per-tab only
  }
}

// Governance decisions survive reloads: re-apply them to the shared economy.
for (const [id, m] of Object.entries(admin.markets)) {
  const market = economy.markets.find((x) => x.id === id)
  if (market && m.status) market.status = m.status
}
for (const id of Object.keys(admin.frozen)) {
  const a = economy.auctions.find((x) => x.id === id)
  if (a) a.status = 'frozen'
}
