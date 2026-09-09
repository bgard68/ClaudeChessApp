# Lessons learned

Bugs that were found, what actually caused them, and what each one changed.
Kept as a document rather than as commit messages because the useful part is
rarely the fix — it is the wrong explanation that looked right first.

Most of these came out of review rather than from a bug report, which is the
argument for having done the review.

---

# From the code

These came out of the review rather than from a bug report, which is the
argument for having done it.

## A real World Championship game was missing

`build-library` rejected any record with an empty move list, on the
reasonable-sounding grounds that a game which will not play out is not a game.
**Kramnik forfeited game 5 of the 2006 title match** — it stands in the record as
`0-1` with nothing played. The library silently dropped it.

Two fixes were needed, and the second is the subtle one:

1. `validate()` accepts zero moves when the result is decisive, so a forfeit
   survives while an empty stub with no result is still dropped.
2. `isSameGame()` had to stop treating an empty move list as a prefix of
   everything. The empty string is a prefix of every string, so the forfeit read
   as a *truncated copy* of the first game by the same players in the same year
   and was discarded even once validation let it through.

Title matches went 1,163 → 1,164. Corroborating evidence that the fix landed:
`world-championship-raw.pgn` used to contribute exactly one game that no
processed collection carried, and now contributes none.

## The dev server bound IPv6-only

Vite was left to choose its own bind address and listened on `[::1]` alone. A
browser resolving `localhost` to `127.0.0.1` got connection refused while the
server was up and answering over IPv6 — so `curl` from a shell reported success
while the browser could not load the page. Fixed with `--host`; `--strictPort`
was added at the same time so a busy port fails loudly instead of drifting to
the next one and serving a different app than the preview expects.

## The test suite was not hermetic

`bundledLibrary.test.ts` called `readdirSync` at import time against
`public/games/`, which is generated. A worktree that had not fetched assets
failed the whole file and reported a *broken* library rather than an absent one —
and blocked the new pre-commit hook for an environment reason rather than a code
one, which is how a gate teaches people to reach for `--no-verify`. Now a
declared `describe.skipIf`, so vitest lists the checks as skipped and the gap
stays visible.

## Tests that never ran, in a suite that reported green

The UI redesign shipped `AppIcon.test.tsx` and `ScreenHeader.test.tsx`. Neither
had ever executed. `vite.config.ts` declared
`include: ['src/**/*.test.ts']`, and a `.ts` glob does not match `.tsx`.

Nothing failed, which is the whole problem. A skipped test announces itself; an
*unmatched* one does not exist as far as the runner is concerned. The suite
passed, the count went up over time from other work, and two component tests sat
inert for their entire existence.

The wrong explanation that looks right: "the tests pass, so the components are
covered." The tell was arithmetic — merging a branch that adds two test files
left `Test Files 18 passed (18)` exactly where it had been. **Watch the file
count, not just the pass count, when a merge adds tests.** The pattern now reads
`['src/**/*.test.ts', 'src/**/*.test.tsx']`.

## A passing check cannot see something that is absent

The settings panel was missing from every phone. Not clipped or misplaced —
not rendered at all: no destinations, no choices, no Start game, and a page
exactly one screen tall because there was nothing left to scroll to.

Every check said the screen was fine. No horizontal overflow. No tap target
under 44px. No text under 12px. Nothing hidden behind the navigation bar. All
four were true, and all four were true *of a page missing its entire reason
for existing*, because each one asks "is anything here wrong?" and none asks
"is everything here?"

The cause was a shared class: the rail carried both `app-rail` and
`app-rail--right`, and below 860px `.app-rail` becomes the fixed bottom bar,
so the panel became a 72px strip pinned under the navigation. The mobile
override had reset the properties that looked wrong — width, padding,
background — and left position, inset and height to the bar rule.

What found it was walking the page top to bottom and reading what a user
actually scrolls past. **When a layout is reported as wrong and the
measurements come back clean, enumerate what should be on the page before
measuring what is.**

## Present, and a screen and a half below the point

The check written after that fault asked "is everything here?" and got yes on
every screen, correctly. Every screen was also unusable on a phone.

