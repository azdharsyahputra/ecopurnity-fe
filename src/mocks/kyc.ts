import { delay, http, HttpResponse } from 'msw'
import { KYC_LEVELS, kycLevel, limitError } from '@/domain/kyc'
import { admin, saveAdmin } from './admin'
import { audit } from './audit'
import { db } from './db'
import { personal, savePersonal } from './personal'

// Personal verification (PRD F6): phone OTP, KTP + selfie into the admin verification queue, and the
// per-level commitment limits enforced at bid / accept / buyer auction / quote acceptance.

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()

// ponytail: fixed demo OTP until the BE wires an SMS/WhatsApp provider.
export const DEMO_OTP = '246810'
const otps: Record<string, { phone: string; expiresAt: number }> = {}

function verificationOf(userId: string) {
  const v = personal(userId).identity.profile.verification
  return { ...v, identity: admin.users[userId]?.verified ? ('verified' as const) : v.identity }
}

export const levelOf = (userId: string) => kycLevel(verificationOf(userId))

/** 403 response when the commitment is above the user's verification limit, else null. */
export function commitGuard(userId: string, valueIdr: number) {
  const err = limitError(levelOf(userId), valueIdr)
  return err ? fail(403, 'kyc_limit', err) : null
}

function kyc(userId: string) {
  const level = levelOf(userId)
  return { level, ...KYC_LEVELS[level], verification: verificationOf(userId), otpPending: !!otps[userId] }
}

const session = () => {
  const userId = db.sessionUserId
  return userId && db.users.some((u) => u.id === userId) ? userId : null
}

// Uploads (same rules as the API): presigned-URL stand-in served by MSW itself.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const uploads: Record<string, { owner: string; purpose: string; fileName: string; type: string; size: number; uploaded: boolean; used: boolean }> = {}

function claim(userId: string, id: string | undefined, purpose: string, field: string): string | Record<string, string> {
  const u = id ? uploads[id] : undefined
  if (!u || u.owner !== userId) return { [field]: 'File tidak ditemukan. Unggah ulang.' }
  if (u.purpose !== purpose) return { [field]: 'File ini diunggah untuk keperluan lain.' }
  if (u.used) return { [field]: 'File ini sudah dipakai. Unggah ulang.' }
  if (!u.uploaded) return { [field]: 'File belum selesai diunggah.' }
  return u.fileName
}

