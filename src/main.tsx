import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './app/App'
import { waitForBackend } from './lib/api'



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


if (location.pathname === '/' && root.hasChildNodes()) ReactDOM.hydrateRoot(root, app)
else ReactDOM.createRoot(root).render(app)
