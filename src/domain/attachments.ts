import type { ListingAttachment, ListingAttachmentInput } from './types'


export const MAX_LISTING_ATTACHMENTS = 8

export const isImage = (a: { contentType: string }) => a.contentType.startsWith('image/')


export const thumbnailOf = (list: ListingAttachment[]) => list.find((a) => a.url && isImage(a))


export function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}


export interface AttachmentDraft {
  key: string
  fileName: string
  contentType: string
  preview?: string
  id?: string
  uploadId?: string
  error?: string
}

export const draftsOf = (list: ListingAttachment[]): AttachmentDraft[] =>
  list.map((a) => ({ key: a.id, id: a.id, fileName: a.fileName, contentType: a.contentType, preview: a.url }))

export const isPending = (a: AttachmentDraft) => !a.id && !a.uploadId && !a.error


export const toRefs = (list: AttachmentDraft[]): ListingAttachmentInput[] =>
  list.flatMap((a): ListingAttachmentInput[] => (a.id ? [{ id: a.id }] : a.uploadId ? [{ uploadId: a.uploadId }] : []))


export function attachmentsBlocker(list: AttachmentDraft[]): string | undefined {
  if (list.some(isPending)) return 'Tunggu file selesai diunggah'
  if (list.some((a) => a.error)) return 'Hapus file yang gagal diunggah'
  if (list.length > MAX_LISTING_ATTACHMENTS) return `Maksimal ${MAX_LISTING_ATTACHMENTS} lampiran`
  return undefined
}
