import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

/**
 * Two projects (the Rust backend is tested with cargo, see `npm run test:rust`):
 * - `node`: shared and pure renderer logic, release scripts (`*.test.ts`).
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
      include: ['src/shared/**/*.ts', 'src/renderer/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', 'src/renderer/src/main.tsx'],
      thresholds: {
        // Global floor: 80% minimum on the scope above (never lower it).
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80
      }
    }
  }
})
