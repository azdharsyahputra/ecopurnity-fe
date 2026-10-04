import { delay, http, HttpResponse } from 'msw'
import type { OrgRole } from '@/domain/types'
import {
  mmApplicationErrors, mmApplyBlocked, newOrgErrors, type InvitationAction, type MmApplication, type MmApplicationInput, type NewOrgInput,
  type OrgInvitation,
} from '@/domain/roles'
import { CATEGORIES } from '@/domain/catalog'
import { audit } from './audit'
import { db, saveRoles, toUser, type MockUser } from './db'
import { notify } from './personal'
import { allOrgs, newId, org, orgAudit, saveOrg } from './org'
import { asAdmin, reasonError } from './adminHandlers'



const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()
const sessionUser = () => db.users.find((u) => u.id === db.sessionUserId)

const KEY = 'ecp-mock-mm-applications'
const applications: MmApplication[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
})()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(applications))
  } catch {
    // per-tab only
  }
}

const latestOf = (userId: string) => applications.find((a) => a.userId === userId) ?? null


export function createMmApplication(user: MockUser, input: MmApplicationInput) {
  const a: MmApplication = {
    id: newId('mma'), userId: user.id, applicant: user.name, email: user.email, status: 'pending', submittedAt: now(),
    organization: input.organization.trim(), categories: input.categories, experience: input.experience.trim(), documents: input.documents.trim(),
  }
  applications.unshift(a)
  save()
  audit({ actor: user.name, action: 'Ajukan Market Maker', entity: { type: 'user', id: user.id, label: user.name } })
  for (const admin of db.users.filter((u) => u.capabilities.includes('admin'))) {
    notify(admin.id, { type: 'transaction_update', title: 'Pengajuan Market Maker baru', body: `${user.name} (${a.organization}) menunggu review.`, href: '/admin/mm-applications' })
  }
  return a
}


function invitationsFor(email: string): OrgInvitation[] {
  return allOrgs().flatMap(([orgId, o]) =>
    o.members
      .filter((m) => m.status === 'invited' && m.email === email)
      .map((m) => ({
        id: m.id, orgId, orgName: o.settings.profile.name, role: m.role, department: m.department, invitedAt: m.joinedAt,
        roleLabel: o.settings.roles.find((r) => r.id === m.role)?.label ?? m.role,
      })),
  )
}

