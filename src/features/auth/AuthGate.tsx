import { Link, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconChip } from '@/components/IconChip'

export function AuthGateDialog() {
  const { authGate, closeAuthGate } = useUi()
  const { pathname, search } = useLocation()
  const returnTo = encodeURIComponent(pathname + search)

  return (
    <Dialog open={authGate !== null} onOpenChange={(o) => !o && closeAuthGate()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <IconChip icon={LogIn} tone="teal" size="lg" className="mb-1" />
          <DialogTitle>Masuk untuk lanjut</DialogTitle>
          <DialogDescription>
            Kamu perlu akun Ecopurnity untuk {authGate}. Setelah masuk, kamu kembali ke halaman ini.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" render={<Link to={`/register?returnTo=${returnTo}`} />} onClick={closeAuthGate}>
            Daftar gratis
          </Button>
          <Button render={<Link to={`/login?returnTo=${returnTo}`} />} onClick={closeAuthGate}>
            Masuk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