Measured at 393×727, where the navigation bar leaves about 650 points: setup
opened on a full-height board with every choice under it and Start game 1,100
points past the fold; the puzzle put Show hint at 1,400; the replay put the
transport at 1,100, driving a board that had scrolled off the top. Nothing was
missing. Nothing overflowed, nothing was under 44px, nothing hid behind the bar.
The screens had been laid out for a desktop and left to stack, and stacking
spends a phone screen in DOM order rather than in order of use.

Three of the causes were not layout decisions at all, which is why reading the
phone rules would not have found them. The replay screen borrows the play
screen's grid, whose first row is `minmax(120px, 1fr)` — a floor written for a
board column, handed to a one-line heading, which took 96 points and left them
empty. The setup screen reserved a viewport of content height for a settings
panel that on a phone sits below it rather than beside it, so the same scroll
was paid for twice. And `useMediaQuery` called `window.matchMedia` with no
guard, so the first component to ask whether it was on a phone took 29
`renderToStaticMarkup` tests down with it.

**Presence is the floor, not the bar. A check that asks whether everything is
on the page should also ask whether the thing you came for is on the first
screen of it.** `layout-check.mjs` now asserts that, and against two phones
rather than one: the boards are capped against the viewport height, so 393×727
is bounded by the height and 360×800 by the width. Sized against only the
second, the puzzle's hint button finished five points under the navigation bar
and every check still passed.

## Three leak guards, and a file none of them could see

`.claude/launch.json` sat in this repository's public history for its whole
life. Three guards were running: gitleaks over the full history in the gate,
GitHub secret scanning, and GitHub push protection. None said anything, and
all three were working correctly — every one of them looks for credential
*patterns*, and the file contained `npm run dev --port 5173`. There was nothing
to find. Nothing anywhere asked the other question: which paths is this
repository tracking at all?

Every step of how it got there looked right at the time:

1. **07-29** — the file is committed. `.gitignore` had no rule for it yet, so
   it was tracked like any other file. Correct.
2. **07-30 13:34** — the file is deleted, and `.claude/` added to `.gitignore`
   in the same minute, as part of a commit titled *"tighten the ignore rules
   for life with a remote"*. Deliberate, and five hours before the repository
   existed on GitHub.
3. **07-30 18:52** — first push. All four commits that carried the file go up
   with it.

The tip was clean when it was published, and the repository was exposed
anyway. **`git push` sends history, not the tip; deleting a file in a later
commit does not take it back out.** `CLAUDE.md` had said exactly that since
11:50 that morning. Only the delete half of the rule was done.

The second trap is quieter. **Adding a path to `.gitignore` never untracks a
file that is already tracked** — git keeps committing it until someone runs
`git rm --cached`. So the ignore rule at step 2 changed nothing about the file;
it only made the repository *disagree with itself*, and that disagreement is
something git will report on demand:

```
git ls-files --cached --ignored --exclude-standard
```

Tracked files the repository's own ignore rules now disown. It would have
printed `.claude/launch.json` at 13:34 on 07-30 — while the fix was still one
command and the repository was still private. `scripts/paths-check.mjs` asks
it, in the gate and in the pre-commit hook, alongside a denylist for the case
where nobody wrote the ignore rule at all.

**A scanner that looks for secrets cannot tell you about a file that is not
one.** The exposure here was a port number and was not worth rewriting history
over. The next one might not be.

## The hook was in the repository, and the hook that ran was somewhere else

Found while testing the check above: a deliberately forbidden path was staged,
`git commit` was run, and it committed. The hook had been updated to reject it
and the hook did not reject it.

`core.hooksPath` was set to an absolute path — `C:\ClaudeChessApp\.githooks`.
Every worktree therefore runs the *main checkout's* hooks rather than its own.
A hook edited on a branch does not take effect for the branch that edits it,
which is precisely when you most want it to: the commit that adds a guard is
the commit least protected by it.

The hook's own instructions say `git config core.hooksPath .githooks` —
relative, so each worktree resolves it against its own root. **Set it relative,
or a worktree is testing somebody else's gate.**

