import type { Api } from './lib/api'

declare global {
  interface Window {
    /** The backend API, installed by main.tsx (see lib/api.ts). */
    api: Api
  }
}

export {}
