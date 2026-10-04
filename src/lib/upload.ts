import { api, ApiError } from './api'




export type UploadPurpose = 'kyc_ktp' | 'kyc_selfie' | 'org_document' | 'listing_attachment' | 'trade_proof' | 'dispute_evidence'

interface UploadTicket {
  uploadId: string
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresAt: string
}


export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const ticket = await api<UploadTicket>('/uploads', {
    method: 'POST',
    json: { purpose, fileName: file.name, contentType: file.type, sizeBytes: file.size },
  })

  const headers = Object.fromEntries(Object.entries(ticket.headers).filter(([k]) => k.toLowerCase() !== 'content-length'))
  const res = await fetch(ticket.url, { method: ticket.method, headers, body: file })
  if (!res.ok) throw new ApiError(res.status, { error: { code: 'upload_failed', message: 'Gagal mengunggah file. Coba lagi.' } })
  return ticket.uploadId
}


export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.fields?.contentType ?? e.fields?.sizeBytes ?? e.message
  return 'Gagal mengunggah file. Coba lagi.'
}
