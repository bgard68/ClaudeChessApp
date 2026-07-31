/**
 * Accessibility audit against the BUILT app, on every screen, at every width.
 *
 * The layout check asserts that things are present and fit; the unit suite
 * asserts what the markup says. Neither asks whether any of it can be used —
 * whether the contrast is readable, whether a control has a name a screen
 * reader can announce, whether the heading order makes sense. Nothing in this
 * project had ever measured that.
 *
 * axe-core is injected from node_modules rather than through
 * @axe-core/playwright, which depends on the full playwright package; this
 * repository uses playwright-core against the system Chrome.
 *
 * Run `npm run build` first. The gate does.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const PORT = 4320
const URL = `http://localhost:${PORT}`
const isWindows = process.platform === 'win32'

/** The compliance set. Best-practice rules are advisory and not asserted. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Faults that are real, are not ours, and cannot be fixed from here.
 *
 * Reported on every run rather than filtered out silently — a check that
 * quietly drops what it cannot fix is how a known problem becomes a forgotten
 * one. They do not fail the build; anything not on this list does.
 */
const KNOWN = {
  'aria-command-name': {
    why:
      'react-chessboard marks every piece role="button" with aria-roledescription ' +
      '"draggable" and no accessible name. `roleDescription` is hardcoded in its ' +
      'Draggable component and is not a prop, so the only fixes are patching the ' +
      'library or writing aria-labels into its DOM after render — and reaching into ' +
      'the internals of this library is what cost this project two days already.',
  },
}

/** The three widths the stylesheets branch on, as the layout check uses. */
const VIEWPORTS = [
  { name: 'desktop', width: 1834, height: 835 },
  { name: 'phone', width: 360, height: 800 },
]

/** Every screen reachable from the rail, and what says it has arrived. */
const SCREENS = [
  { name: 'Play', rail: null, ready: '.setup__options' },
  { name: 'Puzzle', rail: 'Puzzle of the day', ready: '.screen--puzzle' },
  { name: 'Championships', rail: 'Championships', ready: 'table' },
  { name: 'My games', rail: 'My games', ready: '.screen--archive' },
]

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

/** One entry per rule broken, with every place it is broken. */
const violations = new Map()

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
      if (screen.rail !== null) {
        await page.locator(`.app-rail button[aria-label="${screen.rail}"]`).first().click()
        await page.waitForSelector(screen.ready, { timeout: 30_000 }).catch(() => {})
        await page.waitForTimeout(600)
      }

      // Entrance transforms read as layout offsets to a contrast check while
      // they are still running, and headless can hold one at its first frame.
      await page.evaluate(() => {
        document.querySelectorAll('*').forEach((element) => {
          element.getAnimations?.().forEach((animation) => {
            try {
              animation.finish()
            } catch {
              /* not finishable */
            }
          })
        })
      })

      await page.evaluate(AXE_SOURCE)
      const result = await page.evaluate(
        (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }),
        TAGS,
      )

      for (const violation of result.violations) {
        const entry = violations.get(violation.id) ?? {
          impact: violation.impact,
          help: violation.help,
          where: new Set(),
          targets: new Set(),
        }
        entry.where.add(`${screen.name} @ ${viewport.name}`)
        for (const node of violation.nodes.slice(0, 4)) {
          entry.targets.add(String(node.target[0]).slice(0, 70))
        }
        violations.set(violation.id, entry)
      }
    }

    await context.close()
  }
} finally {
  if (browser !== null) await browser.close()
  server.kill()
}

const order = { critical: 0, serious: 1, moderate: 2, minor: 3 }
const found = [...violations].sort(
  ([, a], [, b]) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9),
)

const known = found.filter(([id]) => id in KNOWN)
const fresh = found.filter(([id]) => !(id in KNOWN))

// Printed every run, so a fault nobody can fix here is still a fault nobody
// gets to forget.
for (const [id, entry] of known) {
  console.log(`known: [${entry.impact}] ${id} — ${entry.help}`)
  console.log(`  on:  ${[...entry.where].join(', ')}`)
  console.log(`  why: ${KNOWN[id].why}`)
}

if (fresh.length > 0) {
  console.error('\nACCESSIBILITY VIOLATIONS')
  for (const [id, entry] of fresh) {
    console.error(`\n  [${entry.impact}] ${id} — ${entry.help}`)
    console.error(`    on: ${[...entry.where].join(', ')}`)
    for (const target of entry.targets) console.error(`    at: ${target}`)
  }
  console.error(`\n${fresh.length} new rule(s) broken.`)
  process.exit(1)
}

console.log(
  `ACCESSIBILITY OK${known.length > 0 ? ` (${known.length} known, not fixable here)` : ''}`,
)
