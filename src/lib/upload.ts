import { api, ApiError } from './api'

// Files go straight from the browser to object storage (Cloudflare R2 in production) through a presigned URL from
// POST /uploads; the endpoint that uses the file gets the upload id and verifies it (contract: api/openapi.yaml).

export type UploadPurpose = 'kyc_ktp' | 'kyc_selfie' | 'org_document' | 'trade_proof' | 'dispute_evidence'

interface UploadTicket {
  uploadId: string
  method: 'PUT'
  url: string
  headers: Record<string, string>
  expiresAt: string
}

/** Uploads `file` and returns its upload id. Slot validation errors come back as ApiError with fields contentType/sizeBytes. */
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const ticket = await api<UploadTicket>('/uploads', {
    method: 'POST',
    json: { purpose, fileName: file.name, contentType: file.type, sizeBytes: file.size },
  })
  // Content-Length is set by the browser from the body (it is a forbidden header to set by hand).
  const headers = Object.fromEntries(Object.entries(ticket.headers).filter(([k]) => k.toLowerCase() !== 'content-length'))
  const res = await fetch(ticket.url, { method: ticket.method, headers, body: file })
  if (!res.ok) throw new ApiError(res.status, { error: { code: 'upload_failed', message: 'Gagal mengunggah file. Coba lagi.' } })
  return ticket.uploadId
}

/** The message to show under a file input for an upload error. */
export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.fields?.contentType ?? e.fields?.sizeBytes ?? e.message
  return 'Gagal mengunggah file. Coba lagi.'
}
