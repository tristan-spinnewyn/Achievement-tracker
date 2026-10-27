import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  electron: resolve(__dirname, 'test/stubs/electron.ts')
}

/**
 * Two projects:
 * - `node`: main process / preload / pure renderer logic (`*.test.ts`).
 *   `electron` is stubbed: these modules import it transitively (via store.ts)
 *   but do not use it in the tested code.
 * - `react`: React components and views in jsdom (`*.test.tsx`), with
 *   `window.api` mocked per test (see test/renderer/setup.ts).
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'react',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
          setupFiles: ['test/renderer/setup.ts']
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      // Explicit scope: without `include`, v8 only measures the files imported
      // by the tests and the global percentage is artificially inflated.
      include: [
        'src/main/**/*.ts',
        'src/preload/**/*.ts',
        'src/shared/**/*.ts',
        'src/renderer/src/**/*.{ts,tsx}'
      ],
      exclude: ['**/*.d.ts', 'src/renderer/src/main.tsx'],
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
        'src/main/data/repo/**/*.ts': { lines: 90, branches: 80 },
        'src/main/utils/fetch.ts': { lines: 95, branches: 90 }
      }
    }
  }
})
