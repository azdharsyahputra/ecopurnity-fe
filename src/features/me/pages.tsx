import { ListingDetailPage, ListingFormPage, ListingsPage } from './listings'

export { DashboardPage } from './DashboardPage'
export { IdentityPage } from './IdentityPage'
export { MyOpportunitiesPage } from './MyOpportunitiesPage'
export { MyMarketsPage } from './MyMarketsPage'
export { MyAuctionsPage, CreateAuctionPage, EvaluatePage } from './auctions'
export { TransactionsPage, TransactionDetailPage } from './transactions'
export { ContractsPage, ContractDetailPage } from './contracts'
export { NotificationsPage, SettingsPage } from './NotificationsPage'
export { FinancePage } from './FinancePage'

export const SupplyPage = () => <ListingsPage kind="supply" />
export const DemandPage = () => <ListingsPage kind="demand" />
export const SupplyFormPage = () => <ListingFormPage kind="supply" />
export const DemandFormPage = () => <ListingFormPage kind="demand" />
export const SupplyDetailPage = () => <ListingDetailPage kind="supply" />
export const DemandDetailPage = () => <ListingDetailPage kind="demand" />
