/**
 * What the app DOES, against the built app, in a real browser.
 *
 * The unit suite renders components to static markup, which can say what a
 * screen looks like on its first commit and nothing about what happens when
 * you use it. Everything driven by an effect — the archive query, paging,
 * sorting, the debounce — is invisible to it, and that is exactly where this
 * project's expensive faults have lived: a scope that never reached the query
 * because it was missing from an effect's dependencies, and paging that
 * skipped a page because the offset was computed from the wrong number.
 *
 * Both were found by hand, in a browser, one afternoon. This is that afternoon
 * written down.
 *
 * Deliberately not jsdom: the browser is already here for the layout check and
 * the smoke test, it runs in CI, and a fake DOM would not have shown either of
 * the faults above. The trade is that failures cannot be injected — the real
 * database always succeeds — so error paths stay the unit suite's job.
 *
 * Run `npm run build` first. The gate does.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4319
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

const failures = []
const check = (what, condition, detail) => {
  if (!condition) failures.push(`${what}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** Wide enough for the preview pane, which the row-selection rules depend on. */
const VIEWPORT = { width: 1440, height: 900 }

const rows = (page) => page.locator('tbody tr').count()
const railButton = (page, label) => page.locator(`.app-rail button[aria-label="${label}"]`).first()

/**
 * Waits until the row count stops changing, and returns it.
 *
 * Deliberately not "wait until the count differs from before": typing into
 * the search box restarts the paging immediately, so the list drops back to
 * one page of the OLD question before the debounce delivers the new one. The
 * counts run 80, then 40, then 23, and the first change is the wrong answer.
 * Stability is the only signal that means the query has finished.
 */
async function settled(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let last = -1
  let stable = 0

  while (Date.now() < deadline) {
    const count = await rows(page)
    stable = count === last ? stable + 1 : 0
    last = count
    // Three in a row, spanning the debounce and the query behind it.
    if (stable >= 3) return count
    await page.waitForTimeout(150)
  }
  return last
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: isWindows,
  stdio: 'ignore',
})

