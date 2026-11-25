import React from 'react'
import ReactDOM from 'react-dom/client'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import App from './App'
import { createApi } from './lib/api'
import './assets/main.css'

window.api = createApi({
  invoke,
  listen: (event, handler) => listen(event, ({ payload }) => handler(payload)),
  toAssetUrl: convertFileSrc
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
