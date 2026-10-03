import { Link } from 'react-router-dom'
import { Construction, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/domain/status'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'

/** Stand-in for pages a later roadmap phase builds; keeps every PRD route reachable. */
export function Placeholder({ title, icon, tone, phase }: { title: string; icon?: LucideIcon; tone?: Tone; phase: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={title} icon={icon} tone={tone} />
      <EmptyState
        icon={Construction}
        tone="yellow"
        title={`Dibangun di fase ${phase}`}
        description="Route dan navigasi sudah siap. Isi halaman menyusul sesuai roadmap PRD."
        action={
          <Button variant="outline" render={<Link to="/legacy" />}>
            Lihat versi lama
          </Button>
        }
      />
    </div>
  )
}

export function NotFound() {
  return (
    <div className="grid min-h-[60svh] place-items-center px-4">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Link-nya mungkin salah atau halamannya sudah dipindah."
        action={<Button render={<Link to="/" />}>Ke beranda</Button>}
        className="w-full max-w-md"
      />
    </div>
  )
}
