import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const resolvePath = (segment: string) =>
  fileURLToPath(new URL(`./src/${segment}`, import.meta.url))

/**
 * The Content-Security-Policy, measured rather than guessed.
 *
 * Every directive below was verified against a running build — dev and the
 * production bundle — by serving it report-only first and collecting
 * `securitypolicyviolation` events while playing an engine game, importing the
 * library, and replaying an archived game. Nothing needed loosening.
 *
 * 'wasm-unsafe-eval' is required outright: the engine calls
 * WebAssembly.instantiateStreaming, and a default policy blocks WASM
 * compilation entirely. 'unsafe-eval' is deliberately withheld — the one
 * `new Function` in the Stockfish loader sits in the dead `else` branch of a
 * setImmediate polyfill, and never reported across any exercise.
 *
 * 'unsafe-inline' for styles is unavoidable: react-chessboard positions every
 * square with a style attribute. A far smaller concession than script.
 *
 * To re-measure after changing this, serve it as a
 * `Content-Security-Policy-Report-Only` header instead — a <meta> tag cannot
 * express report-only, the spec ignores it there.
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

/**
 * Ships the policy as a <meta> tag in the built page.
 *
 * Injected from the constant above rather than pasted into index.html, because
 * two copies of a security policy drift, and one that disagrees with itself is
 * worse than either half. This app has no server to set headers with.
 *
 * `frame-ancestors` is absent because <meta> cannot express it. Clickjacking
 * protection has to come from a real header at whatever serves these files.
 *
 * Build only, and that is not a convenience. @vitejs/plugin-react injects its
 * Refresh preamble as an inline script in dev, which `script-src 'self'` blocks
 * outright: React never mounts and the page renders empty. Granting
 * 'unsafe-inline' to keep dev alive would weaken the shipped policy to buy
 * nothing, so dev simply runs unpoliced. Measure changes with the report-only
 * header instead, as above.
 */
const cspMetaTag = (): Plugin => ({
  name: 'csp-meta-tag',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: CONTENT_SECURITY_POLICY,
      },
      injectTo: 'head-prepend',
    },
  ],
})

export default defineConfig({
  plugins: [react(), cspMetaTag()],
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
    // .tsx as well as .ts: the presentation tests render components through
    // react-dom/server, which needs no DOM, but they live in .tsx files and a
    // .ts-only pattern skips them silently — the suite still passes, just
    // without them. That is how the UI redesign's two component tests went
    // unrun from the day they were written.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /**
     * The coverage gate: `npm run test:coverage` fails unless every line,
     * statement, branch, and function of the included files is executed.
     *
     * The boundary is the runtime, not convenience. Everything that can
     * execute under Node — domain, application, composition, infrastructure
     * logic, presentation state and query logic — is in and must be at 100%.
     * What is out is code whose job is to talk to a browser runtime this test
     * environment does not have, and each exclusion is listed by name below so
     * that dropping coverage is a reviewed decision, never a quiet one.
     *
     * Nothing may be excluded (or deleted) to make a number: the excluded
     * files are exercised in a real Chromium by scripts/behaviour-check.mjs,
     * layout-check.mjs, a11y-check.mjs and the deploy gate's smoke test, and
     * the React files among them additionally keep their render tests in the
     * ordinary suite.
     */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        // The tests themselves, and the fakes that exist only to serve them.
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/testing/**',
        // Ambient declarations: no executable code.
        'src/**/*.d.ts',
        // DOM bootstrap: createRoot against a real document.
        'src/main.tsx',
        // The React render/interaction layer. react-dom/server executes render
        // paths (those tests stay in the suite) but never event handlers or
        // effects — only the real-browser checks can drive those.
        'src/presentation/App.tsx',
        'src/presentation/components/**',
        'src/presentation/screens/**',
        'src/presentation/hooks/**',
        // Worker and WASM adapters: each spawns `new Worker` and loads a
        // WebAssembly build (Stockfish; SQLite over OPFS) that Node cannot
        // host. Their protocol/composition callers are covered; the adapters
        // are proven by the smoke test playing the built app.
        'src/infrastructure/engine/StockfishEngine.ts',
        'src/infrastructure/sqlite/SqliteClient.ts',
        'src/infrastructure/sqlite/sqlite.worker.ts',
      ],
      thresholds: { lines: 100, statements: 100, branches: 100, functions: 100 },
      reporter: ['text', 'html'],
    },
  },
})