export const kycHandlers = [
  http.post(api('/uploads'), async ({ request }) => {
    await delay(150)
    const userId = session()
    if (!userId) return fail(401, 'unauthenticated', 'Belum login')
    const b = (await request.json()) as { purpose: string; fileName: string; contentType: string; sizeBytes: number }
    const fields: Record<string, string> = {}
    if (!['kyc_ktp', 'kyc_selfie'].includes(b.purpose)) fields.purpose = 'Jenis upload tidak dikenal'
    if (!IMAGE_TYPES.includes(b.contentType)) fields.contentType = 'Format file tidak didukung. Pakai JPG, PNG, atau WebP.'
    if (!(b.sizeBytes > 0 && b.sizeBytes <= 8 << 20)) fields.sizeBytes = 'Ukuran file maksimal 8 MB.'
    if (!b.fileName?.trim()) fields.fileName = 'Nama file wajib diisi'
    if (Object.keys(fields).length) return fail(422, 'validation', 'File tidak bisa diunggah', fields)
    const id = crypto.randomUUID()
    uploads[id] = { owner: userId, purpose: b.purpose, fileName: b.fileName.trim(), type: b.contentType, size: b.sizeBytes, uploaded: false, used: false }
    return HttpResponse.json(
      { uploadId: id, method: 'PUT', url: api(`/_mock/storage/${id}`), headers: { 'Content-Type': b.contentType, 'Content-Length': String(b.sizeBytes) }, expiresAt: new Date(Date.now() + 600_000).toISOString() },
      { status: 201 },
    )
  }),
  /** Mock-only: the "object storage" the presigned URL points at. */
  http.put(api('/_mock/storage/:id'), async ({ params, request }) => {
    const u = uploads[String(params.id)]
    const body = await request.arrayBuffer()
    if (!u || body.byteLength !== u.size) return new HttpResponse(null, { status: 403 })
    u.uploaded = true
    return new HttpResponse(null, { status: 200 })
  }),

  http.get(api('/me/kyc'), async () => {
    await delay(150)
    const userId = session()
    return userId ? HttpResponse.json(kyc(userId)) : fail(401, 'unauthenticated', 'Belum login')
  }),

  http.post(api('/me/kyc/phone'), async ({ request }) => {
    await delay(400)
    const userId = session()
    if (!userId) return fail(401, 'unauthenticated', 'Belum login')
    const { phone } = (await request.json()) as { phone?: string }
    const digits = (phone ?? '').replace(/\D/g, '')
    if (!/^(62|0)8\d{7,11}$/.test(digits)) return fail(422, 'validation', 'Nomor HP tidak valid', { phone: 'Contoh: 0812xxxxxxxx' })
    otps[userId] = { phone: digits, expiresAt: Date.now() + 5 * 60_000 }
    return HttpResponse.json(kyc(userId))
  }),

  http.post(api('/me/kyc/phone/verify'), async ({ request }) => {
    await delay(400)
    const userId = session()
    if (!userId) return fail(401, 'unauthenticated', 'Belum login')
    const pending = otps[userId]
    if (!pending || pending.expiresAt < Date.now()) return fail(409, 'otp_expired', 'Kode kedaluwarsa, kirim ulang')
    const { code } = (await request.json()) as { code?: string }
    if (code !== DEMO_OTP) return fail(422, 'validation', 'Kode salah', { code: 'Kode tidak cocok' })
    delete otps[userId]
    personal(userId).identity.profile.verification.phone = true
    savePersonal()
    return HttpResponse.json(kyc(userId))
  }),

  http.post(api('/me/kyc/identity'), async ({ request }) => {
    await delay(500)
    const userId = session()
    if (!userId) return fail(401, 'unauthenticated', 'Belum login')
    const { nik, fullName, ktpUploadId, selfieUploadId } = (await request.json()) as Record<string, string | undefined>
    const fields: Record<string, string> = {}
    if (!/^\d{16}$/.test(nik ?? '')) fields.nik = 'NIK 16 digit'
    if (!fullName?.trim()) fields.fullName = 'Sesuai KTP'
    if (!ktpUploadId) fields.ktpUploadId = 'Unggah foto KTP'
    if (!selfieUploadId) fields.selfieUploadId = 'Unggah selfie dengan KTP'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Data belum lengkap', fields)
    const v = verificationOf(userId)
    if (v.identity !== 'none') return fail(409, 'already_submitted', v.identity === 'verified' ? 'Identitas sudah terverifikasi' : 'Pengajuan sedang ditinjau')
    const ktpFile = claim(userId, ktpUploadId, 'kyc_ktp', 'ktpUploadId')
    const selfieFile = claim(userId, selfieUploadId, 'kyc_selfie', 'selfieUploadId')
    if (typeof ktpFile !== 'string' || typeof selfieFile !== 'string')
      return fail(422, 'validation', 'Periksa kembali file yang diunggah', { ...(typeof ktpFile === 'string' ? {} : ktpFile), ...(typeof selfieFile === 'string' ? {} : selfieFile) })
    uploads[ktpUploadId!].used = true
    uploads[selfieUploadId!].used = true
    const owner = db.users.find((u) => u.id === userId)!.name
    admin.verifications.unshift({
      id: `ver-${userId}-${Date.now().toString(36)}`, kind: 'personal', business: fullName!.trim(), owner, submittedAt: now(), status: 'pending',
      form: [{ label: 'Nama lengkap', value: fullName!.trim() }, { label: 'NIK', value: `${nik!.slice(0, 4)}********${nik!.slice(12)}` }],
      documents: [
        { kind: 'ktp', fileName: ktpFile!, fields: [{ label: 'NIK', value: nik! }, { label: 'Nama lengkap', value: fullName!.trim().toUpperCase() }] },
        { kind: 'selfie', fileName: selfieFile!, fields: [{ label: 'Kecocokan wajah', value: 'Tinggi (demo)' }] },
      ],
    })
    personal(userId).identity.profile.verification.identity = 'pending'
    savePersonal()
    saveAdmin()
    audit({ actor: owner, action: 'Ajukan verifikasi KTP', entity: { type: 'user', id: userId, label: owner } })
    return HttpResponse.json(kyc(userId))
  }),
]
