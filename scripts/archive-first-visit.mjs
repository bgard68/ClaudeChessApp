/**
 * Verifies first-visit archive behaviour on a fresh browser profile.
 *
 * Scenario A: plain first visit — the bundled library must appear without any
 * user action beyond opening the archive.
 * Scenario B: the PGN fetches fail on the first attempt (aborted at the network
 * layer). The screen must say the bundled games could not be loaded, and
 * "Try again" must fill the library without a page reload.
 * Scenario C: same failure, healed by navigating away and back instead.
 *
 * Every chromium.launch() gets a brand-new temp profile, so OPFS starts empty —
 * the exact first-ever-visit condition. Development aid, not part of the build,
 * same as phone-screens.mjs. Run the dev server first, then:
 *   APP_URL=http://localhost:<port> node scripts/archive-first-visit.mjs
 */
import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'
const SHOTS = process.env.SHOTS ?? ''

const state = (page) =>
  page.evaluate(() => ({
    heading: document.querySelector('.archive__heading')?.textContent ?? null,
    stats: document.querySelector('.stats-line')?.textContent ?? null,
    rows: document.querySelectorAll('.game-table__row').length,
    notice: [...document.querySelectorAll('.notice')].map((n) => n.textContent.trim()).join(' | '),
  }))

async function freshArchive(withConsole = false) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  if (withConsole) {
    page.on('console', (msg) => {
      if (msg.type() !== 'debug') console.log(`  [console.${msg.type()}] ${msg.text().slice(0, 200)}`)
    })
  }
  return { browser, context, page }
}

const openArchive = async (page) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('button', { hasText: 'Browse championship' }).first().click()
}

async function scenarioA() {
  console.log('A: plain first visit on a fresh profile')
  const { browser, page } = await freshArchive()

  const t0 = Date.now()
  await openArchive(page)
  await page.waitForSelector('.game-table__row', { timeout: 20_000 })
  const s = await state(page)
  console.log(`  rows appeared after ${Date.now() - t0}ms: ${JSON.stringify(s)}`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a-first-visit.png` })
  await browser.close()

  if (s.rows === 0 || !s.heading.includes('games')) throw new Error('scenario A failed')
}

async function scenarioB() {
  console.log('B: PGN fetches fail on the first attempt; "Try again" heals it')
  const { browser, context, page } = await freshArchive(true)

  await context.route('**/games/*.pgn', (route) => route.abort())
  await openArchive(page)
  await page.waitForSelector('.notice--error', { timeout: 20_000 })
  const failed = await state(page)
  console.log(`  failure state: ${JSON.stringify(failed)}`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/b-failure-notice.png` })

  if (!failed.notice.includes('could not be loaded')) {
    throw new Error('scenario B: expected the bundled-games failure notice')
  }

  // The network heals; the user presses the button the notice offers.
  await context.unroute('**/games/*.pgn')
  const t0 = Date.now()
  await page.locator('button', { hasText: 'Try again' }).first().click()
  await page.waitForSelector('.game-table__row', { timeout: 20_000 })
  const healed = await state(page)
  console.log(`  healed after ${Date.now() - t0}ms, no reload: ${JSON.stringify(healed)}`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/b-healed.png` })
  await browser.close()

  if (healed.rows === 0) throw new Error('scenario B: library still empty after retry')
}

async function scenarioC() {
  console.log('C: fetches fail on first visit; navigating away and back heals it')
  const { browser, context, page } = await freshArchive()

  await context.route('**/games/*.pgn', (route) => route.abort())
  await openArchive(page)
  await page.waitForSelector('.notice--error', { timeout: 20_000 })

  await context.unroute('**/games/*.pgn')
  await page.locator('button', { hasText: 'Back' }).first().click()
  await page.locator('button', { hasText: 'Browse championship' }).first().click()
  await page.waitForSelector('.game-table__row', { timeout: 20_000 })
  const healed = await state(page)
  console.log(`  healed by re-entry: ${JSON.stringify(healed)}`)
  await browser.close()

  if (healed.rows === 0) throw new Error('scenario C: library still empty after re-entry')
}

await scenarioA()
await scenarioB()
await scenarioC()
console.log('all scenarios passed')
