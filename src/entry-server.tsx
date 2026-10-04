import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import App from './app/App'



export function render(location: string) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  return renderToString(
    <StrictMode>
      <App location={location} client={client} />
    </StrictMode>,
  )
}
