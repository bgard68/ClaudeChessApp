/**
 * Layout invariants against the BUILT app, on every screen, at every width
 * that behaves differently.
 *
 * This exists because of what shipped on 2026-07-31. The unit suite was green,
 * the build passed, and the smoke test passed, while the settings panel was
 * absent from every phone: no destinations, no choices, no Start game. A shared
 * class turned the panel into the fixed bottom navigation bar, and every check
 * asked "is anything here wrong?" when the question was "is everything here?"
 *
 * So the assertions below are mostly presence and containment, not appearance.
 * Pixel diffing was considered and rejected: it fails on font rendering between
 * a laptop and a CI runner, needs binary baselines in the repository, and would
 * not have caught the fault that prompted this any better than asking whether
 * the panel exists.
 *
 * Run `npm run build` first. The gate does.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4318
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

/**
 * The three widths the stylesheets actually branch on: a desktop with both
 * rails, the 861px boundary where the rail becomes a bottom bar, and a phone.
 * The short desktop is here because height is what the setup screen runs out
 * of first.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1834, height: 835 },
  { name: 'desktop-short', width: 1366, height: 700 },
  { name: 'phone', width: 360, height: 800 },
]

/** Every screen reachable from the rail, and what must be on each. */
const SCREENS = [
  { name: 'Play', rail: 'Play', requires: ['.board', '.setup__options', '.setup__actions'] },
  { name: 'Puzzle', rail: 'Puzzle', requires: ['.screen--puzzle'] },
  { name: 'Championships', rail: 'Titles', requires: ['.screen--archive', 'table'] },
  { name: 'My games', rail: 'My games', requires: ['.screen--archive'] },
]

/**
 * Runs in the page. Animations are finished first: an entrance transform
 * reads as a layout offset while it is still running, and a headless run can
 * hold one at its first frame indefinitely.
 */
function measure() {
  document.querySelectorAll('*').forEach((el) => {
    if (el.getAnimations) el.getAnimations().forEach((a) => { try { a.finish() } catch { /* not finishable */ } })
  })

  const de = document.documentElement
  const rail = document.querySelector('.app-rail:not(.app-rail--right)')
  const railBox = rail.getBoundingClientRect()
  const railFixed = getComputedStyle(rail).position === 'fixed'

  // What is painted underneath a fixed navigation bar, at the end of the page.
  const before = window.scrollY
  window.scrollTo(0, de.scrollHeight)
  const behindNav = new Set()
  if (railFixed) {
    for (const fraction of [0.2, 0.5, 0.8]) {
      const stack = document.elementsFromPoint(
        Math.round(window.innerWidth * fraction),
        Math.round(railBox.top + 4),
      )
      const railIndex = stack.findIndex((el) => el.classList?.contains('app-rail'))
      stack.slice(railIndex + 1).forEach((el) => {
        if (el.closest?.('.app-content') || el.closest?.('.app-rail--right')) {
          behindNav.add(el.className?.toString().split(' ')[0] ?? el.tagName)
        }
      })
    }
  }
  window.scrollTo(0, before)

  const interactive = [...document.querySelectorAll('.app-content button, .app-rail--right button')]
  const smallTargets = interactive
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.height < 43.5
    })
    .map((el) => el.textContent.trim().slice(0, 24))

  // Prose has a floor; decoration does not. An element marked aria-hidden is
  // not being read, and an <abbr> carries its meaning in the title rather than
  // the glyphs — a country badge reading "POL" is a label, not a sentence.
  const decorative = (el) =>
    el.getAttribute('aria-hidden') === 'true' ||
    el.closest('[aria-hidden="true"]') !== null ||
    (el.tagName === 'ABBR' && el.hasAttribute('title'))

  const smallText = new Set()
  document.querySelectorAll('.app-content *, .app-rail--right *').forEach((el) => {
    if (el.childElementCount === 0 && el.textContent.trim() && !decorative(el)) {
      if (parseFloat(getComputedStyle(el).fontSize) < 12) {
        const name = el.className?.toString().split(' ')[0]
        smallText.add(name || `<${el.tagName.toLowerCase()}>`)
      }
    }
  })

  const board = document.querySelector('.board')
  const boardBox = board?.getBoundingClientRect()

  return {
    horizontalOverflow: de.scrollWidth > window.innerWidth,
    behindNav: [...behindNav],
    smallTargets,
    smallText: [...smallText],
    clippedNavLabels: [...document.querySelectorAll('.app-nav__label')]
      .filter((l) => l.scrollWidth > l.clientWidth + 1)
      .map((l) => l.textContent),
    board: boardBox ? { width: Math.round(boardBox.width), height: Math.round(boardBox.height) } : null,
    railIsBottomBar: railFixed,
  }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: isWindows,
  stdio: 'ignore',
})

const failures = []
const note = (screen, viewport, message) => failures.push(`${screen} @ ${viewport}: ${message}`)

let browser = null
try {
  await waitForServer(30_000)
  browser = await chromium.launch({ executablePath: chromePath(), headless: true })

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const page = await context.newPage()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-square="e2"]', { timeout: 20_000 })

    for (const screen of SCREENS) {
      if (screen.rail !== 'Play') {
        await page.locator(`.app-rail button:has-text("${screen.rail}")`).first().click()
        // The archive opens its database and seeds the library on first visit,
        // which is slower than a fixed pause: wait for what the screen must
        // show rather than guessing how long it takes.
        for (const selector of screen.requires) {
          await page.waitForSelector(selector, { timeout: 20_000 }).catch(() => {})
        }
        await page.waitForTimeout(400)
      }

      // Presence first: this is the class of fault the suite could not see.
      for (const selector of screen.requires) {
        if ((await page.locator(selector).count()) === 0) {
          note(screen.name, viewport.name, `missing ${selector}`)
        }
      }

      const m = await page.evaluate(measure)

      if (m.horizontalOverflow) note(screen.name, viewport.name, 'page scrolls sideways')
      if (m.behindNav.length > 0) {
        note(screen.name, viewport.name, `hidden behind the navigation bar: ${m.behindNav.join(', ')}`)
      }
      // Both of these are phone rules by design: a cursor does not need a
      // 44px target, and the 12px floor is set below 600px where the reading
      // distance is short. Asserting them on a desktop would fail the chips
      // that are deliberately 34px there.
      if (viewport.name === 'phone') {
        if (m.smallTargets.length > 0) {
          note(screen.name, viewport.name, `tap targets under 44px: ${m.smallTargets.join(', ')}`)
        }
        if (m.smallText.length > 0) {
          note(screen.name, viewport.name, `text under 12px: ${m.smallText.join(', ')}`)
        }
      }
      if (m.clippedNavLabels.length > 0) {
        note(screen.name, viewport.name, `navigation labels clipped: ${m.clippedNavLabels.join(', ')}`)
      }
      if (m.board !== null && Math.abs(m.board.width - m.board.height) > 2) {
        note(screen.name, viewport.name, `board is ${m.board.width}x${m.board.height}, not square`)
      }
    }

    await context.close()
    console.log(`ok: ${viewport.name} (${viewport.width}x${viewport.height})`)
  }

  if (failures.length > 0) {
    console.error('\nLAYOUT FAILURES:')
    for (const f of failures) console.error(`  - ${f}`)
    throw new Error(`${failures.length} layout invariant(s) broken.`)
  }
  console.log('LAYOUT OK')
} finally {
  if (browser !== null) await browser.close()
  if (isWindows) {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill('SIGTERM')
  }
}