## One screen served two libraries and queried one

Splitting the archive into Championships and My games gave one component two
routes. The scope was passed as a prop, threaded into the query, and the two
screens showed identical results.

React was reusing the component across the routes, so no remount happened — and
`scope` was missing from the query effect's dependency list. The effect had
been written when there was only one library and nothing to depend on. Adding
the prop changed what the query *should* ask; it did not change when the query
*runs*.

The wrong explanation that looks right: "the prop is wrong, or the SQL is." Both
were correct. Nothing about the value was broken; the query holding the old one
had simply never been told to run again.

Fixed in two places, because either alone is fragile: `scope` is in the
dependency list, and the routes are keyed (`<ArchiveScreen key="mine" …>`) so
React remounts rather than reuses. **A prop added to a component with effects is
not wired until it is in the dependency array of every effect that reads it.**

## Paging that skipped the page it had just loaded

Caught during review of a refactor, before it merged, which is the only reason
it is a short entry.

Extracting the archive's query into a hook, the obvious way to write "load the
next page" is:

```js
offset: current.offset + current.limit
```

That is correct only while the limit is a page size. **Load all** sets the limit
to whatever remains — 2,947 — so the next offset lands thousands of rows past
the end and returns nothing. The list silently stops growing.

The original code paged from `games.length` instead, which is right regardless
of what the limit happens to be. The refactor was caught by reading the code it
replaced rather than by trusting that the new version looked reasonable.

**When rewriting something that works, read the original for the case you would
not have thought of.** The comment above the old handler did not explain this;
the `setLimit(PAGE_SIZE)` beside it was the only clue.

## Two name lookups, two different ways of destroying the same accent

The app matches player names against two ASCII tables: a hand-kept federation
list, and a fetched FIDE directory of 120 keys with no accented character in
any of them. PGN files are under no such discipline — the same player is
"Ljubojevic" in one collection and "Ljubojević" in another.

Both lookups handled the difference by throwing the accented letter away, and
each did it differently:

| | Did this | `Ljubojević` became |
| --- | --- | --- |
| `federationOf` | deleted it — `[^a-z, -]` → `''` | `ljubojevi` |
| `identityKey` | replaced it with a space — `[^a-z, ]` → `' '` | `ljubojevi` |

Neither matches `ljubojevic`, which is what both tables hold.

The first cost a flag. The second was worse and less visible: `identityKey`
decides which spellings are *the same person*, so an accented name was filed
apart from its own plain spelling — one player appearing as two rows in the
suggestions, each holding part of their games. The function was failing at the
one job it exists to do.

Neither was ever reported, and neither could have been: every game the app ships
spells names in ASCII, so nothing on screen was wrong. Only imported files —
which is precisely where diacritics arrive — would have shown it. It was found
by writing tests for a file that had none.

Both now fold through one `foldName`. NFD splits an accented letter into base
plus combining mark and the mark is dropped; a small table covers the letters
NFD cannot split, because **Ólafsson decomposes and Đurić does not**. A fold
built on `normalize('NFD')` alone looks complete and silently misses every
stroked letter — ø, đ, ł, ß, æ.

**Two functions normalising the same input in two different ways is a bug
waiting for the input that tells them apart.**

## A browser check that waited for the wrong signal, and passed

The first draft of `behaviour-check.mjs` asserted that searching narrows the
archive. It passed. It was wrong.

Typing into the search box restarts the paging immediately, but the query is
debounced, so the row count runs:

```
80  →  40 (the OLD question, back at page one)  →  23 (the new one)
```

The helper waited for the count to *change* and returned the 40. Every
assertion after it ran against the previous question's first page — and the
narrowing assertion passed, because 40 is genuinely fewer than 80.

It surfaced only because the *next* assertion — that a chip appears — failed,
and because that failure was instrumented rather than resolved with a longer
wait. Adding a sleep would have turned the whole sequence green while leaving
it meaningless.

The helper now waits for the count to stop changing across three polls.

