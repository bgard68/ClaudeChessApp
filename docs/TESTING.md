# Testing

How this app is tested, why the tools are the ones they are, what they cannot
reach, and how to add a check of your own.

There are three test environments and four browser scripts. The split is not
ceremony: each catches a class of fault the others are blind to, and every one of
them exists because something got through.

---

## The three environments

| | Unit suite | Failure suite | Browser checks |
| --- | --- | --- | --- |
| Runner | Vitest, `environment: 'node'` | Vitest, `environment: 'jsdom'` | `playwright-core` against system Chrome |
| Renders with | `renderToStaticMarkup` | Testing Library, real effects | The real thing, from `dist/` |
| Sees | The first commit of a component | Effects, state, clicks — with services it controls | Effects, state, interaction, layout, contrast |
| Blind to | Anything an effect does | Layout, geometry, real breakpoints | Nothing much — but cannot inject failure |
| Speed | 810 tests in ~7s | included above, ~2s of it | ~30s per script |
| Files | 59 under `src/**/*.test.ts(x)` | 2, by docblock | 4 under `scripts/` |

The middle column is new and deliberately small — two files, both named
`*.failures.test.tsx`. Its reason for existing is the one thing neither other
column can do: **make a dependency fail on purpose.**

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
screens × four viewports, presence first, then containment, tap targets, text
size, board dimensions, and — on a phone — whether the thing you came to the
screen to do is above the fold. It exists because the settings panel was absent
from every phone while four separate checks called the screen clean — each asked
"is anything here wrong?" and none asked "is everything here?"

Presence turned out not to be the whole question either. Every phone screen was
laid out for a desktop and left to stack, so Show hint, Start game and the
replay transport all *existed* — 1,100 to 1,400 points down a page, below the
board they act on, which is present and unusable. Hence the fold assertion.

Two of the four viewports are phones, because they disagree. The phone rules
size the boards against the viewport height, so at 393×727 a board is bounded by
the height and at 360×800 by the width. Checked against only the latter, the
puzzle's hint button finished five points under the navigation bar and nothing
said so.

**`behaviour-check.mjs`** — *does using it work?* Paging appends, searching
replaces, chips clear the box, sort reverses, reset clears the sort too, arrow
keys move the selection, the two library scopes stay separate, a move played
reaches the move list. It exists because the archive's scope never reached its
query for a while, and nothing that ran on a commit could have noticed.

**`a11y-check.mjs`** — *can any of it be used?* axe-core over four screens at
two widths, against WCAG 2.1 A and AA.

