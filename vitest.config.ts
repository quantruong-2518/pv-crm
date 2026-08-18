import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { pvAliases } from './alias.config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: pvAliases(import.meta.url),
    // Một bản React duy nhất cho mọi package — hai bản thì hook vỡ với thông
    // báo "Invalid hook call" không chỉ tới nguyên nhân thật.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{apps,packages,tools}/**/*.{test,spec}.{ts,tsx,js,mjs}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.*', '**/index.ts', 'apps/web/src/kit/**'],
    },
  },
})