**A browser check that goes green after a timing change deserves more suspicion
than one that goes red.** Red says the assertion or the app is wrong; green
after a sleep says only that something arrived, not that it was the thing you
meant.

## Upstream data defects

- **Gelfand–Gareev, World Blitz 2019** — `Invalid move in PGN: Qxe1`. Corrupt
  move text upstream. One game in 130,565.
- **The career fetchers write duplicates** — 9,601 of them, because per-player
  collections are concatenated and a game between two listed players arrives
  twice. This is **deliberate and documented**: `build-library` scores competing
  records and keeps the better one, so deduplicating at fetch time would discard
  that ability. Harmless to the app because `game_key` is unique; it only makes
  the "games added" count on import misleading.

## react-chessboard 4 → 5: the migration, and a two-day dead end

### What the API change required

Version 5 is a rewrite of the surface, not a version bump.

| v4 | v5 |
| --- | --- |
| individual props | one `options` object |
| `boardWidth={n}` | **removed** — sizes from its container |
| `arePiecesDraggable` | `allowDragging` |
| `onPieceDrop(from, to)` | `onPieceDrop({ piece, sourceSquare, targetSquare })` |
| `onSquareClick(square)` | `onSquareClick({ piece, square })` |
| `customSquareStyles` | `squareStyles` |
| `customBoardStyle` | `boardStyle` |
| `customDarkSquareStyle` | `darkSquareStyle` |
| `customLightSquareStyle` | `lightSquareStyle` |
| `animationDuration` | `animationDurationInMs` |
| `onPromotionCheck`, `onPromotionPieceSelect`, `showPromotionDialog`, `promotionToSquare` | **all removed** |

`targetSquare` is now nullable, because a piece can be dragged off the board.

The removed promotion API is the substantive work: the app has its own chooser,
built from `promotionChoices`, so it offers the pieces the rules actually allow
rather than a fixed four. It is centred over the board rather than pinned to the
promoting square, which is at the edge by definition — a popover there falls off
the board on the last file.

### The failure

The board rendered on the setup screen and rendered **nothing** in a game:
wrapper divs, no squares, no pieces, and no error anywhere. Same component, same
FEN, effectively identical options.

The cause is mount timing. Mounted in a commit *after* its screen's, while an
ancestor re-renders — which the play screen does on every clock tick — v5
produces an empty shell and never recovers.

Established by bisection on the live play screen, three boards side by side:

| Board | Result |
| --- | --- |
| bare, mounted with the screen | renders |
| full options, rebuilt every clock tick | renders |
| bare, mounted one `setTimeout` later | **empty** |

So **deferring the mount is the cause, not the cure.** The original wrapper gated
mounting behind a measured container size — which is exactly that late mount.
The board now mounts in the component's first commit and fills the area it was
given until the measured square lands a commit later.

### Remedies tried and ruled out

Recorded because several are the obvious things to reach for, and all of them
fail. The first attempt at this upgrade was abandoned entirely before the
bisection above found the real cause.

| Attempted | Outcome |
| --- | --- |
| Forcing the wrapper's height (`.board > div { height: 100% }`) | v5's wrapper was indeed collapsing to 0px; fixing it changed nothing. A symptom. |
| `allowDragging: false` | No change — not the drag machinery |
| Stripping options to `{ position }` | No change — not the options |
| Removing React `StrictMode` | No change — not double-mounting |
| Dispatching `resize`, and mutating the box | No change — it never re-measures |
| Memoising `options` so it is stable | Necessary, but not sufficient alone |
| **Deferring the mount** (`setTimeout`, 50 ms) | **Made it worse** — this is the fault itself |
| Deferring via double `requestAnimationFrame` | Not tried: it is the same late mount, one frame later |
| Forcing a remount with a changing `key` | Not tried: also remounts after the first commit |

The last two came from external advice suggesting the fix was to delay mounting
further. The bisection rules out that whole family — anything that moves the
mount later is the disease, so a different timer is not a cure. Recorded here so
the next person does not spend the afternoon on it.

The options are memoised regardless. Rebuilding them was proved harmless to
rendering, but there is no reason to make the library diff its entire
configuration several times a second because a clock is ticking.

