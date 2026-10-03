import { lazy, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/CommandPalette'
import { FullPageLoader } from '@/components/States'
import { AuthGateDialog } from '@/features/auth/AuthGate'
import { LoginPage } from '@/features/auth/LoginPage'
import { LandingPage } from '@/features/public/LandingPage'
import { PublicLayout } from './layouts/PublicLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { AppLayout } from './layouts/AppLayout'
import { GuestOnly, RequireAuth, RequireCapability, RequireOrg } from './guards'
import { ROUTE_WORKSPACES, type Workspace } from './nav'
import { NotFound, Placeholder } from './Placeholder'

const UiShowcase = lazy(() => import('@/features/showcase/UiShowcase').then((m) => ({ default: m.UiShowcase })))
const LegacyRoutes = lazy(() => import('@/legacy/LegacyRoutes'))

const [personal, org, marketOps, governance] = ROUTE_WORKSPACES

/** Placeholder routes for every nav item of a workspace; replaced page by page in F2–F5. */
function workspaceRoutes(ws: Workspace) {
  return [...ws.items, ...(ws.footer ?? [])].map((item) => {
    const el = <Placeholder title={item.label} icon={item.icon} tone={ws.tone} phase={ws.phase} />
    return item.path ? <Route key={item.path} path={item.path} element={el} /> : <Route key="index" index element={el} />
  })
}

const PUBLIC_PAGES: [string, string][] = [
  ['explore', 'Economic Explorer'],
  ['opportunities', 'Opportunities'],
  ['opportunities/:id', 'Opportunity'],
  ['markets', 'Markets'],
  ['markets/:id', 'Market'],
  ['auctions', 'Auctions'],
  ['auctions/:id', 'Auction room'],
  ['search', 'Pencarian'],
  ['b/:slug', 'Profil bisnis'],
  ['u/:username', 'Profil participant'],
]

const AUTH_PAGES: [string, string][] = [
  ['register', 'Daftar'],
  ['forgot-password', 'Lupa password'],
  ['reset-password', 'Reset password'],
]

/** Router-aware singletons. */
function Shell() {
  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
      <CommandPalette />
      <AuthGateDialog />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route element={<PublicLayout />}>
                <Route index element={<LandingPage />} />
                {PUBLIC_PAGES.map(([path, title]) => (
                  <Route key={path} path={path} element={<div className="px-4 py-10"><Placeholder title={title} phase="F1" /></div>} />
                ))}
                <Route path="ui" element={<UiShowcase />} />
              </Route>

              <Route element={<AuthLayout />}>
                <Route element={<GuestOnly />}>
                  <Route path="login" element={<LoginPage />} />
                  {AUTH_PAGES.map(([path, title]) => (
                    <Route key={path} path={path} element={<Placeholder title={title} phase="F1" />} />
                  ))}
                </Route>
                <Route path="verify-email" element={<Placeholder title="Verifikasi email" phase="F1" />} />
              </Route>

              <Route element={<RequireAuth />}>
                <Route path="onboarding" element={<div className="p-10"><Placeholder title="Onboarding" phase="F1" /></div>} />
                <Route element={<AppLayout />}>
                  <Route path="app">{workspaceRoutes(personal)}</Route>
                  <Route path="org/:orgId" element={<RequireOrg />}>{workspaceRoutes(org)}</Route>
                  <Route path="mm" element={<RequireCapability cap="market_maker" />}>
                    {workspaceRoutes(marketOps)}
                    <Route path="markets/:id" element={<Placeholder title="Operasi market" phase="F4" tone="purple" />} />
                  </Route>
                  <Route path="admin" element={<RequireCapability cap="admin" />}>{workspaceRoutes(governance)}</Route>
                </Route>
              </Route>

              <Route path="legacy/*" element={<LegacyRoutes />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
