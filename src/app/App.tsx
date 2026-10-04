import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Outlet, Route, Routes, StaticRouter } from 'react-router-dom'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { queryClient } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/Toaster'
import { useMe } from '@/features/auth/hooks'
import { resyncQueries, useLiveNotifications } from '@/features/notifications/live'
import { resetRealtime } from '@/lib/realtime'
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
import { NotFound } from './NotFound'

const UiShowcase = lazy(() => import('@/features/showcase/UiShowcase').then((m) => ({ default: m.UiShowcase })))

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })))
const economy = () => import('@/features/economy/pages')
const ExplorerPage = named(economy, 'ExplorerPage')
const OpportunitiesPage = named(economy, 'OpportunitiesPage')
const OpportunityDetailPage = named(economy, 'OpportunityDetailPage')
const MarketsPage = named(economy, 'MarketsPage')
const ListingsPage = named(economy, 'ListingsPage')
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
  supplyDetail: named(me, 'SupplyDetailPage'), demandDetail: named(me, 'DemandDetailPage'), finance: named(me, 'FinancePage'),
  contracts: named(me, 'ContractsPage'), contract: named(me, 'ContractDetailPage'),
}
const mm = () => import('@/features/market-maker/pages')
const M = {
  operations: named(mm, 'OperationsPage'), pipeline: named(mm, 'PipelinePage'), createMarket: named(mm, 'CreateMarketPage'),
  market: named(mm, 'MarketOpsPage'), analytics: named(mm, 'AnalyticsPage'),
}
const rfq = () => import('@/features/rfq/pages')
const Q = { list: named(rfq, 'RfqListPage'), create: named(rfq, 'RfqNewPage'), detail: named(rfq, 'RfqDetailPage'), messages: named(rfq, 'MessagesPage') }
const rep = () => import('@/features/reputation/pages')
const R = {
  matches: named(rep, 'MatchesPage'), reputation: named(rep, 'ReputationPage'),
  participant: named(rep, 'ParticipantProfilePage'), business: named(rep, 'BusinessProfilePage'),
}
const adm = () => import('@/features/admin/pages')
const A = {
  overview: named(adm, 'AdminOverviewPage'), users: named(adm, 'AdminUsersPage'), user: named(adm, 'AdminUserDetailPage'),
  verification: named(adm, 'VerificationQueuePage'), verificationDetail: named(adm, 'VerificationDetailPage'),
  markets: named(adm, 'AdminMarketsPage'), market: named(adm, 'AdminMarketDetailPage'), auctions: named(adm, 'AdminAuctionsPage'),
  auction: named(adm, 'AdminAuctionDetailPage'), disputes: named(adm, 'DisputesPage'), dispute: named(adm, 'DisputeCasePage'),
  fraud: named(adm, 'FraudPage'), alert: named(adm, 'FraudAlertPage'), audit: named(adm, 'AuditTrailPage'), mmApplications: named(adm, 'MmApplicationsPage'),
  withdrawals: named(adm, 'WithdrawalsPage'), withdrawal: named(adm, 'WithdrawalDetailPage'),
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


function workspaceRoutes(ws: Workspace, pages: Record<string, React.ComponentType>) {
  return [...ws.items, ...(ws.footer ?? [])].map((item) => {
    const Page = pages[item.path]
    if (!Page) throw new Error(`No page for ${ws.base}/${item.path}`)
    return item.path ? <Route key={item.path} path={item.path} element={<Page />} /> : <Route key="index" index element={<Page />} />
  })
}



function Shell() {
  const { data: me } = useMe()
  useLiveNotifications(me?.id)

  const identity = me === undefined ? undefined : (me?.id ?? 'anonymous')
  useEffect(() => {
    if (identity === undefined || import.meta.env.VITE_USE_MOCKS !== 'false') return
    return resetRealtime((channel) => resyncQueries(queryClient, channel))
  }, [identity])
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


function Router({ location, children }: { location?: string; children: ReactNode }) {
  return location === undefined ? <BrowserRouter>{children}</BrowserRouter> : <StaticRouter location={location}>{children}</StaticRouter>
}

export default function App({ location, client = queryClient }: { location?: string; client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Router location={location}>
          <Routes>
            <Route element={<Shell />}>
              <Route element={<PublicLayout />}>
                <Route index element={<LandingPage />} />
                <Route path="explore" element={<ExplorerPage />} />
                <Route path="opportunities" element={<OpportunitiesPage />} />
                <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
                <Route path="markets" element={<MarketsPage />} />
                <Route path="listings" element={<ListingsPage />} />
                <Route path="markets/:id" element={<MarketDetailPage />} />
                <Route path="auctions" element={<AuctionsPage />} />
                <Route path="auctions/:id" element={<AuctionRoomPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="b/:slug" element={<R.business />} />
                <Route path="u/:username" element={<R.participant />} />
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
                      markets: P.markets, auctions: P.auctions, transactions: P.transactions, notifications: P.notifications, settings: P.settings, finance: P.finance, contracts: P.contracts, rfq: Q.list, messages: Q.messages,
                      matches: R.matches, reputation: R.reputation,
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
                    <Route path="contracts/:id" element={<P.contract />} />
                    <Route path="rfq/new" element={<Q.create />} />
                    <Route path="rfq/:id" element={<Q.detail />} />
                    <Route path="messages/:id" element={<Q.messages />} />
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
                    {workspaceRoutes(marketOps, { '': M.operations, opportunities: M.pipeline, 'markets/new': M.createMarket, analytics: M.analytics })}
                    <Route path="markets/:id" element={<M.market />} />
                  </Route>
                  <Route path="admin" element={<RequireCapability cap="admin" />}>
                    {workspaceRoutes(governance, {
                      '': A.overview, users: A.users, verification: A.verification, markets: A.markets, auctions: A.auctions,
                      disputes: A.disputes, fraud: A.fraud, audit: A.audit, 'mm-applications': A.mmApplications, withdrawals: A.withdrawals,
                    })}
                    <Route path="users/:id" element={<A.user />} />
                    <Route path="verification/:id" element={<A.verificationDetail />} />
                    <Route path="markets/:id" element={<A.market />} />
                    <Route path="auctions/:id" element={<A.auction />} />
                    <Route path="disputes/:id" element={<A.dispute />} />
                    <Route path="fraud/:id" element={<A.alert />} />
                    <Route path="withdrawals/:id" element={<A.withdrawal />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
