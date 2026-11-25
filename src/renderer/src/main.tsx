import React from 'react'
import ReactDOM from 'react-dom/client'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import App from './App'
import { createTauriApi, isTauriRuntime } from './lib/tauriBridge'
import './assets/main.css'

// Under Tauri there is no Electron preload: provide `window.api` ourselves.
if (isTauriRuntime(window)) window.api = createTauriApi(invoke, { toAssetUrl: convertFileSrc })

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