export const roleHandlers = [

  http.get(api('/me/mm-application'), async () => {
    await delay(200)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    return HttpResponse.json(latestOf(user.id))
  }),

  http.post(api('/me/mm-application'), async ({ request }) => {
    await delay(400)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    const blocked = mmApplyBlocked(user.capabilities, latestOf(user.id))
    if (blocked) return fail(409, 'conflict', blocked)
    const input = (await request.json()) as MmApplicationInput
    const fields = mmApplicationErrors(input)
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa lagi isian pengajuan', fields)
    return HttpResponse.json(createMmApplication(user, input), { status: 201 })
  }),

  http.get(api('/admin/mm-applications'), asAdmin(() =>
    HttpResponse.json([...applications].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.submittedAt.localeCompare(a.submittedAt))),
  )),

  http.post(api('/admin/mm-applications/:id/actions'), asAdmin(async ({ params, request, actor }) => {
    const a = applications.find((x) => x.id === params.id)
    if (!a) return fail(404, 'not_found', 'Pengajuan tidak ditemukan')
    if (a.status !== 'pending') return fail(409, 'conflict', 'Pengajuan ini sudah diputuskan')
    const { action, reason } = (await request.json()) as { action: 'approve' | 'reject'; reason?: string }
    if (action === 'reject') {
      const err = reasonError(reason)
      if (err) return err
    }
    const user = db.users.find((u) => u.id === a.userId)
    if (!user) return fail(404, 'not_found', 'Akun pengaju tidak ditemukan')
    a.status = action === 'approve' ? 'approved' : 'rejected'
    a.decision = { by: actor, at: now(), reason: reason?.trim() || undefined }
    if (action === 'approve' && !user.capabilities.includes('market_maker')) {
      user.capabilities.push('market_maker')
      saveRoles(user)
    }
    save()
    audit({
      actor, action: action === 'approve' ? 'Setujui pengajuan Market Maker' : 'Tolak pengajuan Market Maker', entity: { type: 'user', id: user.id, label: user.name },
      reason: a.decision.reason, changes: action === 'approve' ? [{ field: 'Capability', after: 'market_maker' }] : undefined,
    })
    notify(user.id, action === 'approve'
      ? { type: 'transaction_update', title: 'Kamu sekarang Market Maker', body: 'Workspace Market Ops sudah aktif di pemilih workspace.', href: '/mm' }
      : { type: 'transaction_update', title: 'Pengajuan Market Maker ditolak', body: a.decision.reason ?? '', href: '/app?activate=mm' })
    return HttpResponse.json(a)
  })),


  http.get(api('/me/invitations'), async () => {
    await delay(200)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    return HttpResponse.json(invitationsFor(user.email))
  }),

  http.post(api('/me/invitations/:id'), async ({ params, request }) => {
    await delay(400)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    const inv = invitationsFor(user.email).find((i) => i.id === params.id)
    if (!inv) return fail(404, 'not_found', 'Undangan tidak ditemukan atau sudah tidak berlaku')
    const { action } = (await request.json()) as { action: InvitationAction }
    const o = org(inv.orgId)
    const m = o.members.find((x) => x.id === inv.id)!
    if (action === 'accept') {
      Object.assign(m, { status: 'active', userId: user.id, name: user.name, joinedAt: now() })

      if (!user.orgs.some((x) => x.orgId === inv.orgId)) {
        user.orgs.push({ orgId: inv.orgId, orgName: inv.orgName, role: inv.role as OrgRole, verified: o.settings.profile.verification === 'verified' })
        saveRoles(user)
      }
    } else {
      o.members = o.members.filter((x) => x !== m)
    }
    orgAudit(o, {
      actor: user.name, action: action === 'accept' ? 'Terima undangan' : 'Tolak undangan', entity: { type: 'user', id: user.id, label: user.name },
      changes: action === 'accept' ? [{ field: 'Peran', after: inv.roleLabel }] : undefined,
    })
    for (const owner of o.members.filter((x) => x.role === 'owner' && x.userId && x.userId !== user.id)) {
      notify(owner.userId!, {
        type: 'transaction_update', title: action === 'accept' ? `${user.name} bergabung ke ${inv.orgName}` : `${user.name} menolak undangan`,
        body: action === 'accept' ? `Sebagai ${inv.roleLabel}, ${inv.department}.` : `Undangan sebagai ${inv.roleLabel} di ${inv.orgName} ditutup.`, href: `/org/${inv.orgId}/team`,
      })
    }
    return HttpResponse.json(toUser(user))
  }),


  http.post(api('/orgs'), async ({ request }) => {
    await delay(500)
    const user = sessionUser()
    if (!user) return fail(401, 'unauthenticated', 'Belum login')
    const input = (await request.json()) as NewOrgInput
    const fields = newOrgErrors(input, user.orgs.map((x) => x.orgName))
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa lagi data organisasi', fields)
    const orgId = newId('org')
    const name = input.name.trim()
    user.orgs.push({ orgId, orgName: name, role: 'owner', verified: false })
    saveRoles(user)

    const o = org(orgId)
    Object.assign(o.settings.profile, { industry: `${input.type} · ${CATEGORIES[input.categoryId].label}`, categories: [input.categoryId] })
    o.settings.profile.legal.npwp = input.npwp?.trim() ?? ''
    saveOrg()
    orgAudit(o, { actor: `${user.name} (Owner)`, action: 'Buat organisasi', entity: { type: 'business', id: orgId, label: name } })
    return HttpResponse.json({ orgId, user: toUser(user) }, { status: 201 })
  }),
]
