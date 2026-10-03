import { Routes, Route } from 'react-router-dom'
import DashboardLayout from './LegacyLayout'
import EconomicIdentityPage from './pages/EconomicIdentityPage'
import OpportunityFeedPage from './pages/OpportunityFeedPage'
import OpportunityGraphPage from './pages/OpportunityGraphPage'
import MarketAuctionPage from './pages/MarketAuctionPage'
import SmartAllocationPage from './pages/SmartAllocationPage'
import RegistryPage from './pages/RegistryPage'
import TransactionPage from './pages/TransactionPage'
import TransactionDetailPage from './pages/TransactionDetailPage'
import ReputationPage from './pages/ReputationPage'
import BusinessDashboardPage from './pages/BusinessDashboardPage'
import MarketMakerDashboard from './pages/MarketMakerDashboard'
import MarketFormationPage from './pages/MarketFormationPage'
import MarketIntelligencePage from './pages/MarketIntelligencePage'
import SimulationPage from './pages/SimulationPage'
import PlatformAdminPage from './pages/PlatformAdminPage'

// ponytail: old screens kept at /legacy as reference until each is rebuilt (F2–F5), then deleted
export default function LegacyRoutes() {
  return (
      <DashboardLayout>
        <Routes>
          <Route index element={<EconomicIdentityPage />} />
          <Route path="opportunities" element={<OpportunityFeedPage />} />
          <Route path="graph" element={<OpportunityGraphPage />} />
          <Route path="auctions" element={<MarketAuctionPage />} />
          <Route path="allocation" element={<SmartAllocationPage />} />
          <Route path="registry" element={<RegistryPage />} />
          <Route path="transactions" element={<TransactionPage />} />
          <Route path="transactions/:id" element={<TransactionDetailPage />} />
          <Route path="reputation" element={<ReputationPage />} />
          <Route path="business" element={<BusinessDashboardPage />} />
          <Route path="market-maker" element={<MarketMakerDashboard />} />
          <Route path="market/form" element={<MarketFormationPage />} />
          <Route path="intelligence" element={<MarketIntelligencePage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="admin" element={<PlatformAdminPage />} />
        </Routes>
      </DashboardLayout>
  )
}