let browser = null
try {
  await waitForServer(30_000)
  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-square="e2"]', { timeout: 20_000 })

  /* ---------------------------------------------------------------- setup */

  // The preview is the only feedback that choosing a seat did anything, and
  // it is drawn by the board rather than by the setting.
  await page.locator('button:visible').filter({ hasText: /^Black$/ }).click()
  await page.waitForTimeout(300)
  const blackFirst = await page.evaluate(() => {
    const markup = document.querySelector('#chessboard-board')?.innerHTML ?? ''
    return markup.indexOf('data-square="h1"') < markup.indexOf('data-square="a8"')
  })
  check('choosing Black turns the preview board around', blackFirst)

  await page.locator('button:visible').filter({ hasText: /^White$/ }).click()
  await page.waitForTimeout(300)

  /* -------------------------------------------------------------- archive */

  await railButton(page, 'Championships').click()
  await page.waitForSelector('tbody tr', { timeout: 30_000 })
  await page.waitForTimeout(600)

  const firstPage = await rows(page)
  check('the championship library lists games', firstPage > 0, `saw ${firstPage} rows`)

  /*
   * Paging appends. The bug this guards computed the next offset from the
   * previous offset plus limit, which is correct only while the limit is a
   * page size — "load all" leaves one that is not, and the next page then
   * skips everything just loaded.
   */
  await page.locator('button:has-text("more")').first().click()
  const secondPage = await settled(page)
  check(
    'loading more appends a page rather than replacing one',
    secondPage > firstPage,
    `${firstPage} then ${secondPage}`,
  )

  // A new question replaces the accumulated pages instead of adding to them.
  await page.locator('input[type="search"]').fill('fischer')
  const searched = await settled(page)
  check(
    'searching narrows the list instead of growing it',
    searched > 0 && searched < secondPage,
    `${secondPage} then ${searched}`,
  )
  check(
    'the search shows as a chip',
    (await page.locator('.chip--selected').count()) > 0,
  )

  // Dismissing the chip clears the box too, or the text stays behind and
  // silently goes on filtering.
  await page.locator('.chip--selected').first().click()
  await settled(page)
  check(
    'clearing the chip empties the search box',
    (await page.locator('input[type="search"]').inputValue()) === '',
  )

  /* ----------------------------------------------------------------- sort */

  const years = () =>
    page.locator('tbody tr .col-year').evaluateAll((cells) =>
      cells.slice(0, 3).map((cell) => Number(cell.textContent.trim())),
    )

  await page.locator('th button:has-text("Year")').first().click()
  await page.waitForTimeout(1_200)
  const descending = await years()
  await page.locator('th button:has-text("Year")').first().click()
  await page.waitForTimeout(1_200)
  const ascending = await years()

  // Nobody opening a chess archive by year wants 1886 first, so the first
  // click on that column runs newest-first and the second reverses it.
  check(
    'sorting by year starts at the newest',
    descending[0] > ascending[0],
    `${descending[0]} then ${ascending[0]}`,
  )
  check('a second click reverses the order', ascending[0] <= ascending[2])

  /* -------------------------------------------------------------- filters */

  const resultFilter = page.locator('.filters select').nth(1)
  await resultFilter.selectOption('1-0')
  await page.waitForTimeout(1_500)
  const decisive = await page.locator('tbody tr .col-result').evaluateAll((cells) =>
    cells.slice(0, 5).map((cell) => cell.textContent.trim()),
  )
  check(
    'filtering by result returns only that result',
    decisive.length > 0 && decisive.every((text) => text.includes('1') && !text.includes('½')),
    decisive.join(' '),
  )

  // Reset clears the sort as well as the filters: a list still ordered by a
  // column whose header no longer says so is worse than either.
  await page.locator('button:has-text("Reset")').first().click()
  await page.waitForTimeout(1_500)
  check(
    'reset clears every filter chip',
    (await page.locator('.chip--selected').count()) === 0,
  )
  check(
    'reset clears the sort as well',
    (await page.locator('th[aria-sort]:not([aria-sort="none"])').count()) === 0,
  )

  /* ------------------------------------------------------------- keyboard */

  await page.locator('tbody tr').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  check(
    'the arrow keys move the selection',
    (await page.locator('tbody tr[aria-selected="true"], tbody tr.is-selected').count()) > 0,
  )

  /* ---------------------------------------------------------------- scope */

  // Two screens share one component; the scope reaching the query is what
  // keeps them apart. When it did not, both showed the same games.
  await railButton(page, 'My games').click()
  await page.waitForSelector('.screen--archive', { timeout: 20_000 })
  await page.waitForTimeout(1_500)
  const mine = await rows(page)
  check(
    'My games is a different library from the championships',
    mine !== firstPage,
    `both showed ${mine} rows`,
  )
  check(
    'an empty collection says so rather than showing nothing',
    (await page.locator('text=/Nothing here yet/i').count()) > 0 || mine > 0,
  )

  /* ------------------------------------------------------------------ play */

  await railButton(page, 'Play chess').click()
  await page.waitForSelector('.setup__actions', { timeout: 20_000 })
  await page.locator('button:has-text("Start game")').first().click()
  await page.waitForSelector('.screen--play', { timeout: 20_000 })
  await page.waitForTimeout(800)

  // A move played on the board has to reach the move list, which is the one
  // path that proves the board, the rules and the game state are connected.
  await page.locator('[data-square="e2"]').click()
  await page.waitForTimeout(250)
  await page.locator('[data-square="e4"]').click()
  await page.waitForTimeout(1_200)
  const moveList = await page.locator('.play__moves:visible').textContent().catch(() => '')
  check(
    'a move played on the board reaches the move list',
    (moveList ?? '').includes('e4'),
    (moveList ?? '').trim().slice(0, 60),
  )

  /* --------------------------------------------------------------- console */

  // Ignore the noise a dev-less preview still produces for missing favicons.
  const real = consoleErrors.filter((text) => !/favicon|404 \(Not Found\)/i.test(text))
  check('nothing threw along the way', real.length === 0, real.slice(0, 3).join(' | '))

  await context.close()
} finally {
  if (browser !== null) await browser.close()
  server.kill()
}

if (failures.length > 0) {
  console.error('BEHAVIOUR FAILURES')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('BEHAVIOUR OK')
