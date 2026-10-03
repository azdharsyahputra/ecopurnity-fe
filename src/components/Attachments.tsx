import { ChevronLeft, ChevronRight, FileText, LoaderCircle, Paperclip, X } from 'lucide-react'
import type { ListingAttachment } from '@/domain/types'
import { isImage, isPending, MAX_LISTING_ATTACHMENTS, move, type AttachmentDraft } from '@/domain/attachments'
import { uploadErrorMessage, uploadFile } from '@/lib/upload'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

/** Multi-file picker for listing photos and PDFs: each file uploads right away; remove and reorder before saving. */
export function AttachmentsField({ value, onChange, label, error }: {
  value: AttachmentDraft[]
  onChange: (update: (list: AttachmentDraft[]) => AttachmentDraft[]) => void
  label: string
  error?: string
}) {
  const room = MAX_LISTING_ATTACHMENTS - value.length
  const patch = (key: string, p: Partial<AttachmentDraft>) => onChange((list) => list.map((a) => (a.key === key ? { ...a, ...p } : a)))

  function add(files: File[]) {
    for (const file of files.slice(0, room)) {
      const key = crypto.randomUUID()
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      onChange((list) => [...list, { key, fileName: file.name, contentType: file.type, preview }])
      uploadFile(file, 'listing_attachment').then(
        (uploadId) => patch(key, { uploadId }),
        (e: unknown) => patch(key, { error: uploadErrorMessage(e) }),
      )
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm', room > 0 ? 'cursor-pointer hover:bg-hover' : 'opacity-60')}>
        <Paperclip className="size-5 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">JPG, PNG, WebP, PDF · maks 10 MB per file · {value.length}/{MAX_LISTING_ATTACHMENTS}</span>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          disabled={room <= 0}
          className="sr-only"
          onChange={(e) => {
            add([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Lampiran">
          {value.map((a, i) => (
            <li key={a.key} className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-1.5">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
                {isImage(a) && a.preview ? (
                  <img src={a.preview} alt={a.fileName} className="size-full object-cover" />
                ) : (
                  <FileText className="size-8 text-muted-foreground" aria-hidden />
                )}
                {isPending(a) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/60" role="status" aria-label={`Mengunggah ${a.fileName}`}>
                    <LoaderCircle className="size-5 animate-spin" />
                  </span>
                )}
              </div>
              <p className="truncate text-xs" title={a.fileName}>{a.fileName}</p>
              {a.error && <p className="text-xs text-destructive">{a.error}</p>}
              <div className="flex items-center">
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Geser ${a.fileName} ke kiri`} disabled={i === 0} onClick={() => onChange((list) => move(list, i, -1))}><ChevronLeft /></Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Geser ${a.fileName} ke kanan`} disabled={i === value.length - 1} onClick={() => onChange((list) => move(list, i, 1))}><ChevronRight /></Button>
                <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Hapus ${a.fileName}`} onClick={() => onChange((list) => list.filter((x) => x.key !== a.key))}><X /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Images as a thumbnail grid (opens the full file in a new tab), PDFs as links, legacy names without a file as chips. */
export function AttachmentGallery({ attachments, className }: { attachments: ListingAttachment[]; className?: string }) {
  if (!attachments.length) return null
  const images = attachments.filter((a) => a.url && isImage(a))
  const files = attachments.filter((a) => !(a.url && isImage(a)))
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <img src={a.url} alt={a.fileName} loading="lazy" className="size-full object-cover transition-transform hover:scale-105" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((a) => (
            <li key={a.id}>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-hover">
                  <FileText className="size-3.5 shrink-0" /> <span className="truncate">{a.fileName}</span>
                </a>
              ) : (
                <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-dashed px-2 text-xs text-muted-foreground" title="Nama file saja, tanpa berkas">
                  <Paperclip className="size-3.5 shrink-0" /> <span className="truncate">{a.fileName}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
