import type {
  AggregateRow, Auction, AuctionDetail, AuctionType, BidVisibility, CategoryId, ExplorerOverview, ExplorerRange, Market,
  MarketDetail, MarketMechanism, MarketObjective, Opportunity, OpportunityDetail, OpportunityKind, PartyRef, PublicBid,
  SearchHit,
} from '@/domain/types'
import type { AuctionStatus, MarketStatus, OpportunityStatus } from '@/domain/status'
import { AUCTION_TYPES, MECHANISMS } from '@/domain/catalog'
import { formatIdr } from '@/domain/format'
import { db } from './db'

// Seeded public economy: hand-written entities + deterministic generated history.
// ponytail: one fixed seed; a scenario switcher comes if QA needs different datasets.

let seed = 4821
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const NOW = Date.now()
const minutes = (m: number) => new Date(NOW + m * 60_000).toISOString()
const days = (d: number) => minutes(d * 1440)
const q = (value: number, unit: string) => ({ value, unit })
const biz = (name: string, verified = true): PartyRef => ({ name, kind: 'business', verified })

// ── Markets ──────────────────────────────────────────────────────

type MarketRow = [
  id: string, name: string, cat: CategoryId, region: string, objective: MarketObjective, mechanism: MarketMechanism,
  status: MarketStatus, maker: string, unit: string, demand: number, supply: number, buyers: number, suppliers: number,
  minIdr: number, maxIdr: number, volume: number,
]

const MARKET_ROWS: MarketRow[] = [
  ['mkt-kopi-garut', 'Kopi Arabika Garut Q4', 'agri', 'Jawa Barat', 'selling', 'forward_auction', 'active', 'Koperasi Kopi Jabar', 'kg', 60_000, 45_000, 48, 22, 82_000, 96_000, 2_800_000_000],
  ['mkt-kemasan-bdg', 'Kemasan Kolektif Bandung', 'packaging', 'Jawa Barat', 'procurement', 'collective_procurement', 'active', 'Asosiasi UMKM Bandung', 'unit', 840_000, 520_000, 137, 9, 1_450, 1_850, 1_100_000_000],
  ['mkt-pupuk-jateng', 'Pupuk Organik Kolektif Jateng', 'agri', 'Jawa Tengah', 'procurement', 'collective_procurement', 'active', 'Gapoktan Sumber Rejeki', 'kg', 1_200_000, 700_000, 212, 14, 2_100, 2_600, 940_000_000],
  ['mkt-beras-krw', 'Beras Medium Karawang', 'food', 'Jawa Barat', 'selling', 'forward_auction', 'active', 'Koperasi Tani Karawang', 'kg', 650_000, 400_000, 31, 6, 11_800, 12_900, 3_200_000_000],
  ['mkt-coldchain-sby', 'Cold Chain Surabaya', 'logistics', 'Jawa Timur', 'service_exchange', 'reverse_auction', 'formation', 'Asosiasi Nelayan Jatim', 'trip', 320, 210, 26, 11, 1_200_000, 1_800_000, 480_000_000],
  ['mkt-backend-jogja', 'Talenta Backend Yogyakarta', 'it', 'DI Yogyakarta', 'service_exchange', 'direct_market', 'active', 'Jogja Digital Hub', 'jam', 1_240, 610, 42, 37, 120_000, 210_000, 186_000_000],
  ['mkt-karton-jkt', 'Box Karton E-commerce Jakarta', 'packaging', 'DKI Jakarta', 'procurement', 'reverse_auction', 'active', 'Asosiasi Seller Online Jakarta', 'unit', 300_000, 180_000, 64, 7, 1_900, 2_400, 640_000_000],
  ['mkt-surya-bali', 'Panel Surya UMKM Bali', 'energy', 'Bali', 'procurement', 'sealed_bid', 'formation', 'Koperasi Energi Bali', 'unit', 180, 40, 18, 5, 18_000_000, 24_000_000, 410_000_000],
  ['mkt-aren-toba', 'Gula Aren Toba', 'food', 'Sumatera Utara', 'selling', 'dutch_auction', 'active', 'Koperasi Aren Toba', 'kg', 90_000, 140_000, 19, 12, 28_000, 34_000, 520_000_000],
]

