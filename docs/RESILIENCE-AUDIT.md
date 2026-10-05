# The resilience sweep

The third audit, and a different kind from the first two. Those asked "where is
the code wrong about *when*?" and found fifteen defects. This one asked **"what
happens when something outside the code refuses to cooperate?"** — a screen that
throws, a data file that is malformed, a network that is gone — and found that
the app had no answer to three of them, plus one uncovered wiring path.

Four items. What each was, how it was found, what it was fixed with, and what
prevents regression. The last section answers the question that should be asked
of any third audit in a row: **why did the first two not find these?** The answer
is different from last time, and worth having precisely because it is different.

---

## 1. Any render throw blanked the entire app

**The bug.** There was no error boundary anywhere in the tree. React's contract
is unforgiving about that: an uncaught throw during render unmounts *everything*.
The result was a blank white page — no message, no navigation, no way out short
of reload, and nothing to tell the user their games were safe.

Every screen, any render-time cause. The app had survived so far because its
screens are defensive — but "no screen has thrown yet" and "a screen throwing is
survivable" are different properties, and only the second one is engineering.

**How found.** Not by the checklist being analysed — by a grep run to *verify* a
different recommendation. Assessing whether runtime validation was worth adding
meant asking "what actually happens today if `federations.ts` gets a malformed
file?", and the honest answer required checking for `componentDidCatch` first.
Zero hits. The validation question was downstream of a much bigger one nobody had
asked.

**The fix.** `ScreenErrorBoundary`, mounted in `App` *below* the shell — the rail
and title bar stay alive, so a broken screen leaves the user able to navigate
away rather than reload. Keyed by screen name, so a crash in one screen does not
leave the boundary tripped when the user moves to another. The fallback names the
error (the only clue available on a device nobody can attach a debugger to) and
says the thing that matters most in a local-first app: your saved games are on
this device and unaffected.

**Prevention.** Three jsdom tests, including the before/after one: a child that
throws renders an alert instead of nothing. The boundary cannot be tested
anywhere else — `renderToStaticMarkup` does not support boundaries at all, and no
browser script can make a healthy screen throw. Render-time failure injection is
exactly the failure suite's charter.

**The limit, stated.** A boundary catches render throws. Event handlers and
promises are not its job and never were — those are the `try`/`catch` and
`.catch` already on every async path, audited in the first two sweeps.

## 2. One fetched file was trusted on shape

**The bug.** `federations.ts` fetched `player-federations.json` and cast
`response.json()` straight to `Record<string, FideRecord>`. No check. The archive
then reads `.fed`, `.title`, `.elo` off each entry *while rendering rows* — so a
malformed file (a partial deploy, a bad build of the fetch script, not an
attacker; the file is same-origin and built by this repo) would take the archive
screen down at paint time. Which, before item 1, meant the blank page.

**How found.** By the oldest trick in this project's book: looking for the odd
one out. Both localStorage readers (`dailyPuzzle`, `puzzleStreak`) validate every
field by hand before trusting a parse. The one *fetched* input validated nothing.
When two of three sites follow a discipline, the third is where the bug is.

**The fix.** `validDirectory` — per-entry validation, keeping each well-formed
record and dropping each malformed one alone, so one truncated entry costs that
player a flag rather than everybody theirs. Hand-written, ~15 lines. The analysed
recommendation said "add Zod"; the right scope was three field checks matching
the discipline the codebase already had, not a schema library. (The
recommendation also aimed at the wrong target — it wanted validation on PGN
imports, which are free-form text with no schema to apply and already have a
size cap, move validation, and parameterised SQL.)

**Prevention.** Three unit tests: well-formed kept, one-bad-entry dropped alone,
not-an-object-at-all yields an empty directory.

## 3. The shell did not survive offline

**The bug — precisely, because the imprecise version misleads.** The app's
*data* already survived offline: games in SQLite on OPFS, engine and wasm served
same-origin, zero runtime network calls. What did not survive was the app
itself: no service worker meant a visit without a network got the browser's
offline page. For an app whose identity is "everything runs on this device",
that was the one gap between the claim and the experience.

