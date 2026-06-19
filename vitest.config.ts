import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Config Vitest pour les fonctions pures du process principal.
 * `electron` est stubé : ces modules l'importent transitivement (via store.ts)
 * mais ne l'utilisent pas dans le code testé.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'test/stubs/electron.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