const markets: Market[] = MARKET_ROWS.map(
  ([id, name, categoryId, region, objective, mechanism, status, maker, unit, demand, supply, buyers, suppliers, minIdr, maxIdr, volume], i) => ({
    id, code: `MKT-${310 + i}`, name, categoryId, region, objective, mechanism, status, maker: biz(maker),
    demand: q(demand, unit), supply: q(supply, unit), buyers, suppliers,
    priceRange: { minIdr, maxIdr, unit }, volume30dIdr: volume, activeAuctions: 0,
  }),
)

const marketById = (id: string) => markets.find((m) => m.id === id)!

// ── Auctions ─────────────────────────────────────────────────────

type AuctionRow = [
  id: string, marketId: string, title: string, type: AuctionType, status: AuctionStatus, visibility: BidVisibility,
  item: string, qty: number, spec: string, startMin: number, endMin: number, participants: number, bidCount: number,
  opening: number, current: number | undefined, step: number,
]

const AUCTION_ROWS: AuctionRow[] = [
  ['auc-karton-100k', 'mkt-karton-jkt', '100.000 box karton double wall', 'reverse', 'live', 'full', 'Box karton 40×30×20 cm', 100_000, 'Double wall, flute BC, cetak 1 warna', -300, 42, 9, 37, 2_400, 2_050, 25],
  ['auc-kopi-g1', 'mkt-kopi-garut', 'Kopi Arabika Garut Grade 1', 'forward', 'live', 'full', 'Green bean arabika', 12_000, 'Grade 1, kadar air ≤ 12,5%, full wash', -1440, 185, 14, 58, 82_000, 91_500, 500],
  ['auc-pupuk-800', 'mkt-pupuk-jateng', 'Pupuk organik kolektif 800 ton', 'reverse', 'live', 'rank_only', 'Pupuk organik granul', 800_000, 'C-organik ≥ 15%, SNI 7763', -2880, 1_740, 8, 21, 2_600, undefined, 10],
  ['auc-beras-200', 'mkt-beras-krw', 'Beras medium 200 ton', 'forward', 'live', 'full', 'Beras medium', 200_000, 'Broken ≤ 20%, panen Agustus', -600, 360, 11, 44, 11_800, 12_450, 50],
  ['auc-surya-60', 'mkt-surya-bali', 'Panel surya atap 60 unit', 'sealed', 'live', 'sealed', 'Paket PLTS atap 3 kWp', 60, 'Termasuk inverter dan instalasi, garansi 10 tahun', -1440, 2_880, 5, 9, 24_000_000, undefined, 0],
  ['auc-aren-30', 'mkt-aren-toba', 'Gula aren cetak 30 ton', 'dutch', 'live', 'full', 'Gula aren cetak', 30_000, 'Kadar air ≤ 10%, kemasan 1 kg', -180, 120, 19, 0, 34_000, 31_200, 200],
  ['auc-coldchain-120', 'mkt-coldchain-sby', 'Cold chain 120 trip Surabaya–Malang', 'reverse', 'qualification', 'full', 'Trip truk berpendingin', 120, 'Suhu −18 °C, GPS tracking', 1_440, 4_320, 6, 0, 1_800_000, undefined, 10_000],
  ['auc-kopi-g2', 'mkt-kopi-garut', 'Kopi Arabika Garut Grade 2', 'forward', 'scheduled', 'full', 'Green bean arabika', 8_000, 'Grade 2, natural process', 4_320, 7_200, 0, 0, 68_000, undefined, 500],
  ['auc-kemasan-500k', 'mkt-kemasan-bdg', 'Kemasan kolektif 500.000 unit', 'reverse', 'awarded', 'full', 'Standing pouch 250 g', 500_000, 'Food grade, zipper, 3 warna', -10_080, -2_880, 12, 96, 1_850, 1_580, 10],
]

const BIDDER = { reverse: 'Supplier', forward: 'Bidder', dutch: 'Bidder', sealed: 'Peserta' }

function makeBids(row: AuctionRow): PublicBid[] {
  const [id, , , type, , visibility, , , , startMin, endMin, participants, bidCount, opening, current] = row
  if (visibility !== 'full' || current === undefined || bidCount === 0) return []
  const n = Math.min(bidCount, 15)
  const lastMin = Math.min(endMin, 0) - 1
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n
    return {
      id: `${id}-b${i}`,
      bidder: `${BIDDER[type]} ${1 + Math.floor(rand() * participants)}`,
      priceIdr: Math.round(opening + (current - opening) * t),
      at: minutes(startMin + (lastMin - startMin) * (0.4 + 0.6 * t)),
    }
  }).reverse()
}

