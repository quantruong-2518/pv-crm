import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { pvAliases } from './alias.config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: pvAliases(import.meta.url),
    // One single React copy across every package — two copies break hooks
    // with an "Invalid hook call" message that doesn't point to the real cause.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{apps,packages,tools}/**/*.{test,spec}.{ts,tsx,js,mjs}'],
    // No more self-generated tests (see CLAUDE.md, "Test policy") — the tree
    // can have 0 valid test files, and `pnpm check` must not go red for that reason.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/index.ts', 'apps/web/src/kit/**'],
    },
  },
})
