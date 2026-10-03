import type { ActivityEvent, ActivityType, PublicStats, User } from '@/domain/types'
import type { Tone } from '@/domain/status'

// In-memory mock database. Handlers read/write here so flows feel real within a session.
// Only the session id is persisted (stand-in for the httpOnly cookie).

/** Mock-only test password shared by every demo account. */
export const DEMO_PASSWORD = 'demo1234'

export type MockUser = User & { password: string }

const users: MockUser[] = [
  {
    id: 'usr-rina', name: 'Rina Wulandari', username: 'rina', email: 'rina@demo.ecopurnity.id', emailVerified: true,
    location: 'Garut, Jawa Barat', capabilities: [], orgs: [], onboarded: true, password: DEMO_PASSWORD,
  },
  {
    id: 'usr-ajar', name: 'Ajar Pratama', username: 'ajar', email: 'ajar@demo.ecopurnity.id', emailVerified: true,
    location: 'Bandung, Jawa Barat', capabilities: [], onboarded: true, password: DEMO_PASSWORD,
    orgs: [{ orgId: 'org-skn', orgName: 'PT Solusi Kemasan Nusantara', role: 'owner', verified: true }],
  },
  {
    id: 'usr-dimas', name: 'Dimas Haryanto', username: 'dimas', email: 'dimas@demo.ecopurnity.id', emailVerified: true,
    location: 'Bogor, Jawa Barat', capabilities: ['market_maker'], onboarded: true, password: DEMO_PASSWORD,
    orgs: [{ orgId: 'org-kkj', orgName: 'Koperasi Kopi Jabar', role: 'procurement', verified: true }],
  },
  {
    id: 'usr-sari', name: 'Sari Kusuma', username: 'sari', email: 'sari@demo.ecopurnity.id', emailVerified: true,
    location: 'Jakarta', capabilities: ['admin'], orgs: [], onboarded: true, password: DEMO_PASSWORD,
  },
  // Ajar's teammates at PT Solusi Kemasan Nusantara, so business approvals need a real second sign-in.
  {
    id: 'usr-maya', name: 'Maya Sari', username: 'maya', email: 'maya@demo.ecopurnity.id', emailVerified: true,
    location: 'Bandung, Jawa Barat', capabilities: [], onboarded: true, password: DEMO_PASSWORD,
    orgs: [{ orgId: 'org-skn', orgName: 'PT Solusi Kemasan Nusantara', role: 'finance', verified: true }],
  },
  {
    id: 'usr-bima', name: 'Bima Santoso', username: 'bima', email: 'bima@demo.ecopurnity.id', emailVerified: true,
    location: 'Bandung, Jawa Barat', capabilities: [], onboarded: true, password: DEMO_PASSWORD,
    orgs: [{ orgId: 'org-skn', orgName: 'PT Solusi Kemasan Nusantara', role: 'procurement', verified: true }],
  },
]

const SESSION_KEY = 'ecp-mock-session'
const USERS_KEY = 'ecp-mock-users'

// Accounts created via register/Google survive reloads; seeded demo accounts always come from code.
try {
  users.push(...(JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as MockUser[]))
} catch {
  // storage blocked or corrupt: start clean
}

export function saveUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u) => u.id.startsWith('usr-new-'))))
  } catch {
    // per-tab only
  }
}

function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

const TEMPLATES: [ActivityType, string, number?][] = [
  ['opportunity_detected', 'Opportunity baru: permintaan kemasan kolektif di Bandung', 1_300_000_000],
  ['market_formed', 'Market terbentuk: Kopi Arabika Garut Q4', 2_800_000_000],
  ['auction_started', 'Reverse auction dimulai: 100.000 box karton', 180_000_000],
  ['bid_placed', 'Bid baru di auction Beras Medium Karawang', 45_000_000],
  ['auction_closed', 'Auction ditutup: Jasa logistik Jabodetabek', 320_000_000],
  ['transaction_completed', 'Transaksi selesai: 500 kg biji kopi', 62_500_000],
  ['opportunity_detected', 'Supply gap: backend developer di Yogyakarta'],
  ['market_formed', 'Market terbentuk: Pupuk organik kolektif Jateng', 940_000_000],
]

let seq = 0
export function makeActivity(at = new Date()): ActivityEvent {
  const [type, title, amountIdr] = TEMPLATES[seq % TEMPLATES.length]
  seq++
  return { id: `act-${seq}`, type, title, amountIdr, at: at.toISOString() }
}

export const db = {
  users,
  stats: {
    activeParticipants: 1284,
    activeMarkets: 342,
    opportunitiesDetected: 87,
    transactionVolumeIdr: 8_400_000_000,
  } satisfies PublicStats,
  // Newest first, spaced 7 minutes apart.
  activity: Array.from({ length: 12 }, (_, i) => makeActivity(new Date(Date.now() - i * 7 * 60_000))),

  /** One-time tokens a real BE would email: email → token. */
  verifyTokens: new Map<string, string>(),
  resetTokens: new Map<string, string>(),

  sessionUserId: readSession(),
  setSession(userId: string | null) {
    this.sessionUserId = userId
    try {
      if (userId) localStorage.setItem(SESSION_KEY, userId)
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      // storage blocked: session lasts for this tab only
    }
  },
}

/** Shown on the login page while mocks are on. */
export const DEMO_ACCOUNTS = [
  { name: 'Rina Wulandari', email: 'rina@demo.ecopurnity.id', role: 'Participant', tone: 'teal' },
  { name: 'Ajar Pratama', email: 'ajar@demo.ecopurnity.id', role: 'Business owner', tone: 'blue' },
  { name: 'Dimas Haryanto', email: 'dimas@demo.ecopurnity.id', role: 'Market Maker', tone: 'purple' },
  { name: 'Sari Kusuma', email: 'sari@demo.ecopurnity.id', role: 'Admin', tone: 'orange' },
  { name: 'Maya Sari', email: 'maya@demo.ecopurnity.id', role: 'Business finance', tone: 'green' },
  { name: 'Bima Santoso', email: 'bima@demo.ecopurnity.id', role: 'Business procurement', tone: 'yellow' },
].map((a) => ({ ...a, tone: a.tone as Tone, password: DEMO_PASSWORD }))

export function toUser({ password, ...user }: MockUser): User {
  return user
}