const auctionDetails: AuctionDetail[] = AUCTION_ROWS.map((row, i) => {
  const [id, marketId, title, type, status, visibility, item, qty, spec, startMin, endMin, participants, bidCount, opening, current, step] = row
  const m = marketById(marketId)
  const unit = m.priceRange.unit
  return {
    id, code: `AUC-${2290 + i}`, title, marketId, marketName: m.name, categoryId: m.categoryId, type, status, visibility,
    lot: { item, quantity: q(qty, unit), spec },
    startsAt: minutes(startMin), endsAt: minutes(endMin), participants, bidCount, openingPriceIdr: opening,
    currentPriceIdr: visibility === 'full' ? current : undefined,
    minStepIdr: step,
    extension: { windowMinutes: 2, extendMinutes: 5 },
    rules: [
      { label: 'Tipe', value: `${AUCTION_TYPES[type].label} auction` },
      { label: 'Visibilitas bid', value: { full: 'Harga terlihat, identitas disamarkan', rank_only: 'Peserta hanya melihat peringkat', sealed: 'Tertutup sampai penutupan' }[visibility] },
      ...(step ? [{ label: type === 'dutch' ? 'Penurunan harga' : 'Kenaikan minimum', value: `${formatIdr(step)} per ${unit}` }] : []),
      { label: 'Perpanjangan otomatis', value: '+5 menit jika ada bid di 2 menit terakhir' },
      { label: 'Kualifikasi', value: 'Akun terverifikasi, reputasi ≥ 80, dokumen spesifikasi' },
      { label: 'Penetapan pemenang', value: type === 'sealed' ? 'Skor harga 70% + kualitas 30%' : AUCTION_TYPES[type].best },
    ],
    bids: makeBids(row),
  }
})

for (const a of auctionDetails) if (a.status === 'live' || a.status === 'extended') marketById(a.marketId).activeAuctions++

export const toAuction = ({ rules: _r, minStepIdr: _s, extension: _e, bids: _b, ...a }: AuctionDetail): Auction => a

// ── Opportunities ────────────────────────────────────────────────

type OppRow = [
  id: string, title: string, kind: OpportunityKind, cat: CategoryId, region: string, status: OpportunityStatus, unit: string,
  demand: number, supply: number, participants: number, value: number, mechanism: MarketMechanism, confidence: number,
  detectedDaysAgo: number, marketIds: string[], description: string, contribution: string,
]

