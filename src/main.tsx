import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/700.css'
import './styles/global.css'

import App from './app/App'
import { startClock } from './features/time'
import { startPaletteEngine } from './features/theme/paletteEngine'

// Started at module scope rather than in an effect: these are singletons that
// should run for the life of the document, and StrictMode's deliberate
// double-mounting would otherwise tear them down and rebuild them on every
// development reload.
startClock()
startPaletteEngine()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
