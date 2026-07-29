import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@presentation/App'
import { ServicesProvider } from '@presentation/ServicesContext'
import './presentation/styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <ServicesProvider>
      <App />
    </ServicesProvider>
  </StrictMode>,
)
