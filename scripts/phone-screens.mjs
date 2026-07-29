/**
 * Captures the app at phone size using real Chrome, with touch emulation on.
 *
 * Development aid, not part of the build. Run the dev server first, then:
 *   node scripts/phone-screens.mjs [outputDir]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const APP_URL = 'http://localhost:5173'
const outputDir = process.argv[2] ?? './phone-screens'

const PIXEL = {
  viewport: { width: 393, height: 727 },
  deviceScaleFactor: Number(process.env.SHOT_SCALE ?? 3),
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
}

const shots = []

async function main() {
  await mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const context = await browser.newContext(PIXEL)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)

  // JPEG keeps the files small enough to embed in a shareable preview page.
  const asJpeg = process.env.SHOT_FORMAT === 'jpeg'

  const shot = async (name) => {
    const path = join(outputDir, `${name}.${asJpeg ? 'jpg' : 'png'}`)
    await page.screenshot(asJpeg ? { path, type: 'jpeg', quality: 82 } : { path })
    shots.push(path)
    console.log(`  captured ${name}`)
  }

  const byText = (text) =>
    page.locator('button', { hasText: text }).first()

  const centre = async (square) =>
    page.evaluate((s) => {
      const el = document.querySelector(`[data-square="${s}"]`)
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, square)

  /** A real touch drag, via the same CDP events a finger produces. */
  const touchDrag = async (from, to) => {
    const a = await centre(from)
    const b = await centre(to)
    const point = (p) => [{ x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 }]

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(a) })
    for (let step = 1; step <= 6; step += 1) {
      const move = { x: a.x + ((b.x - a.x) * step) / 6, y: a.y + ((b.y - a.y) * step) / 6 }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(move) })
      await page.waitForTimeout(25)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  const sanMoves = () =>
    page.$$eval('.move-list__cell', (cells) =>
      cells.map((c) => c.textContent.trim()).filter(Boolean),
    )

  console.log('Capturing…')
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await shot('1-new-game')

  // --- Play against the computer -------------------------------------------
  await byText('Start game').click()
  await page.waitForSelector('[data-square="e2"]')
  await page.waitForTimeout(400)

  await touchDrag('e2', 'e4')
  await page.waitForTimeout(2500)
  const afterDrag = await sanMoves()

  // Tap-to-move: tap the origin square, then the destination.
  const d2 = await centre('d2')
  await page.touchscreen.tap(d2.x, d2.y)
  await page.waitForTimeout(250)
  await shot('2-play-square-selected')

  const d4 = await centre('d4')
  await page.touchscreen.tap(d4.x, d4.y)
  await page.waitForTimeout(2500)
  const afterTap = await sanMoves()
  await shot('3-play-vs-computer')

  // --- Archive and replay ---------------------------------------------------
  await byText('New game').click()
  await page.waitForTimeout(400)
  await byText('Browse championship').click()
  await page.waitForSelector('.game-row')
  await page.waitForTimeout(600)
  await shot('4-archive')

  await page.locator('.game-row').first().click()
  await page.waitForSelector('.replay__transport')
  await page.waitForTimeout(600)
  await byText('Play').click()
  await page.waitForTimeout(4000)
  await shot('5-replay')

  // --- Landscape ------------------------------------------------------------
  await page.setViewportSize({ width: 727, height: 393 })
  await page.waitForTimeout(700)
  await shot('6-replay-landscape')

  await browser.close()

  console.log('\nTouch results:')
  console.log(`  drag e2->e4 produced: ${JSON.stringify(afterDrag)}`)
  console.log(`  tap  d2->d4 produced: ${JSON.stringify(afterTap)}`)
  console.log(`\n${shots.length} screenshots in ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
