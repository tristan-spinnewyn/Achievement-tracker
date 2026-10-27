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
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      // Périmètre explicite : sans `include`, v8 ne mesure que les fichiers importés
      // par les tests et le pourcentage global est artificiellement gonflé.
      // Les composants/vues React (src/renderer/src/{components,views}) relèveront
      // de tests de composants / E2E et ne sont pas encore mesurés.
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
        'src/shared/**/*.ts',
        'src/renderer/src/lib/**/*.ts',
        'src/renderer/src/store/**/*.ts'
      ],
      exclude: ['**/*.d.ts'],
      thresholds: {
        // Plancher global : 80 % minimum sur le périmètre ci-dessus (ne jamais le baisser).
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
        // Modules critiques (sécurité / intégrité des données) : exigence forte.
        'src/main/ipc/trust.ts': { lines: 100, branches: 100 },
        'src/main/utils/icons.ts': { lines: 80, branches: 70 },
        'src/main/services/backup.ts': { lines: 90, branches: 80 },
        'src/main/data/repo.ts': { lines: 90, branches: 80 },
        'src/main/utils/fetch.ts': { lines: 95, branches: 90 }
      }
    }
  }
})
