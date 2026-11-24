import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Renderer build for the Tauri shell (migration spike).
 * The CSP is set by Tauri itself (src-tauri/tauri.conf.json), not by a <meta>.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'out/tauri-renderer'),
    emptyOutDir: true,
    target: 'es2022'
  }
})
