import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@presentation/App'
import { ServicesProvider } from '@presentation/ServicesContext'
import './presentation/styles.css'

/*
 * The offline shell. Production only — `/sw.js` is emitted by the build (see
 * `serviceWorker` in vite.config.ts), so in dev there is nothing at that URL,
 * and a worker caching Vite's module graph would serve stale modules anyway.
 * Registered after load so it never competes with the first paint for the
 * network. Failure is silence on purpose: the app without a service worker is
 * exactly the app as it was, and there is nobody to act on the message.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <ServicesProvider>
      <App />
    </ServicesProvider>
  </StrictMode>,
)
