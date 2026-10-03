import { useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useMe } from '@/features/auth/hooks'
import type { Capability } from '@/domain/types'
import { EmptyState, ErrorState, FullPageLoader } from '@/components/States'
import { Button } from '@/components/ui/button'
import { safeReturnTo } from '@/lib/utils'

export function RequireAuth() {
  const me = useMe()
  const { pathname, search } = useLocation()
  if (me.isPending) return <FullPageLoader />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} className="m-8" />
  if (!me.data) return <Navigate to={`/login?returnTo=${encodeURIComponent(pathname + search)}`} replace />
  if (!me.data.onboarded && pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <Outlet />
}

/**
 * Bounces users who arrive already signed in. Signing in *on* these pages doesn't trigger it:
 * the page itself decides where to go next (verify email, onboarding, or returnTo).
 */
export function GuestOnly() {
  const me = useMe()
  const [params] = useSearchParams()
  const [arrival, setArrival] = useState<'unknown' | 'guest' | 'user'>('unknown')
  if (arrival === 'unknown' && !me.isPending) setArrival(me.data ? 'user' : 'guest')
  if (arrival === 'unknown') return <FullPageLoader />
  if (arrival === 'user') return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />
  return <Outlet />
}

function Forbidden() {
  return (
    <EmptyState
      icon={ShieldX}
      tone="red"
      title="Kamu tidak punya akses ke halaman ini"
      description="Workspace ini butuh capability atau keanggotaan yang belum dimiliki akunmu."
      action={<Button render={<Link to="/app" />}>Kembali ke My Economy</Button>}
      className="mt-8"
    />
  )
}

/** Must sit under RequireAuth. */
export function RequireCapability({ cap }: { cap: Capability }) {
  const { data: me } = useMe()
  return me?.capabilities.includes(cap) ? <Outlet /> : <Forbidden />
}

/** Must sit under RequireAuth. Checks membership of the org in the URL. */
export function RequireOrg() {
  const { data: me } = useMe()
  const { orgId } = useParams()
  return me?.orgs.some((o) => o.orgId === orgId) ? <Outlet /> : <Forbidden />
}
