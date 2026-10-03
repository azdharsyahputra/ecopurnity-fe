import { describe, expect, it } from 'vitest'
import { attachmentsBlocker, move, thumbnailOf, toRefs, type AttachmentDraft } from './attachments'

const d = (x: Partial<AttachmentDraft>): AttachmentDraft => ({ key: x.id ?? x.uploadId ?? 'k', fileName: 'f', contentType: 'image/png', ...x })

describe('listing attachments', () => {
  it('moves an item and leaves the ends alone', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2])
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
  })
  it('sends kept ids and new upload ids in order', () => {
    expect(toRefs([d({ uploadId: 'u1' }), d({ id: 'a1' }), d({ error: 'x' })])).toEqual([{ uploadId: 'u1' }, { id: 'a1' }])
  })
  it('blocks while uploading, on failures and over the limit', () => {
    expect(attachmentsBlocker([d({ id: 'a' })])).toBeUndefined()
    expect(attachmentsBlocker([d({})])).toBe('Tunggu file selesai diunggah')
    expect(attachmentsBlocker([d({ error: 'x' })])).toBe('Hapus file yang gagal diunggah')
    expect(attachmentsBlocker(Array.from({ length: 9 }, (_, i) => d({ id: String(i) })))).toBe('Maksimal 8 lampiran')
  })
  it('picks the first image with a file as thumbnail', () => {
    const pdf = { id: '1', fileName: 'a.pdf', contentType: 'application/pdf', url: 'u1' }
    const legacy = { id: '2', fileName: 'b.jpg', contentType: 'image/jpeg' }
    const img = { id: '3', fileName: 'c.png', contentType: 'image/png', url: 'u3' }
    expect(thumbnailOf([pdf, legacy, img])).toBe(img)
    expect(thumbnailOf([pdf, legacy])).toBeUndefined()
  })
})
