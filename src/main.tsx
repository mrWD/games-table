import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import App from './App'
import { whenHydrated } from './lib/idb-storage'
import { useLibrary } from './store/library'

registerSW({ immediate: true })

// The library now hydrates from IndexedDB, which is asynchronous. Rendering before it
// settles would flash an empty library (and let startup effects act on one). The read is
// a few milliseconds; the page background covers it.
void whenHydrated([useLibrary]).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
