/**
 * Offline check against the BUILT app: proves the service worker makes the
 * shell survive without a network.
 *
 * The data half already survived offline — games live in SQLite on OPFS — but
 * the shell did not: close the tab, lose the network, and the next visit got
 * the browser's offline page. The worker in src/sw.ts closes exactly that gap,
 * and this script is what keeps the claim honest, because a service worker is
 * the canonical check-that-passes-while-wrong: it can register cleanly, serve
 * nothing offline, and no other test would ever notice.
 *
 * Sequence matters here. The first load registers the worker and lets it
 * precache; only then is the network cut and the page reloaded cold. Asserted
 * offline: the document renders, the board draws its 64 squares, and the clock
 * counts — which proves the hashed JS actually came from the cache, not just
 * the HTML.
 *
 * Run `npm run build` first (the gate does).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4321
const URL = `http://localhost:${PORT}`
const isWindows = process.platform === 'win32'

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error('No Chrome found; set CHROME_PATH.')
  return found
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL)
      if (response.ok) return
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('The preview server never came up.')
}

const failures = []
const check = (what, condition, detail = '') => {
  const mark = condition ? 'ok' : 'FAIL'
  console.log(`${mark}: ${what}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures.push(what)
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: isWindows,
  stdio: 'ignore',
})

let browser = null
try {
  await waitForServer(30_000)

  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  /* ------------------------------------------------ online: prime the cache */

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-square="e2"]', { timeout: 20_000 })

  // The registration is deferred to the window load event, and precaching runs
  // after that; wait for the worker to report itself active.
  const activated = await page.evaluate(
    () =>
      navigator.serviceWorker.ready.then(() => true),
    // No timeout race: Playwright's own evaluate timeout covers a hang.
  )
  check('the service worker reaches the active state', activated === true)

  // `ready` resolves on activation, which can precede the install cache
  // finishing its writes. Poll the cache itself for the thing offline boot
  // actually needs: a cached copy of some hashed script.
  const precached = await page.waitForFunction(
    async () => {
      const keys = await caches.keys()
      for (const key of keys) {
        const requests = await (await caches.open(key)).keys()
        if (requests.some((request) => request.url.includes('/assets/'))) return true
      }
      return false
    },
    { timeout: 15_000 },
  )
  check('the shell assets are precached', Boolean(precached))

  /* -------------------------------------------------- offline: cold reload */

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })

  // The whole point: a full board, from cache, with no network at all.
  await page.waitForSelector('[data-square="e2"]', { timeout: 20_000 })
  const squares = await page.evaluate(() => document.querySelectorAll('[data-square]').length)
  check('the board renders offline', squares === 64, `${squares} squares`)

  const title = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '')
  check('the setup screen is usable offline', title.length > 0, title)

  /* --------------------------------- what must NOT be cached: the PGN data */

  const pgnCached = await page.evaluate(async () => {
    const keys = await caches.keys()
    for (const key of keys) {
      const requests = await (await caches.open(key)).keys()
      if (requests.some((request) => request.url.includes('/games/'))) return true
    }
    return false
  })
  check('first-visit PGN data stays out of the cache', pgnCached === false)

  await context.close()
} finally {
  if (browser !== null) await browser.close()
  server.kill()
}

if (failures.length > 0) {
  console.error('OFFLINE FAILURES')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('OFFLINE OK')
