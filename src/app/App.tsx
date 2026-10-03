import { lazy, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/Toaster'
import { useMe } from '@/features/auth/hooks'
import { useLiveNotifications } from '@/features/notifications/live'
import { FullPageLoader } from '@/components/States'
import { AuthGateDialog } from '@/features/auth/AuthGate'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage, GoogleCallbackPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from '@/features/auth/AuthPages'
import { LandingPage } from '@/features/public/LandingPage'
import { PublicLayout } from './layouts/PublicLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { AppLayout } from './layouts/AppLayout'
import { GuestOnly, RequireAuth, RequireCapability, RequireOrg } from './guards'
import { ROUTE_WORKSPACES, type Workspace } from './nav'
import { NotFound, Placeholder } from './Placeholder'

const UiShowcase = lazy(() => import('@/features/showcase/UiShowcase').then((m) => ({ default: m.UiShowcase })))
const LegacyRoutes = lazy(() => import('@/legacy/LegacyRoutes'))
// Public economy pages pull in recharts; keep them out of the landing bundle.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })))
const economy = () => import('@/features/economy/pages')
const ExplorerPage = named(economy, 'ExplorerPage')
const OpportunitiesPage = named(economy, 'OpportunitiesPage')
const OpportunityDetailPage = named(economy, 'OpportunityDetailPage')
const MarketsPage = named(economy, 'MarketsPage')
const MarketDetailPage = named(economy, 'MarketDetailPage')
const AuctionsPage = named(economy, 'AuctionsPage')
const AuctionRoomPage = named(economy, 'AuctionRoomPage')
const SearchPage = named(() => import('@/features/search/SearchPage'), 'SearchPage')
const OnboardingPage = named(() => import('@/features/auth/OnboardingPage'), 'OnboardingPage')
const me = () => import('@/features/me/pages')
const P = {
  dashboard: named(me, 'DashboardPage'), identity: named(me, 'IdentityPage'), opportunities: named(me, 'MyOpportunitiesPage'),
  markets: named(me, 'MyMarketsPage'), auctions: named(me, 'MyAuctionsPage'), createAuction: named(me, 'CreateAuctionPage'),
  evaluate: named(me, 'EvaluatePage'), transactions: named(me, 'TransactionsPage'), transaction: named(me, 'TransactionDetailPage'),
  notifications: named(me, 'NotificationsPage'), settings: named(me, 'SettingsPage'), supply: named(me, 'SupplyPage'),
  demand: named(me, 'DemandPage'), supplyForm: named(me, 'SupplyFormPage'), demandForm: named(me, 'DemandFormPage'),
  supplyDetail: named(me, 'SupplyDetailPage'), demandDetail: named(me, 'DemandDetailPage'),
}
const orgPages = () => import('@/features/org/pages')
const O = {
  overview: named(orgPages, 'OverviewPage'), profile: named(orgPages, 'ProfilePage'), team: named(orgPages, 'TeamPage'), inventory: named(orgPages, 'InventoryPage'),
  procurement: named(orgPages, 'ProcurementListPage'), procurementForm: named(orgPages, 'ProcurementFormPage'), procurementDetail: named(orgPages, 'ProcurementDetailPage'),
  collective: named(orgPages, 'CollectivePage'), auctions: named(orgPages, 'OrgAuctionsPage'), createAuction: named(orgPages, 'CreateOrgAuctionPage'),
  evaluate: named(orgPages, 'OrgEvaluatePage'), suppliers: named(orgPages, 'SuppliersPage'), supplier: named(orgPages, 'SupplierDetailPage'),
  transactions: named(orgPages, 'OrgTransactionsPage'), transaction: named(orgPages, 'OrgTransactionDetailPage'), analytics: named(orgPages, 'AnalyticsPage'),
}

const [personal, org, marketOps, governance] = ROUTE_WORKSPACES

/** One route per nav item: the built page from `pages`, or a phase placeholder until it exists. */
function workspaceRoutes(ws: Workspace, pages: Record<string, React.ComponentType> = {}) {
  return [...ws.items, ...(ws.footer ?? [])].map((item) => {
    const Page = pages[item.path]
    const el = Page ? <Page /> : <Placeholder title={item.label} icon={item.icon} tone={ws.tone} phase={ws.phase} />
    return item.path ? <Route key={item.path} path={item.path} element={el} /> : <Route key="index" index element={el} />
  })
}

// ponytail: public profiles are P1 in the PRD route map; placeholders until the profile feature lands.
const PROFILE_PAGES: [string, string][] = [
  ['b/:slug', 'Profil bisnis'],
  ['u/:username', 'Profil participant'],
]

/** Router-aware singletons. */
function Shell() {
  const { data: me } = useMe()
  useLiveNotifications(me?.id)
  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
      <CommandPalette />
      <AuthGateDialog />
      <Toaster />
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
                <Route path="explore" element={<ExplorerPage />} />
                <Route path="opportunities" element={<OpportunitiesPage />} />
                <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
                <Route path="markets" element={<MarketsPage />} />
                <Route path="markets/:id" element={<MarketDetailPage />} />
                <Route path="auctions" element={<AuctionsPage />} />
                <Route path="auctions/:id" element={<AuctionRoomPage />} />
                <Route path="search" element={<SearchPage />} />
                {PROFILE_PAGES.map(([path, title]) => (
                  <Route key={path} path={path} element={<div className="px-4 py-10"><Placeholder title={title} phase="F2" /></div>} />
                ))}
                <Route path="ui" element={<UiShowcase />} />
              </Route>

              <Route element={<AuthLayout />}>
                <Route element={<GuestOnly />}>
                  <Route path="login" element={<LoginPage />} />
                  <Route path="register" element={<RegisterPage />} />
                  <Route path="forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="reset-password" element={<ResetPasswordPage />} />
                </Route>
                <Route path="verify-email" element={<VerifyEmailPage />} />
                <Route path="auth/google/callback" element={<GoogleCallbackPage />} />
              </Route>

              <Route element={<RequireAuth />}>
                <Route path="onboarding" element={<OnboardingPage />} />
                <Route element={<AppLayout />}>
                  <Route path="app">
                    {workspaceRoutes(personal, {
                      '': P.dashboard, identity: P.identity, supply: P.supply, demand: P.demand, opportunities: P.opportunities,
                      markets: P.markets, auctions: P.auctions, transactions: P.transactions, notifications: P.notifications, settings: P.settings,
                    })}
                    <Route path="supply/new" element={<P.supplyForm />} />
                    <Route path="supply/:id" element={<P.supplyDetail />} />
                    <Route path="supply/:id/edit" element={<P.supplyForm />} />
                    <Route path="demand/new" element={<P.demandForm />} />
                    <Route path="demand/:id" element={<P.demandDetail />} />
                    <Route path="demand/:id/edit" element={<P.demandForm />} />
                    <Route path="auctions/new" element={<P.createAuction />} />
                    <Route path="auctions/:id/evaluate" element={<P.evaluate />} />
                    <Route path="transactions/:id" element={<P.transaction />} />
                  </Route>
                  <Route path="org/:orgId" element={<RequireOrg />}>
                    {workspaceRoutes(org, {
                      '': O.overview, procurement: O.procurement, collective: O.collective, auctions: O.auctions, suppliers: O.suppliers,
                      inventory: O.inventory, transactions: O.transactions, analytics: O.analytics, team: O.team, profile: O.profile,
                    })}
                    <Route path="procurement/new" element={<O.procurementForm />} />
                    <Route path="procurement/:id" element={<O.procurementDetail />} />
                    <Route path="auctions/new" element={<O.createAuction />} />
                    <Route path="auctions/:id/evaluate" element={<O.evaluate />} />
                    <Route path="suppliers/:id" element={<O.supplier />} />
                    <Route path="transactions/:tid" element={<O.transaction />} />
                  </Route>
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
