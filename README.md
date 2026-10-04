# Ecopurnity — Web

**Ecopurnity is an economic opportunity engine.** It reads supply, demand and networks to find markets that don't exist
yet, forms them with market makers, and runs the whole deal — real-time auctions, RFQs, escrow payments, shipments, QC
and disputes — in one place, for individuals, SMEs and organisations.

Live: <https://ecopurnity.my.id> · API: <https://api.ecopurnity.my.id> · Backend repo: `ecopurnity-api`

## Why Ecopurnity

Most B2B platforms do one slice: a listing board, an auction tool, or a procurement system. Ecopurnity connects the
whole chain, from spotting the opportunity to settling the money.

| | Typical B2B marketplace | Typical e-procurement tool | **Ecopurnity** |
| --- | :---: | :---: | :---: |
| Finds opportunities for you (demand/supply gaps, collective demand) | ✗ | ✗ | ✓ |
| Markets formed and operated by market makers, with versioned public rules | ✗ | ✗ | ✓ |
| Real-time auctions: reverse, forward, sealed, Dutch, anti-sniping | rare | partial | ✓ |
| Collective buying: SMEs pool demand for scale prices, split pro-rata | ✗ | ✗ | ✓ |
| Escrow payments in-app (VA, QRIS, e-wallet) | partial | ✗ | ✓ |
| Staged shipments, QC with partial acceptance and automatic refund | ✗ | partial | ✓ |
| Disputes with evidence and admin arbitration, reputation from real trades | partial | ✗ | ✓ |
| Personal and organisation workspaces (roles, approvals, supplier scorecards) | ✗ | ✓ | ✓ |
| Public economic explorer (prices, volumes, activity) | ✗ | ✗ | ✓ |

What that means in practice:

- **Opportunity engine.** Listings are clustered by item, category, region and unit; the engine flags market gaps,
  supply gaps, collective demand and capacity matches, scores them per user ("why this fits you") and hands them to
  market makers to turn into markets.
- **Fair, transparent auctions.** Bidder identities are masked ("Supplier 3"), visibility can be full, rank-only or
  sealed, late bids extend the clock, and every bid streams live to everyone in the room. Buyers get Smart Allocation:
  split awards by supplier capacity, price and score.
- **SMEs buy like large companies.** Collective pools combine the demand of many small businesses into one market round;
  the result is split pro-rata into separate purchase orders.
- **Safe money.** Buyers pay into escrow through Midtrans (bank VA, QRIS, GoPay, ShopeePay) in a payment screen that
  matches the app; funds are released only after the buyer accepts the goods, with automatic partial refunds.
  Everything is recorded in a double-entry ledger, and payouts to sellers are approved and audited.
- **Trust by design.** Tiered verification (email → KTP) sets commitment limits; reputation comes only from completed
  trades, disputes and reviews; sensitive data is encrypted and every view of it is audited.
- **Built for teams.** Organisations get roles and permissions, approval rules, procurement requests, multi-lot
  auctions, supplier directories with scorecards and spend analytics.
- **Real time everywhere.** Auction rooms, notifications, trade updates and chat arrive over one WebSocket and catch up
  after a reconnect without losing events.

## Tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| UI | **React 19**, **TypeScript** | Typed, component-based UI across five workspaces (public, personal, organisation, market maker, admin) |
| Build | **Vite** | Fast dev server and builds; `/` is prerendered for a quick first paint |
| Routing | **React Router 7** | Nested layouts and route guards per workspace and capability |
| Server state | **TanStack Query 5** | Caching, background refetch and live cache updates from WebSocket events |
| Styling | **Tailwind CSS 4**, **Base UI** | Accessible primitives, design tokens, light/dark themes, mobile-first |
| Client state | **Zustand** | Small stores (toasts, UI state) |
| Realtime | Native **WebSocket** client | One socket per tab, channel subscriptions, sequence-based replay |
| Mock backend | **MSW** | The full API runs in the browser, so the UI can be built and demoed without a server |
| Tests | **Vitest** | Business rules in `src/domain` are unit-tested |
| CI/CD | **GitHub Actions** | Type-check, lint, tests and build on every push; auto-deploy from `main` |

The backend (separate repo) is **Go**, **PostgreSQL** (primary + streaming replica), **ClickHouse** for analytics,
S3-compatible storage (**Cloudflare R2**), **Midtrans Core API** for payments, contract-first **OpenAPI 3.1**.

## Getting started

Requires Node.js 24.

```bash
npm ci
npm run dev        # http://localhost:5173 with the built-in mock backend (MSW), no API needed
```

### Against the real API

Run the Go API locally (see the `ecopurnity-api` README), then:

```bash
npm run dev:api    # mocks off; /api (REST + WebSocket) is proxied to http://localhost:8080
```

Use `API_URL=http://host:port npm run dev:api` to point the proxy elsewhere and `PORT=5180` to change the dev port.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the mock backend |
| `npm run dev:api` | Dev server against the real API |
| `npm run build` | Type-check, production build, SSR build and prerender of `/` into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run contract` | Regenerate `docs/api-contract.md` (every endpoint the app calls) |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MOCKS` | on | `false` = talk to the real API instead of MSW |
| `VITE_API_URL` | `/api/v1` | API base URL used by the app |
| `API_URL` | `http://localhost:8080` | Dev-server proxy target for `/api` (`dev:api` only) |
| `PORT` | `5173` | Dev-server port |

## Project layout

```
src/
  app/          routes, layouts, guards, navigation per workspace
  features/     one folder per area: public, auth, me (personal workspace), org, market-maker, admin, economy
                (markets, auctions, listings), rfq, trade (shared trade UI), search, notifications, roles, reputation
  domain/       business rules as plain TypeScript with unit tests (pricing, trade states, KYC, roles, settlement, …)
  components/   shared UI
  lib/          api client, realtime (WebSocket) client, uploads
  mocks/        MSW handlers + in-memory data: a complete fake backend that follows the API contract
  stores/       small client stores (Zustand: toasts, …)
scripts/        api-contract generator, prerender
docs/           api-contract.md (generated)
```

### API contract

The app and the API share one contract. `npm run contract` lists every endpoint the app calls in
`docs/api-contract.md`; the API repo checks its OpenAPI spec against that list (`scripts/check-coverage.mjs`), and the
mock handlers implement the same shapes, so mock mode and the real API behave the same.

### Realtime

`src/lib/realtime.ts` keeps one WebSocket per tab (`/api/v1/ws`) for auction rooms, notifications, trade updates and
chat, with sequence-based replay after reconnects. In mock mode the same channels are fed by `src/mocks/realtime.ts`.

## CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`) runs type-check, lint, unit tests and a production build on every push
and pull request. A push to `main` that passes is deployed to the server automatically.
