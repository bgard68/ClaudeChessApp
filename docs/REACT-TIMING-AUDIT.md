# The React timing audit

Eleven defects in the presentation layer, all of one kind: code that is correct
on the first render and wrong on a later one. What each was, how it was found,
what it was fixed with, and what now stops it coming back.

The last section is the uncomfortable one, and the reason this document exists
rather than a commit message: **why a careful review of this code, repeatedly,
did not find any of them — and an outside checklist found all eleven in an
afternoon.**

---

## Contents

- [What was wrong, and what it is now](#what-was-wrong-and-what-it-is-now)
  - [1. The board's memo was invalidated ten times a second](#1-the-boards-memo-was-invalidated-ten-times-a-second)
  - [2. A resolved archive load could hijack the screen](#2-a-resolved-archive-load-could-hijack-the-screen)
  - [3. Puzzle progress froze at "Warming up…"](#3-puzzle-progress-froze-at-warming-up)
  - [4. Two imports shared one progress line](#4-two-imports-shared-one-progress-line)
  - [5. The hint arrow outlived its position by one frame](#5-the-hint-arrow-outlived-its-position-by-one-frame)
  - [6. A hint that arrived too late said nothing at all](#6-a-hint-that-arrived-too-late-said-nothing-at-all)
  - [7. A selected square outlived the piece on it](#7-a-selected-square-outlived-the-piece-on-it)
  - [8. The selection reset ran a frame late, on every page](#8-the-selection-reset-ran-a-frame-late-on-every-page)
  - [9. A failed preview load said "Loading" forever](#9-a-failed-preview-load-said-loading-forever)
  - [10. Save stayed disabled for the rest of the game](#10-save-stayed-disabled-for-the-rest-of-the-game)
  - [11. Retry started work it could not call back](#11-retry-started-work-it-could-not-call-back)
  - [Two smaller ones, swept with the rest](#two-smaller-ones-swept-with-the-rest)
- [How they were found](#how-they-were-found)
- [The four patterns the fixes use](#the-four-patterns-the-fixes-use)
- [What now prevents them](#what-now-prevents-them)
- [Why review did not find these](#why-review-did-not-find-these)

---

## What was wrong, and what it is now

Ordered by how much a user would notice. Severity is about the shipped app, not
about how interesting the cause is.

### 1. The board's memo was invalidated ten times a second

**Where** `ChessBoardView.tsx`, with the cause in `PlayScreen.tsx`.

`boardOptions` is memoised, and the twelve-line comment above it explains
exactly why that matters: react-chessboard 5 treats a new options object as a
reconfiguration, and reconfiguring it under re-render load is what produced the
empty board documented in
[LESSONS-LEARNED § react-chessboard 4 → 5](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end).
Two days went into finding that.

The memo listed `lastMove` and `hint` as dependencies. Both are objects their
callers build inline in JSX:

```tsx
lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
```

That is a new object on every render of the play screen, and the play screen
re-renders on every clock tick — `CLOCK_TICK_MS` is 100. So the memo was
invalidated ten times a second and rebuilt a fresh options object each time.
It was not memoising anything.

**Be precise about the consequence:** the board does still draw today. What
saves it is the *other* half of that investigation — the rule that the board
mounts in its screen's first commit and is never gated on measurement. The memo
was the second line of defence, it was holding nothing, and nobody knew because
the comment asserting it works was never checked against the dependency list.
This was a disarmed safety net, not a visible bug.

**Fixed** by unpacking the objects to squares before the memo and depending on
those. Squares are strings; equal squares are equal dependencies however many
objects were allocated to carry them. Fixing it inside the component repairs all
three call sites at once, and keeps the hazard next to the comment that explains
it. `NO_MOVES` was added for the same reason — two screens passed
`legalMoves={[]}`, a fresh array per render, into the same dependency list.

### 2. A resolved archive load could hijack the screen

**Where** `App.tsx`, `openArchivedGame`.

Loading an archived game is async and had no guard. Click a game and then reach
for the sidebar, and when the load resolved it navigated you into the game you
had abandoned. Click two games quickly and you got whichever answered last
rather than the one you asked for second.

Every other async site in the app already used a `cancelled` flag. This one was
missed — and a per-request flag would not have been the right fix anyway, because
the thing that cancels this request is *any* later navigation from anywhere, not
just the next call to this one function.

**Fixed** with a navigation counter owned by `goTo`, bumped on every
navigation. Async work captures the count it started with and stands down if it
no longer matches. Checked *before* the replay session is constructed, so a
session is never built for a screen nobody is waiting for.

### 3. Puzzle progress froze at "Warming up…"

**Where** `dailyPuzzle.ts` and `PuzzleScreen.tsx`.

`todaysPuzzle` shares an in-flight generation so a second caller joins rather
than starting a second Stockfish — deliberate, and it worked. But progress was
reported into a callback belonging to *the caller that started it*, and under
StrictMode that caller is the mount React throws away. The surviving mount
joined the promise and heard nothing.

Generating the day's puzzle takes about twelve seconds. For that entire time the
screen said "Warming up…" — every single time in development, and in production
for anyone who left the puzzle screen and came back while it was still
composing. The progress callback exists precisely so that wait does not look
like a hang, and it was dead in the common case.

**Fixed** by moving ownership of progress to the module that owns the
generation: a listener set, fanned out to everyone waiting, with the last
reported ply replayed to a joiner the moment it arrives — because the next ply
can be a second away and starting from nothing is the same bug in miniature.

**Deliberately not fixed:** the generation is still not cancellable. Nothing
can stop it once started — `PuzzleGenerator` exposes no `dispose`, and the
`cancelled` flags suppress the *result*, not the *work*. That is the right
behaviour here and the reasoning is worth recording: this is one puzzle per
device per day, cached in `localStorage` the moment it completes. Abandoning a
generation because a screen unmounted would throw away ten seconds of engine
work that the next visit would have to redo from scratch. Letting it finish is
cheaper for the user than cancelling it. A cancellation protocol threaded
through three layers to stop work we want completed would be ceremony. The cost
is bounded — one worker, at most the length of one generation — and it is a real
cost if a game is started at the same moment, so it is written down here rather
than left to be rediscovered.

### 4. Two imports shared one progress line

**Where** `ArchiveScreen.tsx`, `importFile`.

The **Import PGN…** menu item was never disabled while an import was running,
and `importFile` had no re-entry guard. Starting a second import while a large
one was in flight gave two runs writing the same `importing` state, and whichever
finished first ran `setImporting(null)` — clearing the progress line while the
other was still going. Collections run to a hundred thousand games; that
progress line is the only thing between a long import and a tab that looks hung.

**Fixed** with both a `disabled` on the control and an early return in
`importFile`. The guard is the invariant and does not depend on the control
staying wired to it; the `disabled` is what tells the user why nothing happened.

### 5. The hint arrow outlived its position by one frame

**Where** `PlayScreen.tsx`.

```tsx
useEffect(() => setHint(null), [fen, gameOver])
```

Effects run after the commit, so the render in which the position changed still
had the old hint in state and drew the previous position's arrow over the new
board. One committed frame, then corrected.

**Fixed** by not storing anything that needs clearing. The hint now carries the
FEN it was computed for, and a single function decides whether it applies to the
position on the board. Advice about a position that has been played out of is
not stale state to be cleaned up — it simply is not advice about this position.

### 6. A hint that arrived too late said nothing at all

**Where** `PlayScreen.tsx`.

Ask for a hint, then move or undo before the engine answers. The guard
discarded the answer correctly — and then the Hint button stopped saying
"Thinking…", no arrow appeared, and nothing explained why. The states could not
express "answered, but about a position you have left", so there was nothing to
say.

Same root as the boolean-flag problem: `isAdvising` beside a nullable `hint`
made four combinations of which only three were reachable, and the unreachable
one — thinking, with a hint already drawn — was excluded by *ordering the
branches* of the status line rather than by being impossible to represent.

**Fixed** with one `Advice` union: `none | thinking | ready | stale | failed`,
every variant stamped with its FEN. `stale` is stamped with the position the
player is now looking at, so the message appears where it makes sense and clears
when they move on. A side effect of the union: every exit path from the search
sets a terminal state, so the "thinking" flag can no longer be left on by a path
that forgot to clear it.

### 7. A selected square outlived the piece on it

**Where** `ChessBoardView.tsx`.

The selected square was local state with nothing resetting it when `fen`
changed. Select a piece, then undo: the board got a new position and a new
legal-move list, the selection persisted, and a square was painted blue with no
destination dots under it because nothing could move from there any more.

The promotion dialog had the same exposure and got away with it by accident —
`promotionChoices` returns empty for a position where the promotion is no longer
legal, so it hid itself.

**Fixed** by stamping both with the FEN they were made in and reading them back
only for that FEN. The promotion dialog no longer depends on the coincidence.

### 8. The selection reset ran a frame late, on every page

**Where** `ArchiveScreen.tsx`.

An effect watched `[games, selectedId]` and cleared the selection when a
narrowed list no longer contained it. Two costs: the effect committed one frame
with the dead id still live — long enough to ask the library to load a game that
was no longer on screen — and it re-ran on every page of results, because
`games` is a new array each time more are appended.

**Fixed** by reading the selection back through the list.
`games.find(…) ?? null` was *already* computed twenty lines further down for
rendering; the effect was maintaining a second, slower answer to a question the
screen had already answered.

### 9. A failed preview load said "Loading" forever

**Where** `ArchiveScreen.tsx`, `GamePreview`.

The preview held one nullable `ArchivedGame`, so "still loading" and "could not
be loaded" were the same value. A failed load left "Loading the game…" under a
starting-position board indefinitely, which reads as a slow answer rather than
no answer.

**Fixed** with a `Preview` union — `idle | loading | ready | failed` — stamped
with the id it describes, and `previewCaption` as a pure function over it.

### 10. Save stayed disabled for the rest of the game

**Where** `PlayScreen.tsx`.

`saveState` reached `'saved'` and stayed there. The button is disabled on
`'saved'`, so a game saved at move 20 and played on to move 40 could not be
saved again — the second half of the game had no way into the library.

**Fixed** by stamping the save with the ply it covers. The button re-arms itself
the moment there is something new to save. Same pattern as the hint and the
selection: state that describes a moment carries the moment it describes.

### 11. Retry started work it could not call back

**Where** `PuzzleScreen.tsx`.

`load()` returns a cleanup function. The effect used it; the **Try again**
button called `load()` and dropped it, leaving that generation's `cancelled`
flag unreachable — nothing could tell it the screen had gone.

**Fixed** by making the effect the only thing that ever starts a generation.
Retry bumps a counter the effect depends on, so the cleanup always belongs to
the call it came from. A function that returns a cleanup nobody holds is a trap;
removing the second call site removes the trap.

### Two smaller ones, swept with the rest

**Refs written during render.** `PlayScreen` and `ChessBoardView` both assigned
to `ref.current` in the render body. Both writes were idempotent, so both
survived StrictMode's double render — but a discarded render publishing a value
describing a tree that never committed is luck, not correctness. Both now write
in an effect, which still runs before any click can arrive.

**Work repeated every render.** `PuzzleScreen` re-parsed the puzzle's FEN and
re-ran `legalMoves` on every render for values that change only when the puzzle
or the position does. Both memoised — which also stops `legalMoves` handing the
board a fresh array, feeding finding 1.

---

## How they were found

Not by reading the code and looking for mistakes. That had been done, more than
once, and found none of these.

They were found by taking a **taxonomy of React timing failures** — six
categories: out-of-order fetches, stale closures, derived-state syncs, boolean
flag explosions, batching and closures, StrictMode purity — and sweeping the
whole presentation layer for instances of each. Five screens, eight components,
seven hooks, one category at a time.

The difference is the direction of the search. "Is this code right?" relies on
something looking wrong, and none of this looked wrong — every one of the eleven
is idiomatic React that a reviewer nods at. "Where in this codebase does an
async callback write state?" is a search with an answer you can enumerate and
check off, and it does not care whether the code looks fine.

Two findings came from following the taxonomy past where it pointed. The memo
one (1) came from asking the checklist's dependency question of a memo whose
comment already said it was handled. The progress one (3) came from reading
`dailyPuzzle.ts` to confirm a *suspected* StrictMode double-worker bug, finding
it already correctly handled, and noticing that the mechanism handling it had a
hole of its own. Both are cases where the honest answer to the checklist's
question was not the one the code claimed.

Six candidates were investigated and **cleared**, which matters as much as the
findings: `useArchiveQuery`'s paging is genuinely single-flight; the
`accumulatePages` append is safe because the effect's dependencies are
primitives; rapid clicks in `tryMove` are safe because React flushes discrete
events synchronously; `saveGame` was already guarded; `boardThemes` already
caches for identity; and everything reached through `useObservableStore` is
structurally immune, which is why `ReplayScreen` appears nowhere above.

---

## The four patterns the fixes use

The eleven fixes are four ideas. Worth naming, because the next instance of this
class will be fixed with one of them.

**1. Stamp state with the moment it describes, then derive.** Findings 5, 7, 8,
9, 10. A hint belongs to a position; a selection belongs to a list; a save
belongs to a ply; a preview belongs to a row. Carry the identity and read it
back — `advice.fen === fen` — rather than storing a bare value and racing an
effect to clear it when it goes bad. State that cannot be stale does not need
clearing, and an effect that clears state always commits the bad frame first.

**2. One owner per async lifecycle.** Findings 2, 11. Either the effect owns
starting and cancelling the work, or a single counter decides which attempt is
current. Two call sites starting the same work, one of them unable to cancel it,
is how finding 11 happened; a per-request flag that cannot see navigation from
elsewhere is how finding 2 survived.

**3. Make unreachable states unrepresentable.** Findings 6, 9. Two booleans
describing one lifecycle will produce a combination you then have to exclude by
convention — and will lack a state you need, which is the worse half. A
discriminated union gets both right, and gets exhaustiveness checking for free.

**4. Primitives in dependency lists.** Finding 1. An object or array built
inline in JSX is a new identity every render. If it reaches a dependency list,
that memo is decoration. Depend on the strings inside it.

What was *not* done, deliberately: no new abstraction layer, no port, no
cancellation protocol, no library. Nine of the eleven fixes made their file
smaller or left it the same size, because most of them deleted an effect or a
second variable rather than adding machinery. The one new concept —
`todaysPuzzle`'s listener set — earns its place because it resolves a genuine
conflict of lifetimes between a module-level cache and a component.

---

## What now prevents them

**Three pure functions, sixteen tests.** `adviceFor`, `statusForGame`,
`previewCaption`, plus four tests on `todaysPuzzle`'s progress fan-out. Every
timing decision above is now a function over values, tested in the node suite.
This is the structural prevention and the reason it works is in the next
section: the unit suite cannot observe a second render, so any decision left
*inside* a component is untestable by construction. Moving the decision out is
what makes it visible.

A jsdom failure suite was added afterwards — two files, failure injection only,
documented at [TESTING.md § A third environment](TESTING.md#a-third-environment-for-failure-only).
It closes the *other* half of the hole: what a screen says when a dependency
refuses. It does not supersede the rule above. Pulling the decision into a
function is still the first move, because a pure function is cheaper to test, is
exhaustively checkable, and cannot be defeated by an environment that lacks a
layout engine — as one of those tests discovered when it could not drive the
preview caption at all.

The four `todaysPuzzle` tests were checked against the old implementation and
**all four fail on it**. That check is not optional in this repository — see
[LESSONS-LEARNED § Assertions that survive the bug they exist to catch](LESSONS-LEARNED.md#assertions-that-survive-the-bug-they-exist-to-catch).

**One browser check.** `behaviour-check.mjs` now asserts the board still has 64
squares and drawn pieces after the clock has run for three seconds. This is an
honest guard on the *symptom* of finding 1 — the empty board that cost two days
— and a weak one on its cause, because whether react-chessboard reconfigures
internally cannot be observed from outside it. Said plainly here so nobody reads
it as more than it is.

**Types, where a type can carry it.** The memo in `ChessBoardView` now depends
on `Square | null` values. You cannot accidentally pass a freshly allocated
object as a string. That is better than a test, because it fails at the point of
the mistake.

**The checklist, in the repository.** The taxonomy that found these is in
[TESTING.md § Reviewing for timing](TESTING.md#reviewing-for-timing) as six
questions to ask of any change to `src/presentation/`. It found eleven defects
the first time it was run against this code. It should be run, not remembered.

**What was considered and skipped:** ESLint with `react-hooks`. The repository
has no ESLint, and adding it would not have caught a single one of these —
`exhaustive-deps` checks that dependency lists are *complete*, and every list
here was already complete and correct. Finding 1's list was exhaustive; the
problem was that two of its entries were freshly allocated on every render,
which that rule does not examine. A large toolchain addition that scores zero
against the class it would be added for is not worth it. If ESLint arrives later
for other reasons, that is fine — it is just not prevention for this.

---

## The second sweep: the layers below the screens

The first sweep covered `src/presentation/` against six React timing categories.
That left an obvious hole in the claim: *one layer, one taxonomy*. A second sweep
took `infrastructure` and `application` against a different list — resource
lifecycles, request/response correlation, cancellation semantics, and what happens
when a dependency never answers.

It found **two bugs, both severe, both in code that had no tests at all** because
`TESTING.md` had classified it as needing a real browser. That classification
conflated two different things: Stockfish and SQLite do need a browser; the
*protocol handling* wrapped around them does not. A fake worker is enough, and the
protocol handling is where the ordering rules live.

### A superseded engine search could lose you the game

`stop` does not cancel a UCI search — it hurries it. One `go` produces exactly one
`bestmove`, wanted or not, and nothing distinguished an abandoned search's answer
from the current one's. `handleLine` resolved whatever was in `this.search`.

**Undo while the computer is thinking** and `LiveGame`'s turn loop abandons that
search and starts another. The abandoned one then answers first, and the new search
adopts a move computed for the position *before* the undo. If that move happens to
be legal in the new position it is simply played, wrongly. If it is not,
`applyMove` rejects it — and `LiveGame` treats an engine proposing an illegal move
as a malfunction and **forfeits the game on the engine's behalf.**

Taking a move back could therefore lose the game outright. It is the most severe
defect found in this project to date, and it sat behind `undo`, which is not an
exotic thing to press.

Fixed by counting the answers the engine still owes for searches nobody wants, and
discarding exactly that many. The count can only rise when an answer really is
outstanding — reaching that line requires an unconsumed `go` — so it can never
strand the search that was actually wanted. Both halves are tested, including the
over-count case that would hang.

### A database worker that failed to start hung every query forever

`SqliteClient` correlates replies to requests by id and does it correctly. It had
no `onerror`. A worker that fails to construct or parse never posts a message, and
`send` resolves only from `onmessage` — so every request stayed pending for the
life of the page. Nothing timed out, nothing rejected.

The symptom is the worst available: the archive screen sets `isLoading` and waits
on those promises, so a total database failure presented as a library that was
**still searching**, permanently, with no error, no empty state and nothing to
retry. `StockfishEngine` handled this correctly on the next file over, which is
how the gap survived — the pattern existed, it just was not applied here.

Failure is terminal rather than retried, deliberately: an errored `Worker` cannot
be restarted, only replaced, and this client owns one for the session. Every later
call now rejects at once, which turns a hang into a message.

### What the sweep says about method

Both bugs are the same shape as the first eleven — correct logic, wrong about
*when* — and both were found the same way: by asking a category's question of
every file that could answer it, rather than by reading for mistakes. Neither is
visible in a diff. Neither would be caught by any linter.

And both were in the two files that the test documentation had written off. That is
worth more than the bugs: **a documented coverage gap is a place to look first, not
a place that has been accounted for.** The classification was half right, which is
the most dangerous kind, because it reads as a decision.

A third finding came out of writing the tests rather than the sweep: three
assertions in a new jsdom file passed while testing the previous test's DOM,
because Testing Library's automatic cleanup does not register when the test globals
are not injected. Caught by the tests failing when the fix made them meaningful —
which is the only reason to check that a new test fails against the old code.

---

## Why review did not find these

The honest answer, in order of how much each actually mattered.

### The reviewer and the author were the same, in the same frame of mind

I wrote this code and I reviewed it. A review conducted by whoever holds the
author's model of the code re-reads the *intent* and confirms it — and the
intent was correct in all eleven cases. Every one of these is a gap between a
correct intention and what the runtime actually does with it. Reading for intent
cannot find that, because the intent is right there and it is fine.

The checklist did not supply knowledge I lacked. I can derive every item on it
from first principles, and this document argues several of them in more detail
than the checklist did. What it supplied was an **outside frame** — a search
order not derived from the code's own logic. That is the whole of its advantage,
and it is sufficient. This is why it worked, and it is why an external
perspective is not a nice-to-have on self-reviewed code.

### The test suite is blind to this entire class, and says so in writing

[TESTING.md](TESTING.md) has a table of what each environment sees. The unit row
reads: *Sees — the first commit of a component. Blind to — anything an effect
does.* At the time: 59 files and 789 tests, and not one of them could observe a
second render, because they all rendered once through `renderToStaticMarkup`.
(A jsdom layer was added afterwards, for injected failure — see
[TESTING.md § A third environment](TESTING.md#a-third-environment-for-failure-only)
— but it did not exist while any of these eleven were written or reviewed.)

Every one of these eleven defects lives in the second render or later.

So the suite was green, and green carried no information. Worse, it *felt* like
information — 789 passing tests reads as coverage, and the thing they do not
cover was written down in a table nobody consulted while reviewing. A known gap
that is documented but not routed around is not much better than an unknown one.

### Four of the eleven are invisible in any single file

Finding 1 is a memo in `ChessBoardView.tsx` broken by a JSX prop in
`PlayScreen.tsx`. Read either file alone and nothing is wrong: the memo lists
its dependencies honestly and completely, and the prop is ordinary React. The
defect exists only in the relationship.

The same shape covers finding 3 (module cache versus component closure),
finding 11 (effect owner versus button call site) and finding 8 (an effect
maintaining a second answer to a question computed twenty lines away).
File-scoped review — which is what reviewing a diff is — structurally cannot see
these. They need a question asked across the layer, which is what a sweep is and
a review is not.

### Depth of investigation was mistaken for correctness of fix

The react-chessboard investigation behind finding 1 was genuinely good work:
bisected empirically, remedies ruled out one by one, written up at length in
`LESSONS-LEARNED.md`. It concluded "memoise the options object," which was
right. Then nobody asked whether the dependencies of that memo could actually be
stable — and two of them never could be, because they were built inline by the
caller.

The twelve-line comment then stated that the problem was handled, and became the
reason not to look again. **A comment asserting an invariant is not a test of
it.** The more convincing the write-up, the longer the gap survives: I read that
comment several times and took it as evidence.

### "It works" was load-bearing, and it was true

Every one of these behaves correctly on the happy path. Several are only
reachable by doing two things faster than a worker can answer — click a game and
immediately navigate, ask for a hint and immediately move, start two imports.
Manual testing does not do that, because a person testing a feature performs the
feature, not the interruption of it. Finding 1 does not misbehave at all today;
it merely removed a safety net.

Code that works is reviewed more gently than code that does not. That is not a
defect of any individual review — it is a reason that *this* class of bug needs
a sweep with a list rather than attention, however careful.

### So: why did it take a checklist from somewhere else?

It did not need to be from anywhere in particular. It needed to be from
**outside this codebase and outside its author** — any taxonomy of the class
would have done the same job, and this one was unremarkable: six well-known
React failure modes, two of which were the same item, and one of which was
imprecisely stated.

That is the point worth keeping. The value was not in the content, which was
ordinary. It was in arriving with categories to enumerate instead of code to
read, from a source that did not share the code's assumptions. An unremarkable
list from outside beat careful attention from inside, repeatedly, eleven to
nothing.

Which is why the list now lives in
[TESTING.md § Reviewing for timing](TESTING.md#reviewing-for-timing) and not in
anyone's memory.

---

## See also

- [TESTING.md § Reviewing for timing](TESTING.md#reviewing-for-timing) — the six
  questions, as a gate on presentation changes.
- [TESTING.md § The two environments](TESTING.md#the-two-environments) — what
  each suite can and cannot see.
- [LESSONS-LEARNED.md § react-chessboard 4 → 5](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end)
  — the original board investigation, and the memo that finding 1 repairs.
- [UI-ARCHITECTURE.md](UI-ARCHITECTURE.md) — which UI abstractions were added,
  and which were refused.
