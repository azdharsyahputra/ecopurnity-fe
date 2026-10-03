import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { AllocationLine, AuditEntry, Transaction, TransactionDetail } from '@/domain/types'
import type { TradeAction } from '@/domain/trade'
import type { TradeScope } from '@/features/trade/hooks'
import {
  can, deniedReason, txDeniedReason, type Action, type CollectivePool, type InventoryData, type InventoryItem, type Module, type OrgAnalytics, type OrgAuctionEvaluation,
  type OrgAuctionInput, type OrgAuctionView, type OrgOverview, type OrgProfile, type OrgSettings, type OrgSupplier, type PoolSettlement, type ProcurementAction,
  type ProcurementInput, type ProcurementRequest, type SupplierAction, type SupplierDetail, type TeamData,
} from '@/domain/org'
import { useMe } from '@/features/auth/hooks'

// Business workspace data (PRD §9). Keys start with ['org', orgId] so one invalidation refreshes the workspace.

const json = (method: string, body?: unknown) => ({ method, json: body })

export const useOrgId = () => useParams().orgId ?? ''
const base = (orgId: string) => `/orgs/${orgId}`

/** Mutations touch several views (overview, pipeline, activity); refresh the whole org plus public auctions. */
function useOrgMutation<V, R = unknown>(fn: (orgId: string, v: V) => Promise<R>) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: V) => fn(orgId, v),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['org', orgId] }), qc.invalidateQueries({ queryKey: ['auctions'] })]),
  })
}

export const useOrgSettings = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'settings'], queryFn: () => api<OrgSettings>(base(orgId)) })
}

/** The signed-in user's role in this org and what it may do (PRD §9.2 role awareness). */
export function useOrgAccess() {
  const orgId = useOrgId()
  const me = useMe().data
  const settings = useOrgSettings().data
  const role = me?.orgs.find((o) => o.orgId === orgId)?.role ?? 'sales'
  const roleLabel = settings?.roles.find((r) => r.id === role)?.label ?? role
  return {
    orgId, role, roleLabel, base: `/org/${orgId}`, settings,
    can: (m: Module, a: Action) => can(settings?.permissions, role, m, a),
    /** Reason to show on a disabled control, or undefined when allowed. */
    deny: (m: Module, a: Action) => (can(settings?.permissions, role, m, a) ? undefined : deniedReason(roleLabel, m, a)),
    /** Same for one transaction step (per-action roles, PRD §9.8). */
    txDeny: (a: TradeAction) => txDeniedReason(settings?.permissions, role, roleLabel, a),
  }
}

export const useOverview = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'overview'], queryFn: () => api<OrgOverview>(`${base(orgId)}/overview`), refetchInterval: 10_000 })
}

// ── Profile & team ──
export const useSaveProfile = () => useOrgMutation((orgId, p: OrgProfile) => api<OrgProfile>(`${base(orgId)}/profile`, json('PUT', p)))
export const useUploadDocument = () =>
  useOrgMutation((orgId, d: { name: string; kind: OrgProfile['documents'][number]['kind'] }) => api<OrgProfile>(`${base(orgId)}/profile/documents`, json('POST', d)))
export const useRequestVerification = () => useOrgMutation<void, OrgProfile>((orgId) => api<OrgProfile>(`${base(orgId)}/profile/verification`, json('POST')))

export const useTeam = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'team'], queryFn: () => api<TeamData>(`${base(orgId)}/team`) })
}
export const useInvite = () => useOrgMutation((orgId, b: { email: string; role: string; department: string }) => api(`${base(orgId)}/team/invite`, json('POST', b)))
export const useMemberAction = () =>
  useOrgMutation((orgId, a: { id: string; remove: true } | { id: string; role?: string; department?: string }) =>
    'remove' in a ? api(`${base(orgId)}/team/members/${a.id}`, json('DELETE')) : api(`${base(orgId)}/team/members/${a.id}`, json('PATCH', { role: a.role, department: a.department })),
  )
export const useSaveTeamSettings = () =>
  useOrgMutation((orgId, s: Pick<OrgSettings, 'roles' | 'permissions' | 'departments' | 'approvalRules'>) => api<OrgSettings>(`${base(orgId)}/team/settings`, json('PUT', s)))

// ── Inventory ──
export const useInventory = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'inventory'], queryFn: () => api<InventoryData>(`${base(orgId)}/inventory`) })
}
export const useAddItem = () => useOrgMutation((orgId, i: Omit<InventoryItem, 'id'>) => api(`${base(orgId)}/inventory/items`, json('POST', i)))
export const useImportItems = () =>
  useOrgMutation((orgId, b: { items: Omit<InventoryItem, 'id'>[]; fileName: string }) => api<{ imported: number }>(`${base(orgId)}/inventory/import`, json('POST', b)))
export const useAddSchedule = () =>
  useOrgMutation((orgId, s: Omit<InventoryData['schedules'][number], 'id'>) => api(`${base(orgId)}/inventory/schedules`, json('POST', s)))

