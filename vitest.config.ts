import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the main process pure functions.
 * `electron` is stubbed: these modules import it transitively (via store.ts)
 * but do not use it in the tested code.
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
      // Explicit scope: without `include`, v8 only measures the files imported
      // by the tests and the global percentage is artificially inflated.
      // React components/views (src/renderer/src/{components,views}) will be
      // covered by component / E2E tests and are not measured yet.
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
        'src/shared/**/*.ts',
        'src/renderer/src/lib/**/*.ts',
        'src/renderer/src/store/**/*.ts'
      ],
      exclude: ['**/*.d.ts'],
      thresholds: {
        // Global floor: 80% minimum on the scope above (never lower it).
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
        // Critical modules (security / data integrity): stricter requirement.
        'src/main/ipc/trust.ts': { lines: 100, branches: 100 },
        'src/main/utils/icons.ts': { lines: 80, branches: 70 },
        'src/main/services/backup.ts': { lines: 90, branches: 80 },
        'src/main/data/repo.ts': { lines: 90, branches: 80 },
        'src/main/utils/fetch.ts': { lines: 95, branches: 90 }
      }
    }
  }
})
