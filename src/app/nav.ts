import {
  BadgeCheck, Bell, Building2, ChartColumn, ClipboardList, Compass, FileCheck2, Gavel, Handshake, History, House,
  IdCard, Kanban, LayoutDashboard, PackageOpen, ReceiptText, Scale, Settings, ShieldAlert, ShieldCheck, ShoppingCart,
  FileQuestion, MessagesSquare, Sparkles, Store, SquarePlus, Truck, UserRound, Users, UsersRound, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react'
import type { User } from '@/domain/types'
import type { Tone } from '@/domain/status'

export interface NavItem {
  label: string
  /** Relative to the workspace base; '' = workspace home. */
  path: string
  icon: LucideIcon
}

export interface Workspace {
  id: string
  label: string
  /** Sub-label in the switcher, e.g. the user's org role. */
  caption: string
  base: string
  icon: LucideIcon
  tone: Tone
  items: NavItem[]
  footer?: NavItem[]
}

// Routes follow the PRD §4 route map.
const personal: Workspace = {
  id: 'personal', label: 'Personal', caption: 'My Economy', base: '/app', icon: UserRound, tone: 'teal',
  items: [
    { label: 'My Economy', path: '', icon: House },
    { label: 'Identity', path: 'identity', icon: IdCard },
    { label: 'Supply', path: 'supply', icon: PackageOpen },
    { label: 'Demand', path: 'demand', icon: ShoppingCart },
    { label: 'Opportunities', path: 'opportunities', icon: Sparkles },
    { label: 'Matches', path: 'matches', icon: Handshake },
    { label: 'Markets', path: 'markets', icon: Store },
    { label: 'Auctions', path: 'auctions', icon: Gavel },
    { label: 'RFQ', path: 'rfq', icon: FileQuestion },
    { label: 'Transactions', path: 'transactions', icon: ReceiptText },
    { label: 'Keuangan', path: 'finance', icon: Wallet },
    { label: 'Reputation', path: 'reputation', icon: BadgeCheck },
  ],
  footer: [
    { label: 'Pesan', path: 'messages', icon: MessagesSquare },
    { label: 'Notifikasi', path: 'notifications', icon: Bell },
    { label: 'Pengaturan', path: 'settings', icon: Settings },
  ],
}

// Custom org roles (accepted invitations) fall back to their id.
const ORG_ROLE_LABEL: Record<string, string> = { owner: 'Owner', procurement: 'Procurement', finance: 'Finance', operations: 'Operations', sales: 'Sales' }

function orgWorkspace(org: User['orgs'][number]): Workspace {
  return {
    id: `org:${org.orgId}`, label: org.orgName, caption: ORG_ROLE_LABEL[org.role] ?? org.role, base: `/org/${org.orgId}`,
    icon: Building2, tone: 'blue',
    items: [
      { label: 'Overview', path: '', icon: LayoutDashboard },
      { label: 'Procurement', path: 'procurement', icon: ClipboardList },
      { label: 'Collective', path: 'collective', icon: UsersRound },
      { label: 'Auctions', path: 'auctions', icon: Gavel },
      { label: 'Suppliers', path: 'suppliers', icon: Truck },
      { label: 'Inventory', path: 'inventory', icon: Warehouse },
      { label: 'Transactions', path: 'transactions', icon: ReceiptText },
      { label: 'Analytics', path: 'analytics', icon: ChartColumn },
    ],
    footer: [
      { label: 'Tim', path: 'team', icon: Users },
      { label: 'Profil bisnis', path: 'profile', icon: Building2 },
    ],
  }
}

const marketOps: Workspace = {
  id: 'mm', label: 'Market Ops', caption: 'Market Maker', base: '/mm', icon: Compass, tone: 'purple',
  items: [
    { label: 'Operations', path: '', icon: LayoutDashboard },
    { label: 'Opportunity pipeline', path: 'opportunities', icon: Kanban },
    { label: 'Buat market', path: 'markets/new', icon: SquarePlus },
    { label: 'Analytics', path: 'analytics', icon: ChartColumn },
  ],
}

const governance: Workspace = {
  id: 'admin', label: 'Governance', caption: 'Admin', base: '/admin', icon: ShieldCheck, tone: 'orange',
  items: [
    { label: 'Overview', path: '', icon: LayoutDashboard },
    { label: 'Users', path: 'users', icon: Users },
    { label: 'Verification', path: 'verification', icon: FileCheck2 },
    { label: 'Market Maker', path: 'mm-applications', icon: Compass },
    { label: 'Markets', path: 'markets', icon: Store },
    { label: 'Auctions', path: 'auctions', icon: Gavel },
    { label: 'Disputes', path: 'disputes', icon: Scale },
    { label: 'Fraud', path: 'fraud', icon: ShieldAlert },
    { label: 'Audit', path: 'audit', icon: History },
  ],
}

/** Workspaces this account can switch to, in switcher order (PRD §3). */
export function workspacesFor(user: User): Workspace[] {
  return [
    personal,
    ...user.orgs.map(orgWorkspace),
    ...(user.capabilities.includes('market_maker') ? [marketOps] : []),
    ...(user.capabilities.includes('admin') ? [governance] : []),
  ]
}

/** Every workspace shape, for building routes (guards decide access). */
export const ROUTE_WORKSPACES = [personal, orgWorkspace({ orgId: ':orgId', orgName: '', role: 'owner', verified: false }), marketOps, governance]

export const href = (ws: Workspace, item: NavItem) => (item.path ? `${ws.base}/${item.path}` : ws.base)

export function activeWorkspace(pathname: string, list: Workspace[]) {
  return list.find((ws) => pathname === ws.base || pathname.startsWith(ws.base + '/')) ?? list[0]
}

export const PUBLIC_NAV = [
  { label: 'Explore', to: '/explore' },
  { label: 'Opportunities', to: '/opportunities' },
  { label: 'Markets', to: '/markets' },
  { label: 'Auctions', to: '/auctions' },
]
