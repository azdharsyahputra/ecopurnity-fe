import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './app/App'

// ponytail: MSW is the backend until the real API ships; flip with VITE_USE_MOCKS=false.
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS === 'false') return
  const [{ worker }, { startMockRealtime }] = await Promise.all([import('./mocks/browser'), import('./mocks/realtime')])
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  startMockRealtime()
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