**How found.** It was the single valid item in an external recommendations list
whose other seven items were already implemented, factually wrong about this
codebase, or would have lowered the rating. Credit where due: the list was
generic, but this item was real.

**The fix.** A hand-written service worker (~120 lines, zero dependencies) plus a
~40-line Vite plugin that compiles it and injects the hashed asset list the
worker cannot know before the build. The decisions, because they are the design:

- **Precache**: document, hashed JS/CSS, and the SQLite runtime (~1.3 MB).
  Without SQLite the app cannot open its own database — offline without it is
  not a smaller app but a broken one.
- **Cache on first use**: Stockfish (1.8 MB). Someone who only browses the
  archive never runs the engine; precaching it would nearly double the install
  for a feature they may not touch.
- **Never cache**: `/games/*.pgn` — read once, loaded into the database, dead
  bytes afterwards.
- **Network-first for the document, cache-first for hashed assets.** The
  document names the assets, so it must never be stale; the assets carry their
  hash in the name, so a hit is always correct.
- **No `skipWaiting`.** The database lock is per-tab; yanking a live game to
  activate an update is worse than waiting for the next load.
- **`/sw.js` ships `Cache-Control: no-cache` and its own CSP header** in
  `staticwebapp.config.json` — a cached worker pins users to old code, and a
  worker takes its CSP from its own response headers, which the page's `<meta>`
  tag never reaches. No Azure infrastructure changed: the worker is a static
  file, and the route rule lives in the repo.

**Two bugs found while building it**, recorded because both are the kind that
ships silently:

- **The `Vary: Origin` miss.** First offline run: worker active, cache full,
  document served — and every hashed asset failed with `ERR_FAILED`. Module
  scripts are requested with CORS metadata, the server answers with
  `Vary: Origin`, the precached copies were stored by `addAll` with no Origin
  header, and a spec-compliant cache match therefore rejects every one. The
  fix is `ignoreVary: true`, and it is load-bearing, not belt-and-braces. A
  service worker that registers cleanly and serves nothing offline is the
  canonical check-that-passes-while-wrong — which is why the offline check
  exists and asserts the *board renders*, not that the worker registered.
- **The build had no transpiler to borrow.** This Vite is rolldown-based and
  ships no esbuild; TypeScript 7's JS API no longer exposes `transpileModule`
  the old way. Resolution: `src/sw.ts` is written as plain JavaScript plus
  `declare` lines, and the plugin strips those — a stated contract, enforced
  loudly, because a violation would emit a file the browser refuses to parse
  and the offline check fails on it before any user sees it.

**Prevention.** `offline-check.mjs`, in the gate: prime the cache online, cut
the network, cold-reload, and assert 64 squares drawn and the setup screen
usable — plus the negative assertion that PGN data stayed *out* of the cache,
because a cache that quietly grows is the failure mode nobody reports.

## 4. No test watched the clock actually tick

**The gap.** `Clock` and `IntervalTicker` have thorough unit tests. Nothing
anywhere watched the wiring between them and the screen: a ticker that never
started, or a `ClockPanel` bound to the wrong field, would pass every unit test
and show a frozen clock to every player in every timed game.

**How found.** The external list recommended "E2E tests for clock countdown
triggers" — redundant as framework advice (Playwright was already here), but the
named scenario was genuinely uncovered. Narrowed from its implied scope: a real
flag-fall needs the shortest preset (1 minute) to run out, 60 seconds of CI for
one assertion that `Clock`'s unit tests already make. The uncovered part was the
cheap part — *does the display move*.

**The fix.** Two readings of the clock faces, 3 seconds apart, inside the
existing behaviour check — sharing the wait the board-stability assertion
already paid for, so the gate got no slower. Asserted on the pair changing, not
a particular face, because which side counts depends on who is to move.

---

## Why wasn't this flagged earlier?

The first two audits produced an honest answer to this question (self-review
re-reads intent; the suite was blind to the defect class). This sweep's answer is
different, and it is **not** "the taxonomies were wrong":

