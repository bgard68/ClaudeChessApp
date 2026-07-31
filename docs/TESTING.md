# Testing

How this app is tested, why the tools are the ones they are, what they cannot
reach, and how to add a check of your own.

There are two test environments and four browser scripts. The split is not
ceremony: each catches a class of fault the other is blind to, and every one of
them exists because something got through.

---

## The two environments

| | Unit suite | Browser checks |
| --- | --- | --- |
| Runner | Vitest, `environment: 'node'` | `playwright-core` against system Chrome |
| Renders with | `renderToStaticMarkup` | The real thing, from `dist/` |
| Sees | The first commit of a component | Effects, state, interaction, layout, contrast |
| Blind to | Anything an effect does | Nothing much — but cannot inject failure |
| Speed | 494 tests in ~7s | ~30s per script |
| Files | 48 under `src/**/*.test.ts(x)` | 4 under `scripts/` |

### Running them

```bash
npm test
```

```bash
npm run verify
```

`verify` is typecheck + unit tests + `npm audit`. It does **not** build or open
a browser, so it is the fast loop.

The browser scripts need a build first. Each one serves `dist/` exactly as
production would:

```bash
npm run build && npm run behaviour-check
```

Also available: `npm run layout-check`, `npm run a11y-check`, and
`node scripts/smoke-test.mjs`.

The full gate — everything, plus gitleaks and the probes that prove each tool
still rejects what it must — is what CI runs:

```bash
pwsh scripts/test-gate.ps1
```

---

## The four browser scripts

Each answers a different question, and each exists because of a specific
failure.

**`smoke-test.mjs`** — *does the built app stand up at all?* Boots the page,
renders the board, starts a game, waits for bundled Stockfish to answer a real
move. Unit tests cannot catch a broken bundle, a missing `.wasm`, or a worker
path typo.

**`layout-check.mjs`** — *is everything on the screen, at every width?* Four
screens × three viewports, presence first, then containment, tap targets, text
size and board dimensions. It exists because the settings panel was absent from
every phone while four separate checks called the screen clean — each asked "is
anything here wrong?" and none asked "is everything here?"

**`behaviour-check.mjs`** — *does using it work?* Paging appends, searching
replaces, chips clear the box, sort reverses, reset clears the sort too, arrow
keys move the selection, the two library scopes stay separate, a move played
reaches the move list. It exists because the archive's scope never reached its
query for a while, and nothing that ran on a commit could have noticed.

**`a11y-check.mjs`** — *can any of it be used?* axe-core over four screens at
two widths, against WCAG 2.1 A and AA.

---

## Playwright, not jsdom

Component behaviour could be tested in a fake DOM instead. It is not, and the
reasoning is worth keeping because it is a genuine trade rather than an obvious
call.

### What was chosen

`playwright-core` driving the system Chrome — which was already here for the
smoke test — extended to cover behaviour and accessibility.

### Why

- **The browser was already in CI.** `test-gate.ps1` has run browser checks on
  every pull request for as long as the gate has existed. Adding behaviour
  tests there cost no new infrastructure and no new dependency.
- **The faults that actually happened needed a real render.** A scope missing
  from an effect's dependency list, and a settings panel that a shared CSS
  class turned into a 72px strip. jsdom runs effects, so it would have caught
  the first; it has no layout engine at all, so it could never have caught the
  second.
- **One environment fewer.** jsdom would have made three: node units, jsdom
  components, real-Chrome end-to-end. Three places to ask "where does this test
  belong?" is worse than two.

### What it costs

- **Seconds, not milliseconds.** A browser script is ~30s against ~7s for 494
  unit tests. Fine at four scripts; it would not be fine at four hundred tests.
- **Failure cannot be injected.** This is the real loss. The browser gets the
  real SQLite database, which always succeeds, so "what does the screen do when
  the query throws?" is not reachable. Those paths stay the unit suite's job,
  where a stand-in service can be handed in through `ServicesProvider`.
- **Setup, not assertion, is where the time goes.** See
  [the trap below](#the-trap-waiting-for-the-wrong-signal).

### If you want jsdom anyway

Nothing above rules it out — it is a reasonable choice for fine-grained
component and hook tests, and it would reach the paths listed under *What it
costs*.

```bash
npm install --save-dev jsdom @testing-library/react @testing-library/user-event
```

Do **not** flip `environment` in `vite.config.ts`. Opt in per file, so the 494
existing tests stay on node and keep their speed:

```ts
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
```

Regenerate the lock file the way [SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) requires,
or the Linux deploy breaks.

---

## What is not covered, and why

Honesty about the holes matters more than the number of tests.

| Not covered | Why |
| --- | --- |
| Error paths in screens — a failed query, a rejected import | The browser gets the real database, which succeeds. Needs jsdom with an injected service, or a fault-injection seam. |
| `PlayerSearch`'s suggestion list | Only exists after an effect resolves, so a static render is always `null`. A test asserting that would pass whether or not the component worked. |
| `useArchiveQuery`'s wiring | The decisions it makes are extracted into `archiveQuery.ts` and tested directly; the effects around them are not. |
| `StockfishEngine`, the SQLite worker, storage persistence | Need a real browser environment plus the engine binary. The smoke test proves the engine answers; nothing tests its UCI handling in isolation. |
| Real devices | Everything runs in headless Chrome, which has no collapsing URL bar, no home-indicator inset, and no touch. See [UI-REDESIGN.md](UI-REDESIGN.md#browser-qa-still-worth-doing). |
| Pieces having accessible names | `react-chessboard` gives every piece `role="button"` with no name and hardcodes `roleDescription`. Recorded as a known finding in `a11y-check.mjs` and printed on every run. |

That last row is a policy as much as an entry: the accessibility script keeps a
`KNOWN` map of faults that are real, are not ours, and cannot be fixed from
here. They are **printed every run rather than filtered out**, because a check
that quietly drops what it cannot fix is how a known problem becomes a
forgotten one. Anything not on that list fails the build.

---

## Writing a new browser check

All four scripts share a shape. Copy the nearest one rather than starting
blank — the server spawn, the Chrome lookup and the teardown are the same
everywhere.

```js
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4321                       // one per script; they run in sequence
const URL = `http://localhost:${PORT}`

// playwright-core ships no browser, so the system Chrome is found by path
// and CHROME_PATH overrides it.
function chromePath() { /* copy from any existing script */ }

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: process.platform === 'win32',
  stdio: 'ignore',
})

