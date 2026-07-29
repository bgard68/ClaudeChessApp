import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const resolvePath = (segment: string) =>
  fileURLToPath(new URL(`./src/${segment}`, import.meta.url))

/**
 * The policy this app would need, measured rather than guessed.
 *
 * Report-only: the browser evaluates it and logs every violation, but blocks
 * nothing, so a policy that is wrong cannot present as a blank board. It is a
 * header and not a <meta> tag because the report-only variant does not exist in
 * meta form — the spec ignores it there — which makes the dev server the only
 * thing here able to serve it.
 *
 * 'wasm-unsafe-eval' is required outright: the engine calls
 * WebAssembly.instantiateStreaming, and a default policy blocks WASM
 * compilation entirely. It deliberately does NOT grant 'unsafe-eval', so the
 * one `new Function` in the Stockfish loader will report if it is ever reached.
 * That is the question this is here to answer.
 *
 * 'unsafe-inline' for styles is unavoidable — react-chessboard positions every
 * square with a style attribute — and is a far smaller concession than script.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // The favicon is an inline SVG data URI.
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const reportOnly = { 'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY }

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
  server: { headers: reportOnly },
  preview: { headers: reportOnly },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