const OPP_ROWS: OppRow[] = [
  ['opp-4821', 'Collective Packaging Demand', 'collective_demand', 'packaging', 'Jawa Barat', 'market_live', 'unit', 840_000, 520_000, 137, 1_300_000_000, 'collective_procurement', 0.87, 9, ['mkt-kemasan-bdg'],
    '137 UMKM makanan di Bandung Raya membeli standing pouch secara terpisah dalam jumlah kecil. Digabungkan, kebutuhannya cukup besar untuk harga pabrik.', 'Supplier: kapasitas ≥ 50.000 unit/bulan food grade. Pembeli: komitmen volume 3 bulan.'],
  ['opp-4822', 'Kopi Arabika Garut untuk Kafe Jabodetabek', 'supply_gap', 'agri', 'Jawa Barat', 'market_live', 'kg', 60_000, 38_000, 70, 5_200_000_000, 'forward_auction', 0.82, 21, ['mkt-kopi-garut'],
    'Permintaan kafe specialty di Jabodetabek tumbuh lebih cepat dari pasokan green bean Garut yang terverifikasi.', 'Petani/koperasi: green bean grade 1–2 dengan sertifikat asal.'],
  ['opp-4823', 'Backend Developer Yogyakarta', 'supply_gap', 'it', 'DI Yogyakarta', 'detected', 'jam', 1_240, 610, 42, 186_000_000, 'direct_market', 0.74, 3, ['mkt-backend-jogja'],
    'Startup dan agensi di Yogyakarta butuh jam kerja backend (Go, Node) melebihi kapasitas freelancer lokal yang tersedia.', 'Freelancer: minimal 5 jam/minggu, Go atau Node.js, portofolio.'],
  ['opp-4824', 'Beras Medium Karawang ke Ritel Modern', 'market_gap', 'food', 'Jawa Barat', 'market_live', 'kg', 650_000, 400_000, 37, 7_900_000_000, 'forward_auction', 0.79, 30, ['mkt-beras-krw'],
    'Koperasi tani punya stok panen, sementara ritel modern di Bekasi dan Karawang mencari pasokan langsung dengan harga stabil.', 'Pembeli: kapasitas penyerapan ≥ 10 ton per transaksi.'],
  ['opp-4825', 'Cold Chain Surabaya–Malang', 'capacity_match', 'logistics', 'Jawa Timur', 'forming', 'trip', 320, 210, 37, 480_000_000, 'reverse_auction', 0.71, 6, ['mkt-coldchain-sby'],
    'Nelayan dan pengolah ikan butuh trip berpendingin rutin; beberapa operator truk punya armada idle di jam malam.', 'Operator: truk berpendingin −18 °C, GPS, asuransi muatan.'],
  ['opp-4826', 'Pupuk Organik Kolektif Jawa Tengah', 'collective_demand', 'agri', 'Jawa Tengah', 'market_live', 'kg', 1_200_000, 700_000, 226, 2_100_000_000, 'collective_procurement', 0.9, 45, ['mkt-pupuk-jateng'],
    '212 kelompok tani membeli pupuk organik eceran. Pengadaan kolektif memangkas harga dan ongkos kirim.', 'Supplier: SNI 7763, kapasitas ≥ 100 ton/bulan, pengiriman ke gudang gapoktan.'],
  ['opp-4827', 'PLTS Atap untuk UMKM Bali', 'market_gap', 'energy', 'Bali', 'forming', 'unit', 180, 40, 23, 3_600_000_000, 'sealed_bid', 0.68, 12, ['mkt-surya-bali'],
    'UMKM pariwisata ingin menekan biaya listrik, tetapi belum ada pasar paket PLTS skala kecil dengan cicilan.', 'Installer: paket 3–5 kWp, garansi ≥ 10 tahun, layanan purna jual di Bali.'],
  ['opp-4828', 'Gula Aren Toba ke Industri Minuman', 'capacity_match', 'food', 'Sumatera Utara', 'market_live', 'kg', 90_000, 140_000, 31, 2_800_000_000, 'dutch_auction', 0.77, 18, ['mkt-aren-toba'],
    'Pasokan gula aren dari Toba melebihi serapan lokal; industri minuman di Medan dan Jakarta mencari pasokan konsisten.', 'Pembeli: minimal 1 ton per order, pembayaran ≤ 14 hari.'],
  ['opp-4829', 'Box Karton E-commerce Jakarta', 'collective_demand', 'packaging', 'DKI Jakarta', 'market_live', 'unit', 300_000, 180_000, 71, 640_000_000, 'reverse_auction', 0.84, 14, ['mkt-karton-jkt'],
    'Seller online di Jakarta Barat dan Utara membutuhkan box karton standar dalam volume besar setiap bulan.', 'Supplier: cetak 1 warna, pengiriman mingguan ke 3 titik kumpul.'],
  ['opp-4830', 'Truk Engkel Jabodetabek', 'supply_gap', 'logistics', 'DKI Jakarta', 'detected', 'trip', 540, 300, 58, 650_000_000, 'reverse_auction', 0.66, 2, [],
    'Permintaan pengiriman barang UMKM antarkota Jabodetabek melonjak menjelang akhir tahun.', 'Operator: truk engkel/CDD, sopir berpengalaman, jadwal fleksibel.'],
  ['opp-4831', 'Minyak Jelantah untuk Biodiesel', 'market_gap', 'energy', 'Jawa Timur', 'detected', 'kg', 80_000, 25_000, 19, 560_000_000, 'forward_auction', 0.61, 1, [],
    'Pengolah biodiesel butuh bahan baku jelantah, sementara restoran dan rumah tangga belum punya kanal penjualan terkumpul.', 'Pengepul: kapasitas ≥ 2 ton/bulan, uji kadar asam lemak bebas.'],
]

const PEOPLE = ['Rina W.', 'Bagus S.', 'Dewi L.', 'Andi P.', 'Siti R.', 'Yoga A.']
const BUSINESSES = ['CV Sumber Pangan', 'PT Rasa Nusantara', 'Kedai Kopi Senja', 'UD Makmur Jaya', 'PT Kemas Prima', 'Koperasi Mitra Tani', 'Toko Berkah', 'PT Logistik Andalan']

