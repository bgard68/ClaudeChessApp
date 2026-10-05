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

/**
 * Builds the service worker and tells it what to precache.
 *
 * Hand-written rather than vite-plugin-pwa, on the same ledger as everything
 * else here (§8.12 O1): the plugin would bring Workbox and tens of transitive
 * packages to generate what is, for this app, a hundred-line worker with three
 * routing rules. The cost of writing it by hand is reimplementing cache
 * cleanup, which is seven lines. The repo already builds its own Vite plugin
 * for the CSP tag; this is the same move.
 *
 * The worker cannot be bundled as a chunk — it must be its own classic script
 * at a stable URL ('/sw.js'), and it needs the list of hashed asset names,
 * which exist only once the bundle is written. Hence `generateBundle`: compile
 * `src/sw.ts`, splice in the real asset list, and emit the result
 * beside the bundle. Build only; dev runs without a worker for the same reason
 * it runs without the CSP — serving a cached shell against Vite's module graph
 * causes exactly the stale-module confusion the comment below warns about.
 */
const serviceWorker = (): Plugin => {
  return {
    name: 'service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const { readFile } = await import('node:fs/promises')

      const assets = Object.keys(bundle)
        .filter((name) => /\.(js|css|wasm)$/.test(name))
        .map((name) => `/${name}`)

      const source = await readFile(
        fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
        'utf8',
      )
      /*
       * "Transpiled" by deleting the declarations, and that is a contract, not
       * a shortcut. `src/sw.ts` is written as plain JavaScript plus `declare`
       * lines for the worker globals — no annotations, no enums, no TS syntax
       * in executable positions — so stripping `///` references and `declare`
       * statements yields valid JS. No transpiler dependency to go stale, and
       * the build below fails loudly if the contract is ever broken, because
       * the emitted file would carry TS syntax a browser refuses to parse —
       * which the offline browser check would catch before any user did.
       */
      const stripped = source
        .split('\n')
        .filter((line) => !line.startsWith('///') && !line.startsWith('declare '))
        .join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const __PRECACHE__=${JSON.stringify(assets)};\n${stripped}`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMetaTag(), serviceWorker()],
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
    // The default. A handful of files opt into jsdom with a
    // `@vitest-environment jsdom` docblock, which is the whole configuration
    // that needs: see TESTING.md § A third environment, for failure only.
    environment: 'node',
    // .tsx as well as .ts: the presentation tests render components through
    // react-dom/server, which needs no DOM, but they live in .tsx files and a
    // .ts-only pattern skips them silently — the suite still passes, just
    // without them. That is how the UI redesign's two component tests went
    // unrun from the day they were written.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    /*
     * Coverage reports. It is deliberately not a gate.
     *
     * No `thresholds` key, and that is the point rather than an omission. A
     * number that fails the build is a number people raise by touching lines,
     * and this suite has already produced a test that asserted nothing and
     * passed — see LESSONS-LEARNED § A test that asserts nothing, and passes.
     * The useful reading of coverage here is *which layer is thin*, which is a
     * thing to look at occasionally, not to enforce.
     *
     * Run with `npm run coverage`.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        // Test support, and the two entry points a unit test never reaches.
        'src/test-support/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
})
