import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const resolvePath = (segment: string) =>
  fileURLToPath(new URL(`./src/${segment}`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': resolvePath('domain'),
      '@application': resolvePath('application'),
      '@infrastructure': resolvePath('infrastructure'),
      '@presentation': resolvePath('presentation'),
      '@composition': resolvePath('composition'),
    },
  },
  // Both ship their own WebAssembly and locate it relative to themselves, so
  // neither may be rewritten by the dependency optimizer.
  optimizeDeps: { exclude: ['stockfish', '@sqlite.org/sqlite-wasm'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