const opportunityDetails: OpportunityDetail[] = OPP_ROWS.map(
  ([id, title, kind, categoryId, region, status, unit, demand, supply, participants, value, mechanism, confidence, ago, marketIds, description, contribution], i) => ({
    id, code: `OPP-${4821 + i}`, title, kind, categoryId, region, status,
    demand: q(demand, unit), supply: q(supply, unit), participants, potentialValueIdr: value,
    suggestedMechanism: mechanism, confidence, detectedAt: days(-ago),
    description, requiredContribution: contribution,
    mechanismReason:
      supply < demand
        ? `${participants} peserta dengan demand ${Math.round((1 - supply / demand) * 100)}% di atas supply: ${MECHANISMS[mechanism].label.toLowerCase()} paling cepat menemukan harga.`
        : `Supply melebihi demand, jadi ${MECHANISMS[mechanism].label.toLowerCase()} membantu penjual menemukan harga pasar.`,
    history: Array.from({ length: 6 }, (_, k) => {
      const t = (k + 1) / 6
      const d = new Date(NOW)
      d.setMonth(d.getMonth() - (5 - k), 1)
      return {
        month: d.toISOString().slice(0, 7),
        demand: Math.round(demand * (0.55 + 0.45 * t) * (0.97 + rand() * 0.06)),
        supply: Math.round(supply * (0.75 + 0.25 * t) * (0.97 + rand() * 0.06)),
      }
    }),
    participantsPreview: Array.from({ length: 6 }, (_, k) => {
      const business = k % 3 !== 2
      return {
        name: business ? BUSINESSES[(i + k) % BUSINESSES.length] : PEOPLE[(i + k) % PEOPLE.length],
        kind: business ? 'business' : 'person',
        verified: k % 2 === 0,
        role: k < 4 ? 'buyer' : 'supplier',
      }
    }),
    markets: marketIds.map(marketById),
  }),
)

export const toOpportunity = ({
  description: _d, requiredContribution: _c, mechanismReason: _m, history: _h, participantsPreview: _p, markets: _k, ...o
}: OpportunityDetail): Opportunity => o

// ── Market details ───────────────────────────────────────────────

const marketDetails: MarketDetail[] = markets.map((m) => {
  const mid = (m.priceRange.minIdr + m.priceRange.maxIdr) / 2
  const spread = m.priceRange.maxIdr - m.priceRange.minIdr
  let level = mid * 0.94
  return {
    ...m,
    description: `${m.name} dioperasikan oleh ${m.maker.name}. Market ini mempertemukan ${m.buyers} pembeli dan ${m.suppliers} supplier di ${m.region} dengan mekanisme ${MECHANISMS[m.mechanism].label.toLowerCase()}.`,
    rules: [
      { label: 'Eligibility', value: 'Akun terverifikasi; supplier wajib dokumen legal usaha' },
      { label: 'Kuantitas minimum', value: `${Math.round(m.demand.value * 0.01).toLocaleString('id-ID')} ${m.demand.unit} per order` },
      { label: 'Kuantitas maksimum', value: `${Math.round(m.supply.value * 0.4).toLocaleString('id-ID')} ${m.demand.unit} per supplier` },
      { label: 'Jendela waktu', value: 'Round mingguan, Senin 09.00 – Jumat 17.00 WIB' },
      { label: 'Wilayah', value: `${m.region} dan radius 75 km` },
      { label: 'Penetapan pemenang', value: MECHANISMS[m.mechanism].hint },
    ],
    priceHistory: Array.from({ length: 12 }, (_, k) => {
      level += (rand() - 0.42) * spread * 0.12
      const median = Math.round(level)
      const half = spread * (0.18 + rand() * 0.12)
      return { week: days(-7 * (11 - k)).slice(0, 10), medianIdr: median, lowIdr: Math.round(median - half), highIdr: Math.round(median + half) }
    }),
    activity: [],
    auctions: [],
  }
})

// ── Live state the handlers and the realtime mock share ──────────

export const economy = {
  opportunities: opportunityDetails,
  markets: marketDetails,
  auctions: auctionDetails,
}

export function marketDetail(id: string): MarketDetail | undefined {
  const m = economy.markets.find((x) => x.id === id)
  if (!m) return undefined
  return {
    ...m,
    auctions: economy.auctions.filter((a) => a.marketId === id).map(toAuction),
    activity: db.activity.slice(0, 6),
  }
}

// ── Explorer ─────────────────────────────────────────────────────