**The first two audits asked "is the code correct?" This one asked "is the
system resilient?" — and no amount of the first kind of looking finds the second
kind of gap.** All fifteen earlier defects were code that existed behaving
wrongly. All four of these are *absences*: no boundary, no validation at one
site, no offline story, no wiring test. An absence has no file to read, no diff
to review, and no line for a taxonomy question to land on. You find it only by
asking "what should exist here?" — which is a different question from "is what
exists here right?"

**The concrete lessons, each now structural:**

1. **Absences need their own sweep.** "Where does unvalidated data enter?"
   found item 2 in minutes once asked — it had simply never been asked, because
   every earlier question was about code that existed. The reviewing-for-timing
   checklist in TESTING.md gets a seventh question from this:
   *what is this screen's behaviour when its dependencies misbehave — and does
   anything define it?*
2. **Even a weak outside list is worth the hour it takes to verify.** Seven of
   eight recommendations were wrong *about this codebase* — three already done,
   two factually mistaken, one category error, one harmful. But the discipline
   of checking each claim against the code, rather than dismissing the list on
   its average quality, surfaced the error-boundary gap (found while refuting
   the Zod item) and confirmed the two real items. The pattern from the first
   audit holds at lower list quality than expected: the value is the outside
   frame, not the content.
3. **"It has never happened" is where the next bug lives.** The boundary gap
   survived three audits because no screen had ever thrown; the federations gap
   because no bad file had ever been deployed; the offline gap because nobody
   had opened the app on a plane. None of these is hypothetical — each is one
   bad deploy or one train journey from a user-facing failure with no
   diagnostics.

**And the honest caveat:** this document is still the implementer auditing the
implementer's work, with the directing maintainer as the outside frame — the
structural limit recorded in
[ARCHITECTURE-AND-REVIEW.md §8.12 O2](ARCHITECTURE-AND-REVIEW.md#o2--the-security-review-in-6-was-written-by-the-author-of-the-code)
applies to this sweep exactly as it applies to the previous two. Three audits by
the same eyes have now found nineteen defects; the strongest argument that a
fourth pair of eyes would find a twentieth is that record itself.

---

## What was deliberately not done

From the same analysed list, rejected with reasons (the full disposition is in
the session record; the standing decisions are these):

- **XState** — the game flow is already an explicit state machine (`LiveGame`'s
  turn loop, the `View` union), in the application layer, with zero third-party
  imports — a property `architecture.test.ts` enforces. A state-machine DSL
  would trade a tested 300-line loop for a dependency and spend that property.
- **WebRTC multiplayer** — not an improvement but a product pivot with a new
  threat model: it needs signalling and TURN infrastructure (ending the
  zero-backend model) and introduces a remote peer where the security posture
  rests on there being none.
- **Zod** — the right scope for this codebase's three untrusted inputs was
  hand-written field checks matching the two that already existed, not a schema
  library (§8.12 O1's dependency ledger applies).
- **Lazy-loading the archive data** — recommended against a premise that was
  false: the games were never in the bundle. They are static files fetched once
  and stored in SQLite.
- **Clock-state splitting for 60 FPS** — the correct fix for a problem not yet
  demonstrated. Measure first; the re-render is currently cheap because the
  board memo holds (REACT-TIMING-AUDIT #1). Restructuring state unmeasured is
  the box-ticking §8.11 exists to refuse.

## See also

- [REACT-TIMING-AUDIT.md](REACT-TIMING-AUDIT.md) — the first two sweeps:
  fifteen correctness defects and why review missed them.
- [TESTING.md § A third environment](TESTING.md#a-third-environment-for-failure-only)
  — where the boundary and validation tests live, and the rules for that suite.
- [ARCHITECTURE-AND-REVIEW.md §8.12](ARCHITECTURE-AND-REVIEW.md#812-deliberate-omissions-tooling-and-process)
  — the dependency ledger that decided hand-written over Workbox and Zod.
