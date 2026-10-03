import type { ListingAttachment, ListingAttachmentInput } from './types'

/** Listing attachments (photos and documents): the same limits as the API. */
export const MAX_LISTING_ATTACHMENTS = 8

export const isImage = (a: { contentType: string }) => a.contentType.startsWith('image/')

/** The card thumbnail: the first image that has a file. */
export const thumbnailOf = (list: ListingAttachment[]) => list.find((a) => a.url && isImage(a))

/** `list` with item `i` swapped with its neighbour in direction `d`; unchanged at the ends. */
export function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** A form entry: an existing attachment (`id`), a finished upload (`uploadId`), one in flight, or a failed one (`error`). */
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

/** The ordered set to send: kept attachments by id, new files by upload id. */
export const toRefs = (list: AttachmentDraft[]): ListingAttachmentInput[] =>
  list.flatMap((a): ListingAttachmentInput[] => (a.id ? [{ id: a.id }] : a.uploadId ? [{ uploadId: a.uploadId }] : []))

/** Why the form cannot be saved yet, if anything. */
export function attachmentsBlocker(list: AttachmentDraft[]): string | undefined {
  if (list.some(isPending)) return 'Tunggu file selesai diunggah'
  if (list.some((a) => a.error)) return 'Hapus file yang gagal diunggah'
  if (list.length > MAX_LISTING_ATTACHMENTS) return `Maksimal ${MAX_LISTING_ATTACHMENTS} lampiran`
  return undefined
}
