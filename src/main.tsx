import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './app/App'
import { waitForBackend } from './lib/api'

// ponytail: MSW is the backend until the real API ships; flip with VITE_USE_MOCKS=false.
// Render right away; only API calls wait for the worker, so static content paints without it.
if (import.meta.env.VITE_USE_MOCKS !== 'false') {
  waitForBackend(
    Promise.all([import('./mocks/browser'), import('./mocks/realtime')]).then(async ([{ worker }, { startMockRealtime }]) => {
      await worker.start({ onUnhandledRequest: 'bypass', quiet: true })
      startMockRealtime()
    }),
  )
}

const root = document.getElementById('root')!
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
// `/` ships prerendered (scripts/prerender.mjs): hydrate it. index.html empties #root on every
// other path before first paint, and dev serves it empty, so those render from scratch.
if (location.pathname === '/' && root.hasChildNodes()) ReactDOM.hydrateRoot(root, app)
else ReactDOM.createRoot(root).render(app)
