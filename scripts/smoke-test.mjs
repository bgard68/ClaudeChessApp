/**
 * Smoke test against the BUILT app: serves dist/ exactly as production would,
 * then proves the whole stack stands up — page boots clean, the board
 * renders, a game starts, and the bundled Stockfish answers a real move.
 * Unit tests cannot catch a broken bundle, a missing wasm file, or a worker
 * path typo; this can. Run `npm run build` first (the gate does).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4317
const URL = `http://localhost:${PORT}`
const isWindows = process.platform === 'win32'

/** The system Chrome, since playwright-core ships no browser of its own. */
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

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: isWindows,
  stdio: 'ignore',
})

let browser = null
try {
  await waitForServer(30_000)

  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage()

  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(URL, { waitUntil: 'networkidle' })

  // The setup screen, whole: board drawn, both journeys offered.
  await page.waitForSelector('[data-square="e2"]', { timeout: 20_000 })
  for (const label of ['Start game', 'Browse championship games', 'Puzzle of the day']) {
    if ((await page.locator(`button:has-text("${label}")`).count()) === 0) {
      throw new Error(`Setup screen is missing "${label}".`)
    }
  }
  console.log('ok: setup screen renders, board and all')

  // A real game against the bundled engine: our move, then its answer.
  await page.locator('button:has-text("Start game")').click()
  await page.waitForSelector('.play__panel', { timeout: 10_000 })
  await page.locator('[data-square="e2"]').click()
  await page.locator('[data-square="e4"]').click()

  const deadline = Date.now() + 30_000
  let plies = 0
  while (Date.now() < deadline && plies < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    plies = await page.locator('.move-list__cell').count()
  }
  if (plies < 2) throw new Error('Stockfish never answered the opening move.')
  console.log('ok: game started and the engine replied')

  if (errors.length > 0) {
    throw new Error(`Console errors during smoke: ${errors.slice(0, 3).join(' | ')}`)
  }
  console.log('ok: not a single console error')
  console.log('SMOKE PASSED')
} finally {
  if (browser !== null) await browser.close()
  if (isWindows) {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill('SIGTERM')
  }
}