**`paths-check.mjs`** — *is anything tracked that should not be?* Two questions,
because one of them cannot be asked yet at the moment it matters. First: which
tracked files does the repository's own `.gitignore` now disown — `git ls-files
--cached --ignored --exclude-standard`, which must come back empty. Second: a
denylist of paths that must never be tracked whatever `.gitignore` says, since
the first check cannot fire until somebody remembers to write the rule.

Both run against the index, and the denylist also runs across every commit a
change adds. That last part is the one that would have mattered: `.claude/`
was deleted from the tip and added to `.gitignore` five hours before this
repository first existed on GitHub, and it went up anyway, because `git push`
sends history and deleting a file in a later commit does not take it back out.
A check that examined the tip would have passed while it was exposed.

It runs in the gate and in the pre-commit hook — the hook first, because that
is the only moment when the fix is still free.

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
- **One environment fewer** — this argument has since been *partly conceded*,
  and it is worth being straight about that rather than quietly leaving the
  original text. jsdom was added later for one job the other two cannot do at
  all: making a dependency fail. That makes three environments, with the cost
  this bullet predicted — a third place to ask "where does this test belong?" —
  paid down by a rule narrow enough to answer it: *only failure goes there*. See
  [§ A third environment](#a-third-environment-for-failure-only). Everything
  else below still stands.

### What it costs

- **Seconds, not milliseconds.** A browser script is ~30s against ~7s for 810
  unit tests. Fine at four scripts; it would not be fine at four hundred tests.
- **Failure cannot be injected.** This was the real loss, and it is the one that
  eventually justified a third environment — the node suite could take a
  stand-in service through `ServicesProvider` but never ran the effect that used
  it, so between them the two environments could hand over a failing dependency
  and never see what the screen did about it.
- **Setup, not assertion, is where the time goes.** See
  [the trap below](#the-trap-waiting-for-the-wrong-signal).

### And if you want more of it

jsdom is now here, for failure injection only, and the advice this section used
to give about *how* to add it turned out to be right and was followed: it is
opted into per file rather than by flipping `environment` in `vite.config.ts`, so
the other 59 files stay on node and keep their speed.

What has not changed is the argument against using it for general component
work — there is a real Chrome two columns over, and a fake DOM has no layout
engine. Before adding a third jsdom file, read the rules in
[§ A third environment](#a-third-environment-for-failure-only) and check the test
could not go in the node suite or a browser script instead.

If you add a dependency for it, regenerate the lock file the way
[SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) requires, or the Linux deploy breaks.

---

## What is not covered, and why

Honesty about the holes matters more than the number of tests.

| Not covered | Why |
| --- | --- |
| Error paths in screens — a failed import, a failed export | **Partly closed.** A failed archive query and a failed save are covered by the jsdom failure suite; import and export still are not, because both go through a `File` and a download the environment cannot supply. |
| `PlayerSearch`'s suggestion list | Only exists after an effect resolves, so a static render is always `null`. A test asserting that would pass whether or not the component worked. |
| `useArchiveQuery`'s wiring | The decisions it makes are extracted into `archiveQuery.ts` and tested directly. Its failure path is now covered through the screen; its paging is not, and depends on an invariant documented at `accumulatePages`. |
| `StockfishEngine`, the SQLite worker, storage persistence | Need a real browser environment plus the engine binary. The smoke test proves the engine answers; nothing tests its UCI handling in isolation. |
| Real devices | Everything runs in headless Chrome, which has no collapsing URL bar, no home-indicator inset, and no touch. See [UI-REDESIGN.md](UI-REDESIGN.md#browser-qa-still-worth-doing). |
| Pieces having accessible names | `react-chessboard` gives every piece `role="button"` with no name and hardcodes `roleDescription`. Recorded as a known finding in `a11y-check.mjs` and printed on every run. |

That last row is a policy as much as an entry: the accessibility script keeps a
`KNOWN` map of faults that are real, are not ours, and cannot be fixed from
here. They are **printed every run rather than filtered out**, because a check
that quietly drops what it cannot fix is how a known problem becomes a
forgotten one. Anything not on that list fails the build.

---

## A third environment, for failure only

Two files run under jsdom instead of node:
`src/presentation/screens/ArchiveScreen.failures.test.tsx` and
`PlayScreen.failures.test.tsx`. They opt in with a docblock on line one —

```tsx
/** @vitest-environment jsdom */
```

— which is the entire configuration. The suite default stays `node`, so the
other 59 files are unaffected and pay nothing for this.

### Why it exists

The table above has a column that reads *"cannot inject failure"*, and the
documented coverage holes all sat behind it: a rejected query, a failed import, a
preview that will not load. The node suite never runs the effect that queries;
the browser scripts get the real SQLite library, which succeeds. Neither can be
told to fail, so the words the app says when something breaks were never checked.

The seam was already there and unused. `ServicesProvider` takes an optional
`value` prop, documented from the start as *"stand-in services, for tests… opening
a real database is not something a test of a screen should have to do."* All that
was missing was an environment where effects run.

### The rules for this column

**Only failure.** If a test does not depend on a service refusing, it does not
belong here — it belongs in the node suite, which is faster, or in a browser
script, which is real. This column is not for convenience, and growing it into a
general component suite would mean asserting against a fake DOM when a real
Chrome is already wired up two columns over.

**No geometry, ever.** `src/test-support/dom.ts` stubs `ResizeObserver`,
`matchMedia` and `scrollIntoView` because jsdom has no layout engine. They are
stubs, not polyfills: the observer never fires. Anything about size, breakpoints
or scrolling is `layout-check.mjs`'s job, against actual Chrome. A rule in
`architecture.test.ts` asserts no shipped file imports `test-support/`, because a
`ResizeObserver` that never fires is correct in a test and silently wrong in an
application — and would fail by doing nothing.

**Known limit, recorded in place.** The archive's *failed preview caption* cannot
be driven here. React renders the right text — confirmed by instrumenting it —
and the update never reaches the DOM; `PlayScreen` does the same thing
successfully, so it is specific to the subtree with the board in it rather than
to jsdom. The decision itself is covered by `previewCaption`'s unit tests. The
full note is in the test file, where whoever next tries it will find it.

---

## Coverage

```bash
npm run coverage
```

Prints a table and writes `coverage/` (gitignored). **There is no threshold, and
that is a decision rather than an omission.** A number that fails the build is a
number people raise by touching lines, and this repository has already produced
[a test that asserted nothing and passed](#a-test-that-asserts-nothing-and-passes).
Coverage here is for reading, not for enforcing.

What it is worth reading *for* is which layer is thin. As of this writing:

| Layer | Lines |
| --- | --- |
| `domain/archive` | 100% |
| `domain/clock` | 100% |
| `domain/chess` | 97% |
| `application` | 97% |
| `composition` | 60% |
| `presentation` | 59% |

That shape is the point. The inner layers are pure functions and are thoroughly
covered; `presentation` is a third less covered and is where every defect in
[REACT-TIMING-AUDIT.md](REACT-TIMING-AUDIT.md) lived. The number did not find
those bugs and would not have — but it does tell you, in one line, where to point
the next sweep. `composition` is low for a benign reason: it wires adapters that
only a browser can construct.

---

## Reviewing for timing

The first row of the table above — *the unit suite sees the first commit, and is
blind to anything an effect does* — is not a small gap. Run against
`src/presentation/`, the six questions below found **eleven defects** that
several careful reviews had missed, because every one of them lives in the
second render or later and the suite therefore had nothing to say about any of
them. The findings, and why reading the code did not surface them, are in
[REACT-TIMING-AUDIT.md](REACT-TIMING-AUDIT.md).

Ask these of any change under `src/presentation/`. Enumerate the answers — the
point is a list you can check off, not a judgement about whether the code looks
right. None of the eleven looked wrong.

1. **Where does an async callback write state?** For each one: what cancels it,
   and does that cover *every* way the user can make the result irrelevant — not
   just the next call to the same function? A `cancelled` flag that cannot see a
   navigation from elsewhere is not cancellation.
2. **Does any state describe a moment?** A hint describes a position, a
   selection describes a list, a save describes a ply. If so it must carry that
   identity and be read back through it. State cleared by an effect watching for
   staleness always commits the stale frame first.
3. **Is any state computed from props or from other state?** Derive it during
   render. If an effect exists only to keep two pieces of state agreeing, the
   effect is the bug.
4. **Are two booleans describing one lifecycle?** Count the combinations. If any
   is unreachable, or if a state you need cannot be expressed, it wants to be a
   union. Watch for the tell: branches that must be *ordered* to exclude a
   combination.
5. **Which dependency-list entries are freshly allocated?** An object or array
   built inline in JSX, or a `.map()` result, is a new identity every render. In
   a dependency list it makes the memo decoration. `exhaustive-deps` does not
   check this; it only checks that nothing is missing.
6. **Would this survive being run twice?** StrictMode double-renders and
   double-invokes effects. No writes to refs during render, every effect's
   cleanup fully undoing it, and no state initialiser with a side effect.

And one rule about where the answer goes: **a timing decision belongs in a
function, not in a component.** `adviceFor`, `previewCaption` and
`statusForGame` exist because the node suite cannot drive a re-render but can
test any function. A decision left inside a component is untestable here by
construction — which is the mechanism by which all eleven survived.

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

### House rules for unit tests

Five rules, each of which exists because the suite once broke it and stayed
green. The bugs behind them are in
[LESSONS-LEARNED.md](LESSONS-LEARNED.md#from-the-test-suite).

**No conditional in a test body.** A `for` with an `if` inside passes when the
filter matches nothing, and reports the same green as a test that asserted
something. Partition the data at module scope, drive `it.each` from each half,
and add one test asserting the halves are non-empty and account for everything.

```ts
// Not this — silently passes if no level is 'rated' any more.
for (const level of LEVELS) {
  if (level.strength.kind === 'rated') expect(level.strength.elo).toBeGreaterThan(0)
}