const RANGE_DAYS: Record<ExplorerRange, number> = { '7d': 7, '30d': 30, '90d': 90 }
const INDEX_CATEGORIES: CategoryId[] = ['agri', 'food', 'packaging', 'logistics']
const midPrice = (m: Market) => (m.priceRange.minIdr + m.priceRange.maxIdr) / 2

export function explorerOverview(range: ExplorerRange, category?: CategoryId): ExplorerOverview {
  seed = 99 + RANGE_DAYS[range] // same range → same curves
  const n = RANGE_DAYS[range]
  const scoped = economy.markets.filter((m) => !category || m.categoryId === category)
  const daily = scoped.reduce((s, m) => s + m.volume30dIdr, 0) / 30
  const levels = Object.fromEntries(INDEX_CATEGORIES.map((c) => [c, 100]))
  const cats = category ? [category] : INDEX_CATEGORIES

  const byCat = new Map<CategoryId, { demandIdr: number; supplyIdr: number }>()
  for (const m of scoped) {
    const row = byCat.get(m.categoryId) ?? { demandIdr: 0, supplyIdr: 0 }
    row.demandIdr += Math.round(m.demand.value * midPrice(m))
    row.supplyIdr += Math.round(m.supply.value * midPrice(m))
    byCat.set(m.categoryId, row)
  }

  return {
    stats: { ...db.stats },
    deltas: { participants: 0.064, markets: 0.031, opportunities: 0.12, volume: 0.087 },
    volume: Array.from({ length: n }, (_, k) => ({
      date: days(-(n - 1 - k)).slice(0, 10),
      volumeIdr: Math.round(daily * (0.85 + 0.3 * (k / n)) * (0.8 + rand() * 0.4)),
    })),
    priceIndex: Array.from({ length: n }, (_, k) => {
      const point: ExplorerOverview['priceIndex'][number] = { date: days(-(n - 1 - k)).slice(0, 10) }
      for (const c of cats) {
        if (k > 0) levels[c] += (rand() - 0.46) * (c === 'agri' ? 0.7 : 0.4) * (30 / n) ** 0.5
        point[c] = Math.round(levels[c] * 10) / 10
      }
      return point
    }),
    demandSupply: [...byCat].map(([categoryId, v]) => ({ categoryId, ...v })).sort((a, b) => b.demandIdr - a.demandIdr),
  }
}

export function aggregates(side: 'demand' | 'supply', category?: CategoryId): AggregateRow[] {
  return economy.markets
    .filter((m) => !category || m.categoryId === category)
    .map((m, i) => ({
      categoryId: m.categoryId,
      item: m.name,
      region: m.region,
      quantity: side === 'demand' ? m.demand : m.supply,
      listings: side === 'demand' ? m.buyers : m.suppliers,
      trend: Math.round(((i * 37) % 23) - 6) / 100,
    }))
    .sort((a, b) => b.listings - a.listings)
}

// ── Search ───────────────────────────────────────────────────────

const SERVICE_CATS: CategoryId[] = ['it', 'logistics']

export function search(term: string): SearchHit[] {
  const t = term.trim().toLowerCase()
  if (!t) return []
  const hits: SearchHit[] = [
    ...economy.opportunities.map((o) => ({ type: 'opportunity' as const, id: o.id, title: o.title, subtitle: `${o.code} · ${o.region}`, href: `/opportunities/${o.id}` })),
    ...economy.markets.map((m) => ({ type: 'market' as const, id: m.id, title: m.name, subtitle: `${m.code} · ${m.region}`, href: `/markets/${m.id}` })),
    ...economy.auctions.map((a) => ({ type: 'auction' as const, id: a.id, title: a.title, subtitle: `${a.code} · ${a.marketName}`, href: `/auctions/${a.id}` })),
    ...economy.markets.map((m) => ({
      type: 'business' as const, id: `biz-${m.id}`, title: m.maker.name, subtitle: `Market maker · ${m.region}`, href: `/markets/${m.id}`,
    })),
    ...economy.auctions.map((a) => ({
      type: SERVICE_CATS.includes(a.categoryId) ? ('service' as const) : ('product' as const),
      id: `item-${a.id}`, title: a.lot.item, subtitle: `${a.lot.spec}`, href: `/auctions/${a.id}`,
    })),
  ]
  return hits.filter((h) => `${h.title} ${h.subtitle}`.toLowerCase().includes(t))
}