### Verified, and not

Verified: the board renders on the setup screen and in a live game, the engine's
reply appears, click-to-move plays, and drag-and-drop works. Not verified: the
promotion chooser, which needs a game to reach a seventh-rank pawn.

---

# From the test suite

These came out of a test-quality pass on 2026-09-09 — reading the existing 498
tests against a standard rather than chasing a failure. Everything was green
before it started and green after; what changed is what the suite is capable of
noticing. The house rules they produced are in
[TESTING.md](TESTING.md#house-rules-for-unit-tests).

## A test that asserts nothing, and passes

`Difficulty.test.ts` had four tests shaped like this:

```ts
it('never asks the engine for a rating below its floor', () => {
  for (const level of DIFFICULTY_LEVELS) {
    if (level.configuration.strength.kind === 'rated') {
      expect(level.configuration.strength.elo).toBeGreaterThanOrEqual(MINIMUM_RATED_ELO)
    }
  }
})
```

Read it and it looks thorough. It iterates the real list, it filters to the
relevant case, it asserts the invariant. **It also passes when the filter matches
nothing** — and a test that runs zero assertions reports exactly the same green
as one that runs five.

That is not hypothetical. Mutating every level in `Difficulty.ts` from
`kind: 'rated'` to `kind: 'full'` — a change that breaks the rating floor, the
displayed rating, and the depth caps together — left this test *passing*, on its
own, with one test and zero assertions executed. The replacement table form
fails six.

The fix is not "add a length check" but to stop filtering inside the test body.
The list is partitioned once at module scope, each half becomes an `it.each`
table, and one guard asserts both halves are non-empty and together account for
every level. An empty table is then a failure rather than a silence.

The wrong explanation that looks right: "it loops over the real data, so it
covers the real cases." A loop covers the cases the data *currently* contains.
The `if` is where the coverage quietly went.

**A conditional inside a test body is a coverage hole with a green light on it.**
Partition the data outside the test and assert the partition is not empty.

**The trap that hid it:** it is invisible in a passing run, invisible in review,
and invisible in the pass count. Only mutating the source shows it — which is
why it survived a suite that was otherwise carefully written.

## Assertions that survive the bug they exist to catch

Three of the same family, all found by asking "if I broke this deliberately,
would the assertion fail?"

`AppIcon.test.tsx` looped 26 icons asserting each rendered `<svg`,
`aria-hidden` and `stroke="currentColor"`. Every one of those stays true if two
names render *the same glyph* — a duplicated `case` in the switch, which is easy
to introduce and invisible on review. Making `arrow-left` return the `check`
path passed the old test cleanly. The suite now compares the 26 rendered glyphs
against each other.

`ReplayClockModel.test.ts` asserted `expect(model.assumedControl).not.toBeNull()`
under the name "falls back to a simulation, and says so". A model that assumed a
five-minute blitz clock for a 1972 World Championship game satisfies that
perfectly. It now asserts the control it actually assumed.

`ReplaySession.test.ts` asserted `expect(session.state.clock).not.toBeUndefined()`
under "gives a reading for every position", checking one position. A clock frozen
at the starting budget passes. It now reads the numbers at three positions and
checks the right player was charged at each.

**`not.toBeNull()` is a type guard, not an assertion.** Where it is the only
thing standing between a test and the bug, assert the value.

## The splitter decided on a bracket, and PGN has two kinds

`splitPgnGames` ended a game wherever a line started with `[`, on the reasoning
that a tag section is where the next game begins. But movetext lines also start
with `[`: `[%clk 0:01:00]` is an annotation, and broadcast PGN wrapped at a fixed
column puts one at the start of a line routinely.

The result was a game torn in half on import, with the second fragment carrying
no tags, no players and no result — and nothing anywhere saying so. The library
simply gained a row that should not exist.

Found by writing edge cases for a module that had no tests of its own, and
probing what the code *actually did* with each one rather than what its comment
said it should. Fixed by matching the format's grammar instead of one character:

```ts
const TAG_PAIR_LINE = /^\s*\[[A-Za-z0-9_]+\s+"/
```

**When a parser makes a structural decision, match the grammar, not a prefix
character.** The bundled collections never triggered it, so the corpus test that
sweeps 2,987 real games had nothing to say — the shipped data is clean, and the
bug lives on the import path.

## A clock read as a move number

`summarise` counts moves by taking the highest move number in the movetext,
deliberately — it indexes thousands of games without a rules engine, and its own
comment calls it "close enough for a list column".

The approximation was fine. What was not fine is that it scanned comments too. A
sub-second clock reads as digits followed by a period:

```
1. e4 {[%clk 0:00:59.9]} e5 *   →   moveCount 59   (true: 1)
```

That is the shape Lichess and other broadcast sites export, so any imported
broadcast game reached the archive list claiming a wildly inflated length.

Two things are worth separating here. The first is the fix: strip `{...}` before
counting. The second is why nobody saw it — **the bundled collections carry no
clock comments at all**, so every fixture, every corpus sweep and every existing
test used data that could not express the bug. Measuring it confirmed the shape
of the blind spot: 0 of 272 sampled shipped games disagree with their true move
count, and the corpus contains zero `TimeControl` tags.

**Fixtures drawn from what ships cannot test what users import.** Where a code
path exists to consume foreign data, at least one test has to use data shaped
like the foreign data.

## A test that recomputes the answer with the code under test

`PuzzleGenerator.test.ts` checked the offered puzzle position by replaying the
moves itself — through the same `ChessJsRules` instance the generator uses, over
the same move list — and comparing FENs.

Two computations that share an engine and an input agree by construction. A
transposition in the rules would have moved both sides of the comparison
together. The expected FEN is now written down as a literal.

**A test that derives its expectation from production code is measuring
self-consistency, not correctness.** Write the expected value down, even when
that means pasting a 56-character FEN.

---

# From the build and the repository

These came out of a security pass on 2026-07-30, and a dependency pass on
2026-09-09. The controls they produced are described in
[SUPPLY-CHAIN.md](SUPPLY-CHAIN.md); what they *taught* is here.

## npm prunes the lock file to one platform

The deploy died on `@rolldown/binding-linux-x64-gnu` and
`@typescript/typescript-linux-x64`. The diagnosis reached for was
`npm/cli#4828` — "a lock written on Windows omits other platforms' bindings" —
and the fix applied was to delete the lock in CI and re-resolve from
`package.json`.

That worked, and it cost more than it looked. Re-resolving meant the deployed
build contained whatever npm picked at that second rather than the tree anyone
had reviewed, which is a supply-chain hole opened to close a build error.

The real behaviour is narrower than the issue title suggests. **npm prunes
optional dependencies to the current platform when it writes a lock from an
installed tree — not when it resolves one.** Regenerate with
`--package-lock-only` and no `node_modules` present and every platform
survives: 115 packages instead of 66, with 20 Linux entries. `npm ci` then works
on Windows and on the runner.

The lesson is not about npm. A workaround that removes a safety property should
be treated as a temporary diagnosis, not a resolution — and "it works now" is
the point at which the underlying cause stops being investigated.

**The trap that hid it:** the failure is invisible from Windows. The lock looks
fine, `npm ci` succeeds locally, `npm run verify` passes, and only the Linux
deploy fails.

## A stale or missing install fails as a type error somewhere else

The same error appeared twice in one day, from two different causes, and both
times it named a file that had nothing to do with the change:

```
ChessBoardView.tsx:201 - error TS2322:
  Property 'options' does not exist on type ... ChessboardProps
```

It reads as a regression in the react-chessboard 5 migration. It never was. In
both cases the installed library was **4.7.3** while `package.json` asked for
`^5.10.0`, and `options` is the prop v5 introduced. The source was correct; the
packages on disk were not.

| Cause | What made it silent |
| --- | --- |
| A fresh worktree with no `node_modules` | TypeScript walks *up* the directory tree and resolves against the parent checkout's install. Nothing reports a missing dependency, because one was found. |
| A pull that changed the lock, without reinstalling | `node_modules` still exists and looks fine. npm does not notice it is behind until asked. |

CI was green throughout both, because CI installs from the lock every run. That
is the tell: **a failure your machine has and CI does not is usually the
install, not the code.**

The rule this produces:

> When a typecheck fails in a file your changes never touched, run `npm ci`
> before reading the error.

And run it after every pull that touched `package-lock.json`, and once in every
new worktree before trusting any gate result.

## Load order was the design, not an accident to be corrected

Four stylesheets loaded in an order nobody chose: `main.tsx` imported `App` —
and the phase sheets through it — before the base, so the base loaded last and
won every tie at equal specificity. That looked like a bug worth fixing, and
the 37 `!important` declarations in phase4-6.css looked like the evidence.

Fixing it was attempted twice and reverted twice.

Swapping the imports worked, and changed what the board measures at mount: the
replay board came back 314x490 against a 314x314 area. Reordering the sections
after the four sheets were merged into one avoided mount timing entirely, and
broke the right rail instead — `.app-rail--right` sets 366px in the base
section, phase4-6's `.app-rail` sets 224px, equal specificity, and the phase
now came second. The rails overlapped and the navigation stopped responding.

An exact-selector scan found 28 base declarations that a later section also
sets. The fault that actually broke it was not among them: it was a shorter
selector beating a longer-looking one, which no static scan enumerates.

**A cascade that has been compensated for is not the same as one that is
wrong.** Hundreds of rules were written, knowingly or not, against the order
that existed. Correcting the order does not correct them — it inverts them, and
the ones that matter are only findable by running the application. Merging the
files was worth doing and delivered the real benefit: one place to look. The
order stays as it was, documented, with the nine `!important` it costs.

## A branch cut before a squash merge cannot be merged, only replayed

`feat/archive-split` was branched from `main` before the previous PR merged,
so it carried that PR's seven commits as well as its own. Those seven had
landed on `main` as one squashed commit with a different hash, and git has no
way to know they are the same work: four files conflicted, and GitHub would
not even run the checks on a PR it considered dirty.

Merging did not fix it and rebasing the whole branch would have replayed seven
commits that were already in. The fix was to cherry-pick the one commit that
was genuinely new onto current `main`, which applied cleanly.

This is the standing cost of squash merging — a tidy history on `main`, paid
for by every branch cut before the squash. **Branch from current `main`, and
when a branch predates a squash, replay the new commits rather than merging
the branch.**

## A required review that nobody can give

Branch protection required one approving review. GitHub does not let an author
approve their own pull request, and this repository has one maintainer — so
every pull request was permanently unmergeable, and the only way to land
anything was the admin bypass.

The setting looked like protection and functioned as an exception generator:
every merge became a bypass, which destroys the signal that a bypass was ever
used. It now requires zero approvals and two passing checks instead. The gate is
the reviewer.

A control that can only be satisfied by circumventing it is worse than no
control, because it also teaches everyone to reach for the circumvention.

## The leak scanner's own test was a leak

The gate includes a probe that plants a fake credential and asserts gitleaks
rejects it. Written the obvious way — a literal token in the script — it made
the script itself a finding, which the pre-publish history scan duly caught.

The probe now generates the token at run time. Two details were learned the hard
way and are worth keeping: it is shaped like a GitHub PAT rather than an AWS
key, because current gitleaks allowlists AWS's documented example key and has no
rule for bare AWS key ids at all.

## Piping a download into tar cannot verify it

`curl ... | sudo tar -xz` was how gitleaks was installed. There is no point in
the pipeline at which a checksum could be computed: the archive is unpacked as
it arrives, so by the time you could hash it the binary is already root-owned on
`PATH`. In the deploy workflow, that job goes on to hold the Azure token.

Download, verify, then extract — in that order. The shape matters more than the
specific tool; any `curl | sh` has the same property.

## A clean working tree is not a current one

`git status` reported clean, `git log` showed a coherent recent history, and
work began from it. The branch was seventeen commits behind `origin/main`,
which had moved on through a batch of Dependabot merges while this checkout sat
untouched.

Nothing about the local state said so. A stale checkout and a current one are
identical to look at: both clean, both with a plausible log, both passing their
own tests. The tell only appears on push, and by then the work is done.

What it cost here was an entire dependency repair. `npm audit` reported three
advisories, they were real *in that checkout*, and clearing them took the
detour recorded below — the Arborist crash, the deleted lock, the recovery from
backup. `origin/main` had fixed both packages days earlier, in
`fix(deps): take the nanoid patch that is failing the audit gate (#44)` and a
Dependabot bump. The commit that came out of it was not merely redundant: it
would have *downgraded* vite 8.2.2 to 8.1.5, taking main backwards to make a
solved problem look solved.

The wrong explanation that looks right: "the tree is clean, so I am on a good
base." Clean describes the diff against your own HEAD. It says nothing about
where HEAD is.

**Fetch before branching, not before pushing.** `git fetch && git status` costs
a second and is the only thing that distinguishes the two states. Where a
report drives the work — an audit, a coverage number, a failing test — confirm
it against the base you are about to build on rather than the one you happen to
have.

## npm cannot rebuild this lock from scratch

The advisories behind this were already fixed upstream — see above — but the
npm behaviour found while chasing them is real and will be met again by anyone
changing a dependency here.

Clearing them should have been `npm audit fix`. It was not. Every route that
makes npm resolve this tree cold dies the same way:

```
npm error Cannot read properties of null (reading 'edgesOut')
    at #loadPeerSet (@npmcli/arborist/lib/arborist/build-ideal-tree.js:1314)
```

The unfinished timer names the culprit — `idealTree:node_modules/vitest` —
and vitest declares a large optional peer set. `npm audit fix`, `npm update`
and a from-scratch `npm install --package-lock-only` all crash. npm 10, 11 and
12 all crash. What survives is the narrow case where an existing lock is present
and only named packages move:

```bash
npm update <package> --package-lock-only    # node_modules moved aside first
```

The mistake worth not repeating: partway through, the lock was deleted to force
a clean regenerate — and npm then could not rebuild it. It came back from a
backup taken minutes earlier, byte-identical, but that was luck standing in for
method. **Test a destructive recovery on a copy before running it on the
original**, particularly when the thing being repaired is what the deploy
installs from.

Because this is exactly the situation [npm prunes the lock file to one
platform](#npm-prunes-the-lock-file-to-one-platform) warns about, the signature
was measured before and after rather than assumed. The total package count
drifts as dependencies come and go, so the number to record is not the total but
the spread: **every platform family present in all three of linux, win32 and
darwin — currently 20 Linux, 6 win32, 7 darwin.** A repair that ends with those
gone has produced a Windows-only lock, and the deploy fails on the runner:

```bash
node -e "const p=require('./package-lock.json').packages,o={};
  for(const n of Object.keys(p)) for(const s of (p[n].os||[])) o[s]=(o[s]||0)+1;
  console.log(o)"
```

### npm 12 blocks install scripts by default

Upgrading to npm 12 surfaced a warning rather than a failure: `stockfish`'s
postinstall was skipped. Harmless here — it only symlinks `stockfish.js` and
`stockfish.wasm`, and `copy-engine.mjs` reads the versioned
`stockfish-18-lite-single` files directly — but that was confirmed with a real
`npm run build`, not assumed. A future dependency that genuinely needs its
postinstall will fail quietly until someone reads the warning.

### What was nearly concluded, and was wrong

npm 12 reported "audited 73 packages, found 0 vulnerabilities" where npm 11 had
reported the full tree and three advisories. The obvious reading — npm 12
narrowed its audit scope and stopped checking dev dependencies — was wrong, and
would have produced a pointless `--include=dev` in the verify gate. npm 12
audits everything (`prod:13, dev:103, optional:52`). It reported zero because it
had just *fixed* them, and the smaller figure was the tree it built for that one
operation rather than an audit scope.

**Two numbers changing at once is not evidence about either one.** The check
that settled it was asking npm directly for its dependency breakdown, which took
one command and replaced a plausible story with a fact.