// This. An empty table is a failure, not a silence.
const RATED = LEVELS.flatMap((l) => (l.strength.kind === 'rated' ? [[l.id, l.strength.elo]] : []))
it('has levels of both kinds', () => expect(RATED.length).toBeGreaterThan(0))
it.each(RATED)('rates %s at or above the floor', (_id, elo) => expect(elo).toBeGreaterThan(0))
```

A narrowing guard in a *helper* is fine — `if (game === null) throw` at the top
of a fixture builder gives a better failure than a crash. The rule is about
branches that decide which assertions run.

**Assert the whole value.** `toEqual` on the object beats a field at a time: it
catches a stage that appeared, a field that vanished, and a shape that changed.
Asserting piecemeal also tends to need a type narrowing that the whole-object
form does not.

**`not.toBeNull()` is a type guard, not an assertion.** It is fine before a
block of real assertions. Where it is the last thing said about a value, name
what the value should be — "there is an assumed time control" is satisfied by
a blitz clock assumed for a 1927 adjournment game.

**Never compute the expectation with the code under test.** A test that replays
moves through the same rules engine to derive the FEN it compares against is
measuring self-consistency. Write the literal down.

**Probe before asserting, then mutate to check.** For an untested module, run
the real behaviour and read what it does before writing expectations — several
"obvious" ones here were wrong, including a `classical()` control that applies
its increment to both stages. Then break the source deliberately and confirm the
test fails. Cheap, and it is the only thing that finds an assertion which cannot
fail.

---

## See also

- [LESSONS-LEARNED.md](LESSONS-LEARNED.md) — the bugs behind most of the above,
  and the wrong explanation that looked right first in each case.
- [UI-ARCHITECTURE.md](UI-ARCHITECTURE.md) — what the layout check asserts, and
  why presence rather than pixels.
- [SUPPLY-CHAIN.md](SUPPLY-CHAIN.md) — what the gate enforces, and the lock file
  procedure any new dependency has to respect.
