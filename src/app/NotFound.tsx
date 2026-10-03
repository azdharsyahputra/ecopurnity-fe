import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/States'
import { Button } from '@/components/ui/button'

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
