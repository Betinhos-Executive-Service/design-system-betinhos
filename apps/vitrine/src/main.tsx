import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BuildBadge } from '@betinhos/ui'
import '@betinhos/ui/styles.css'
import './vitrine.css'
import { ComponentsPage } from './ComponentsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComponentsPage />
    <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
  </StrictMode>,
)
