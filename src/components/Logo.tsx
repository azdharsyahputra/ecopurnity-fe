import { Link } from 'react-router-dom'
import logo from '@/assets/ecopurnity-96.png'
import { cn } from '@/lib/utils'

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <img src={logo} alt="" className="size-7" />
      <span>Ecopurnity</span>
    </Link>
  )
}
