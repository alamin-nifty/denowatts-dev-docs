import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DocsPortal from './DocsPortal.jsx'
import './docs.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DocsPortal />
  </StrictMode>,
)