// ── Procurement ──
export const useProcurements = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'procurement'], queryFn: () => api<ProcurementRequest[]>(`${base(orgId)}/procurement`), refetchInterval: 8_000 })
}
export const useProcurement = (id: string) => {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['org', orgId, 'procurement', id],
    queryFn: () => api<{ request: ProcurementRequest; activity: AuditEntry[]; pool: CollectivePool | null }>(`${base(orgId)}/procurement/${id}`),
  })
}
export const useCreateProcurement = () =>
  useOrgMutation((orgId, b: ProcurementInput & { submit: boolean }) => api<ProcurementRequest>(`${base(orgId)}/procurement`, json('POST', b)))
export const useProcurementAction = (id: string) =>
  useOrgMutation((orgId, b: { action: ProcurementAction; note?: string; quantity?: number; optIn?: boolean }) => api<ProcurementRequest>(`${base(orgId)}/procurement/${id}/actions`, json('POST', b)))

// ── Collective ──
export type PoolView = CollectivePool & { match: boolean }
export const usePools = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'collective'], queryFn: () => api<PoolView[]>(`${base(orgId)}/collective`), refetchInterval: 10_000 })
}
export const usePoolAction = () =>
  useOrgMutation((orgId, a: { id: string; type: 'join'; quantity: number; optIn: boolean } | { id: string; type: 'leave' | 'market' }) =>
    api(`${base(orgId)}/collective/${a.id}/${a.type}`, json('POST', a.type === 'join' ? { quantity: a.quantity, optIn: a.optIn } : undefined)),
  )
export const useCreatePool = () =>
  useOrgMutation((orgId, b: { title: string; categoryId: string; spec: string; region: string; deadline: string; unit: string; quantity: number; baseUnitPriceIdr: number; optIn: boolean }) =>
    api<CollectivePool>(`${base(orgId)}/collective`, json('POST', b)),
  )

// ── Auctions ──
export const useOrgAuctions = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'auctions'], queryFn: () => api<OrgAuctionView[]>(`${base(orgId)}/auctions`), refetchInterval: 8_000 })
}
export const useCreateOrgAuction = () => useOrgMutation((orgId, input: OrgAuctionInput) => api<OrgAuctionView>(`${base(orgId)}/auctions`, json('POST', input)))
export const useOrgAuctionDecision = () =>
  useOrgMutation((orgId, b: { id: string; action: 'approve' | 'reject'; note?: string }) => api<OrgAuctionView>(`${base(orgId)}/auctions/${b.id}/actions`, json('POST', b)))
export const useOrgEvaluation = (id: string) => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'evaluation', id], queryFn: () => api<OrgAuctionEvaluation>(`${base(orgId)}/auctions/${id}/evaluation`), refetchInterval: 6_000 })
}
export const useOrgAward = (id: string) =>
  useOrgMutation((orgId, b: { lines: AllocationLine[][]; reason: string }) => api<OrgAuctionView>(`${base(orgId)}/auctions/${id}/award`, json('POST', b)))
export const useIssuePo = (id: string) =>
  useOrgMutation<void, { poNumber: string; transactionIds: string[] }>((orgId) => api<{ poNumber: string; transactionIds: string[] }>(`${base(orgId)}/auctions/${id}/po`, json('POST')))

// ── Suppliers ──
export const useSuppliers = (search: string) => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'suppliers', search], queryFn: () => api<OrgSupplier[]>(`${base(orgId)}/suppliers${search ? `?${search}` : ''}`) })
}
export type SupplierPage = SupplierDetail & { purchases: OrgAnalytics['history']; activity: AuditEntry[] }
export const useSupplier = (id: string) => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'supplier', id], queryFn: () => api<SupplierPage>(`${base(orgId)}/suppliers/${id}`) })
}
export const useSupplierAction = () =>
  useOrgMutation((orgId, b: { id: string; action: SupplierAction; rating?: number; reason?: string }) => api<OrgSupplier>(`${base(orgId)}/suppliers/${b.id}/actions`, json('POST', b)))

// ── Transactions ──
export const useOrgTransactions = () => {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['org', orgId, 'transactions'], queryFn: () => api<Transaction[]>(`${base(orgId)}/transactions`) })
}
/** Trade detail plus team activity and, for a pool sub-PO, the pool's pro-rata split. */
export type OrgTransactionPage = TransactionDetail & { activity: AuditEntry[]; collective?: PoolSettlement & { poolId: string; title: string; unit: string } }
export const useOrgTransaction = (id: string) => {
  const orgId = useOrgId()
  // Fictional counterparties move on a timer, so keep the page fresh.
  return useQuery({ queryKey: ['org', orgId, 'transactions', id], queryFn: () => api<OrgTransactionPage>(`${base(orgId)}/transactions/${id}`), refetchInterval: 6_000 })
}
/** Where this org's trade actions go (shared F6 trade UI). */
export function useOrgTradeScope(): TradeScope {
  const orgId = useOrgId()
  return {
    actionUrl: (id) => `${base(orgId)}/transactions/${id}/actions`,
    onSuccess: (qc, t) => {
      qc.setQueryData(['org', orgId, 'transactions', t.id], t)
      return qc.invalidateQueries({ queryKey: ['org', orgId] })
    },
  }
}

// ── Analytics ──
export const useAnalytics = (months: number, category: string) => {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['org', orgId, 'analytics', months, category],
    queryFn: () => api<OrgAnalytics>(`${base(orgId)}/analytics?months=${months}${category ? `&category=${category}` : ''}`),
    placeholderData: (prev) => prev,
  })
}
