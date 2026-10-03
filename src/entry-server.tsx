import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import App from './app/App'

// Build-time prerender of the public landing (scripts/prerender.mjs). Queries never run here:
// data sections ship as their skeletons and the client fills them after hydration.
export function render(location: string) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  return renderToString(
    <StrictMode>
      <App location={location} client={client} />
    </StrictMode>,
  )
}
