import type { Capability, CategoryId } from './types'
import type { Tone } from './status'
import { CATEGORIES } from './catalog'



export type MmApplicationStatus = 'pending' | 'approved' | 'rejected'

export const MM_STATUS: Record<MmApplicationStatus, [string, Tone]> = {
  pending: ['Direview', 'yellow'],
  approved: ['Disetujui', 'green'],
  rejected: ['Ditolak', 'red'],
}

export interface MmApplicationInput {
  organization: string
  categories: CategoryId[]

  experience: string

  documents: string
}

export interface MmApplication extends MmApplicationInput {
  id: string
  userId: string
  applicant: string
  email: string
  status: MmApplicationStatus
  submittedAt: string
  decision?: { by: string; at: string; reason?: string }
}

export const MIN_EXPERIENCE = 30


export function mmApplicationErrors(i: MmApplicationInput): Record<string, string> {
  const f: Record<string, string> = {}
  if (i.organization.trim().length < 3) f.organization = 'Isi nama organisasi'
  if (!i.categories.length) f.categories = 'Pilih minimal satu kategori'
  else if (i.categories.some((c) => !Object.hasOwn(CATEGORIES, c))) f.categories = 'Kategori tidak dikenal'
  if (i.experience.trim().length < MIN_EXPERIENCE) f.experience = `Ceritakan minimal ${MIN_EXPERIENCE} karakter`
  return f
}


export function mmApplyBlocked(capabilities: Capability[], latest?: Pick<MmApplication, 'status'> | null) {
  if (capabilities.includes('market_maker')) return 'Akunmu sudah Market Maker'
  if (latest?.status === 'pending') return 'Pengajuanmu masih direview'
  return undefined
}

export const ORG_TYPES = ['PT', 'CV', 'Koperasi', 'UMKM', 'Asosiasi', 'Kelompok tani', 'Yayasan'] as const
export type OrgType = (typeof ORG_TYPES)[number]

export interface NewOrgInput {
  name: string
  type: OrgType

  npwp?: string
  categoryId: CategoryId
}


export function newOrgErrors(i: NewOrgInput, taken: string[] = []): Record<string, string> {
  const f: Record<string, string> = {}
  const name = i.name.trim()
  if (name.length < 3) f.name = 'Minimal 3 karakter'
  else if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) f.name = 'Kamu sudah tergabung di organisasi dengan nama ini'
  if (!ORG_TYPES.includes(i.type)) f.type = 'Pilih jenis organisasi'
  const digits = i.npwp?.replace(/\D/g, '') ?? ''
  if (digits && digits.length !== 15 && digits.length !== 16) f.npwp = 'NPWP 15 atau 16 digit'
  if (!Object.hasOwn(CATEGORIES, i.categoryId)) f.categoryId = 'Pilih kategori'
  return f
}


export interface OrgInvitation {
  id: string
  orgId: string
  orgName: string
  role: string
  roleLabel: string
  department: string
  invitedAt: string
}

export type InvitationAction = 'accept' | 'decline'