const failures = []
const check = (what, condition, detail) => {
  if (!condition) failures.push(`${what}${detail === undefined ? '' : ` — ${detail}`}`)
}

let browser = null
try {
  await waitForServer(30_000)
  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  // …drive the page, call check() …
} finally {
  if (browser !== null) await browser.close()
  server.kill()
}

if (failures.length > 0) {
  console.error('WHATEVER FAILURES')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('WHATEVER OK')
```

Then add it in two places:

- `package.json` → `scripts`, so it can be run alone
- `scripts/test-gate.ps1` → an `Invoke-Gate` line, so CI runs it

### House rules

**Collect failures; do not throw on the first.** One run should report
everything wrong, not the first thing wrong. That is why `check()` pushes to an
array instead of asserting.

**Say what you saw, not just that it failed.** `check('paging appends', a > b,
\`${b} then ${a}\`)` turns a red line into a diagnosis.

**Navigate by `aria-label`, not by visible text.** The rail's labels change with
width — "Championships" becomes "Titles" on a phone — but the `aria-label` is
stable:

```js
page.locator('.app-rail button[aria-label="Championships"]')
```

**Wait for a condition, never for a duration.** The archive opens a database and
seeds the library on first visit; how long that takes is not knowable in
advance.

### The trap: waiting for the wrong signal

This one cost real time, and it will catch the next person too.

Typing into the archive's search box **restarts the paging immediately**, but
the query itself is debounced. So the row count goes:

```
80 rows  →  40 rows (the OLD question, back at page one)  →  23 rows (the new one)
```

A helper that waits for the count to *change* returns at 40 — the old question's
first page — and every assertion after it runs against the wrong state. In the
first draft of `behaviour-check.mjs` this produced a **passing** check that the
search had narrowed the list, because 40 is indeed fewer than 80.

It was caught only because the assertion after it failed, and because the
failure got instrumented rather than waited-out with a longer timeout.

Wait for the count to *stop* changing:

```js
async function settled(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let last = -1
  let stable = 0
  while (Date.now() < deadline) {
    const count = await rows(page)
    stable = count === last ? stable + 1 : 0
    last = count
    if (stable >= 3) return count      // spans the debounce and the query
    await page.waitForTimeout(150)
  }
  return last
}
```

**A browser test that goes green after a timing change deserves more suspicion
than one that goes red.** Red says the assertion is wrong or the app is; green
after a sleep says only that something arrived, and not that it was the thing
you meant.

---

## Writing a new unit test

The suite renders to static markup, so a component's markup is a string:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'

const markup = renderToStaticMarkup(<ClockPanel whiteMs={30_000} … />)
expect(markup).toContain('clock-face--low')
```

Two things follow from that, and both have bitten:

**Effects do not run.** `useEffect` never fires, so anything fetched, measured
or subscribed is absent. A component whose content arrives via an effect renders
as `null`, and a test asserting *that* proves nothing.

**Portals do not appear.** The setup screen's settings render into the shell's
right rail through `createPortal`, which needs a DOM node that does not exist
here. What such a screen can assert is that it renders at all before its portal
target exists — which is a real thing to check, and not the same as checking the
panel.

Where a decision cannot be reached by a static render, **extract it and test it
directly** rather than reaching for a heavier environment. That is why
`archiveQuery.ts` exists apart from `useArchiveQuery.ts`: query construction,
page accumulation, sort toggling, keyboard movement and the active-filter list
are plain functions with 35 tests, and only the wiring needs a browser.

For screens that need services, hand in a stand-in — `ServicesProvider` takes an
optional `value` for exactly this, so no test opens a real database:

```tsx
renderToStaticMarkup(
  <ServicesProvider value={{ services: { archive: … }, factory: {} } as never}>
    <PlayScreen … />
  </ServicesProvider>,
)
```

### One more rule, learned the expensive way

`vite.config.ts` includes **both** `*.test.ts` and `*.test.tsx`. It once
included only the first, and two component test files sat inert for their
entire existence while the suite reported green — an unmatched test does not
exist as far as the runner is concerned, and unlike a skipped one it announces
nothing.

**When a merge adds test files, watch the file count, not just the pass count.**

---

## See also

- [LESSONS-LEARNED.md](LESSONS-LEARNED.md) — the bugs behind most of the above,
  and the wrong explanation that looked right first in each case.
- [UI-ARCHITECTURE.md](UI-ARCHITECTURE.md) — what the layout check asserts, and
  why presence rather than pixels.
- [SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) — what the gate enforces, and the lock file
  procedure any new dependency has to respect.
