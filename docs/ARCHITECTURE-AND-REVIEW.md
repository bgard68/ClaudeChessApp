# Architecture and Security Review

A companion to the README. The README says what the app is and how to run it;
this says how it is built, what a DevSecOps review of it found, what was fixed,
what was deliberately left, and where the design honours or breaks the usual
principles — with the reasons, not just the verdicts.

Written after a review on 2026-07-29 covering the full attack surface, the
supply chain, the data pipeline, and the client-side hardening.

Three sections have since grown into documents of their own. Their numbers are
kept below, pointing to where the content went, so the shape of the review still
reads in order:

| Section | Now lives in |
| --- | --- |
| 2. Application flow | [FLOWS.md](FLOWS.md) |
| 3. Database | [DATA-MODEL.md](DATA-MODEL.md) |
| 7. Bugs found | [LESSONS-LEARNED.md](LESSONS-LEARNED.md) |

[docs/README.md](README.md) indexes everything here.

---

## 1. What this app is, architecturally

A **static single-page React app**. No server, no backend, no runtime API of its
own. Everything — the rules, the engine, the database — runs in the browser.

That single fact drives most of what follows. There is no server to validate
input, hold secrets, or enforce authorisation, and nothing to attack on the
server side because there is no server side. What remains is the client, the
data it ingests, and the pipeline that builds it.

| Concern | Where it lives |
| --- | --- |
| Rules and model | `src/domain/` — pure TypeScript, no libraries |
| Use cases | `src/application/` — turn loop, replay, difficulty |
| Adapters | `src/infrastructure/` — chess.js, Stockfish, SQLite, PGN |
| UI | `src/presentation/` — React |
| Wiring | `src/composition/` — the only place naming concrete classes |
| Build-time data | `scripts/` — fetches and builds the game library |

---

## 2. Application flow

Moved to **[FLOWS.md](FLOWS.md)** — how the components are wired, the screen
state machine, a worked example of one game from **Start** to a stored result,
the turn loop, how state reaches the screen, and the three execution contexts.

---

## 3. Database

Moved to **[DATA-MODEL.md](DATA-MODEL.md)** — where the database lives and its
two fallbacks, the schema with its entity diagram, how a row gets written, the
two version numbers and why they are separate, and migration safety.

---

## 4. APIs

The app exposes **no API**. What it has instead:

### 4.1 Internal ports (the seams)

| Port | Purpose | Implementations |
| --- | --- | --- |
| `Opponent` / `InteractiveOpponent` | whoever is to move | `HumanOpponent`, `EngineOpponent` |
| `ChessEngine` | move-choosing ability | `StockfishEngine` |
| `ChessRules` | legality and position transitions | `ChessJsRules` |
| `Ticker` | elapsed time | `IntervalTicker` |
| `GameArchive` | reading the library | `SqliteGameArchive` |
| `GameStore` | writing the library | `SqliteGameArchive` |

`GameArchive` and `GameStore` are two interfaces over one adapter so a browsing
screen is never handed the ability to delete.

### 4.2 External data, fetched at build time only

Nothing here runs at runtime. These are `scripts/` reaching the network on a
developer's machine.

| Source | Used by | Notes |
| --- | --- | --- |
| `api.github.com` → `mainali123/Chess-Dataset` | `fetch-games.mjs` | 50 championship PGNs |
| `pgnmentor.com/players/*.zip` | `fetch-famous-games.mjs`, `fetch-modern-championships.mjs`, `fetch-careers.mjs` | per-player collections |
| `ratings.fide.com/.../standard_rating_list.zip` | `fetch-federations.mjs` | federations and titles |

The three collections the app serves are **committed**, so a clone, a dev start
and a build need no network at all. `prepare-assets.mjs` guards on the finished
collections rather than the intermediate downloads, which is what actually
removes the network from the common path.

### 4.3 Runtime network calls

Only same-origin fetches of the app's own PGN files, and only on first visit.
The CSP pins this with `connect-src 'self'`.

---

## 5. PGN: import, export, and where files come from

PGN (Portable Game Notation) is the plain-text standard every chess program
reads. It is this app's only interchange format, in both directions, and the
canonical form in which games are stored — the `pgn` column is the record, and
the metadata columns are an index over it.

### 5.1 What ships with the app

2,987 games across three non-overlapping files, loaded automatically on first
visit and then read from the database on every visit after:

| File | Games |
| --- | --- |
| `world-championship-knockout.pgn` | 1,805 |
| `world-championship-title-matches.pgn` | 1,164 |
| `famous-games.pgn` | 18 |

Two much larger collections are built but **deliberately not served** — they are
tens of megabytes and would burden every visitor with games nobody asked for.
They live in `library/` for you to import by hand:

| File | Games |
| --- | --- |
| `optional-careers.pgn` | 107,352 |
| `optional-elite-tournaments.pgn` | 20,225 |

### 5.2 Importing

**Browse championship games → Import PGN**, then pick a `.pgn` file. Anything a
chess program can write, this can read.

What happens to it:

1. The file's size is checked **before** it is read — reading is the part that
   freezes the tab, so a message afterwards would arrive too late to help. The
   ceiling is **128 MB**, set by what a legitimate import weighs rather than what
   feels tidy: `optional-careers.pgn` alone is 69 MB.
2. The text is split into individual games and inserted in transactions of 500,
   with progress reported — the large collections run to six figures, and without
   that the app looks frozen for minutes.
3. Each game is fingerprinted. **Re-importing is safe**: the unique index on
   `game_key` rejects anything already held, and the count reported is the number
   actually added, not the number supplied. "Added 40,000" when it added none
   would be a lie.
4. Imported games are tagged `source = 'imported'`, which is what keeps them —
   along with games you played — safe across a schema rebuild.

The original file is never moved, altered, or read again. Only the parsed games
enter the database.

### 5.3 Exporting

**Browse championship games → Export mine** downloads `my-chess-games.pgn`.

It contains the games you **played or imported**, oldest first — not the bundled
collections, which ship with the app and are re-importable. The stored PGN is
returned exactly as it went in rather than re-serialised from the parsed form,
which would quietly drop anything the app does not model.

This is the only real recovery path. Storage permission (§3.1) reduces the
chance of the browser evicting the database, but nothing inside the browser
survives a user clearing site data. A file on disk does.

### 5.4 Where to get PGN files

| Source | What it has |
| --- | --- |
| [pgnmentor.com](https://www.pgnmentor.com) | Per-player career collections and tournament files. What this project's own career and famous-game collections are built from. |
| [Lichess](https://database.lichess.org) | Monthly dumps of every rated game played there. Enormous — split before importing. |
| [Lichess](https://lichess.org) / [Chess.com](https://www.chess.com) accounts | Both export your own games as PGN, which this app will then read. |
| [TWIC](https://theweekinchess.com) | Weekly tournament bulletins going back decades. |
| [mainali123/Chess-Dataset](https://github.com/mainali123/Chess-Dataset) | The World Championship dataset this project's championship collection came from. |
| Any chess program | SCID, ChessBase, Arena and the rest all write PGN. |

Two practical notes. Files above 128 MB must be split — the Lichess monthly
dumps are far past that. And a collection with no `[Event]` tags will not split
into games correctly, because that tag is what marks a game boundary.

---

## 6. Security review

### 6.1 Verdict

The application code is well built: parameterised SQL throughout, no injection
sinks, atomic transactions, invariants documented where the decision was made.
The real exposure was never in `src/` — it was in the build pipeline and the
absence of anything enforcing the controls that already existed.

### 6.2 Findings and disposition

| ID | Finding | Status |
| --- | --- | --- |
| H1 | No automated enforcement of the checks the project already had | **Fixed** — tracked `.githooks/pre-commit` runs typecheck + tests; `npm run verify` adds `npm audit` |
| H2 | Build depended on an unpinned third-party dataset; whoever controlled it controlled every build | **Fixed** — the three served collections are committed |
| H3 | `fetch-games.mjs` claimed its download was committed while `.gitignore` excluded it | **Fixed** — comment corrected, and the claim is now true of the built collections |
| M1 | No Content-Security-Policy | **Fixed** — measured, then enforced (§6.3) |
| M2 | `unzip.mjs` inflated without a ceiling and read offsets straight from the archive | **Fixed** — 512 MB cap via `maxOutputLength`, every read range-checked |
| M3 | The 128 MB import limit lived only in the UI, outside the operation it protects | **Fixed** — `importPgn` enforces its own bound |
| L1 | UCI is newline-delimited; interpolated values could append commands | **Fixed** — `send()` refuses line breaks |
| L2 | Dependencies whole majors behind | **Fixed** — vite 6→8, vitest 3→4, TypeScript 5.9→7, Stockfish 11→18, react-chessboard 4→5 |
| L3 | `PRAGMA user_version` interpolates rather than binds | **Not a defect** — SQLite has no placeholder for PRAGMA values; the value is a module constant. Recorded so a future reviewer does not re-flag it |
| L4 | GPL-3.0 engine distributed without its licence text or a source route | **Fixed** — `copy-engine` ships both into `public/engine/`, and refuses to run without the licence (§6.4) |

**Verified clean:** no secrets anywhere; no XSS sinks (`innerHTML`,
`dangerouslySetInnerHTML`, `eval`, `new Function` all absent from `src/`); no
zip-slip (archive entries are read into memory, never written out by their own
name); `npm audit` reports nothing.

Because there is no server, no auth, and no runtime third-party calls, the
entire class of server-side findings does not apply.

### 6.3 The CSP, and how it was arrived at

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```

Every directive was **measured, not guessed**: served report-only first, with
`securitypolicyviolation` events collected while playing an engine game,
importing the library, and replaying an archived game — against both dev and the
production bundle. Controls were fired at the start and end of each run, so a
clean result means the policy held rather than that nothing was watching.

- `'wasm-unsafe-eval'` is required — the engine compiles WebAssembly, and a
  default policy blocks that outright.
- `'unsafe-eval'` is **withheld and proved unnecessary.** The one `new Function`
  in the Stockfish loader is the dead `else` branch of a `setImmediate` polyfill
  and never reported.
- `'unsafe-inline'` for styles is unavoidable: the board positions every square
  with a style attribute. A far smaller concession than script.
- Injected at **build only**. `@vitejs/plugin-react` emits an inline Refresh
  preamble in dev that `script-src 'self'` blocks, which leaves the page empty.
  Granting `'unsafe-inline'` to keep dev alive would weaken what ships to buy
  nothing, so dev runs unpoliced.
- `frame-ancestors` cannot be expressed in a `<meta>` tag, so it is set as a
  header in `public/staticwebapp.config.json`.

### 6.4 Licensing

Not a vulnerability, but it surfaced from the same audit and had the same shape —
an obligation nothing enforced.

`stockfish` is **GPL-3.0**, and it is the only GPL package in the tree. It is
also *distributed*: the WASM and its loader are served to every visitor as static
assets, not used at build time and discarded. GPL-3.0 asks that recipients
receive the licence text and a route to the source, and the build shipped neither
— the licence sat in `node_modules`, which never reaches `dist/`.

`copy-engine.mjs` now copies `Copying.txt` to `public/engine/LICENSE-stockfish.txt`
and writes a source notice beside it naming both upstream projects and stating
that the binaries are unmodified. Both land in `dist/engine/`, verified. The
script **fails** if the upstream licence file is absent rather than shipping GPL
binaries without it — verified by deleting it and confirming exit 1.

Everything else is MIT, BSD-2-Clause or Apache-2.0, and none of it is
copyleft. Nothing in the project costs money: every dependency and every data
source is free to use.

One thing deliberately not asserted here: whether GPL-3.0's copyleft reaches this
application's own code. The engine loads as a separate worker communicating over
UCI text, which is normally treated as aggregation rather than a derivative work,
and that is how browser chess apps generally ship it. It is a genuine grey area in
GPL interpretation and worth a legal opinion rather than a developer's reading if
this is ever distributed commercially or closed-source.

### 6.5 Still open

- **The two career collections (~101 MB) remain unpinned.** They are optional
  imports that never deploy, fetched by `fetch-careers.mjs` from
  `pgnmentor.com`. Committing them is not worth ~101 MB of permanent history; if
  their integrity ever matters, pin a checksum.
- **`fetch-federations.mjs` buffers a remote zip whole** before inflating it.
  Bounded now by the inflate cap, but the download itself is unbounded.

---

## 7. Bugs found, and what they taught

Moved to **[LESSONS-LEARNED.md](LESSONS-LEARNED.md)** — the missing World
Championship game, the IPv6-only dev server, the test suite that was not
hermetic, upstream data defects, and the react-chessboard 4 → 5 migration with
its two-day dead end. Joined there by what the security pass later turned up
about the build itself.

---

## 8. Principles: where the design holds, and where it does not

The honest position is that this codebase applies these ideas **selectively**,
and the omissions are as considered as the applications.

### 8.1 Single Responsibility (SRP) — largely honoured

Held well:

- `Clock` knows about durations and stages. It does not know what time it is —
  callers advance it by an elapsed duration. That is precisely what lets live
  play and replay simulation share one implementation.
- `StockfishEngine` exists so that UCI — a line-oriented, stringly-typed,
  stateful protocol — stops at the edge of the system. Nothing above it knows
  what `go movetime 500` means.
- `App.tsx` owns screen choice *and* resource lifetime. Arguably two
  responsibilities; they are together on purpose, because splitting them is how
  a worker eventually leaks.

Strained:

- **`SqliteGameArchive` is the weak point.** It implements two ports, builds SQL,
  runs the one-time import, performs migrations, and rebuilds the player index —
  roughly 500 lines. Each piece is coherent and the comments explain why, but
  "the library" is a broad responsibility. If this file grows again, the player
  index is the natural thing to extract — see V2 in §8.10 for why that wait is
  deliberate.
- `ArchiveScreen` holds filter state, sort state, pagination, import, and export.
  It is a screen, so some of that is inherent; it is nonetheless the largest
  component.

### 8.2 Open/Closed (OCP) — honoured where it matters

Adding a networked opponent requires a new `Opponent` implementation and no
change to `LiveGame`. Adding a difficulty level is a new entry in an array.
Swapping the rules library is a new `ChessRules` implementation.

Not honoured, deliberately: adding a *screen* means editing the `View` union and
the switch in `App.tsx`. A router or plugin registry would make that
closed-for-modification and buy nothing at five screens.

### 8.3 Liskov (LSP) — honoured, and load-bearing

`HumanOpponent` and `EngineOpponent` are genuinely substitutable: the loop calls
`requestMove` and awaits a promise, and neither implementation surprises it. The
one place the loop needs more, it asks by capability rather than by type —
`isInteractive()` narrows to `InteractiveOpponent` instead of
`instanceof HumanOpponent`. That is the difference between a substitutable
hierarchy and one with a type check bolted on.

### 8.4 Interface Segregation (ISP) — honoured, with a clear example

`GameArchive` and `GameStore` are separate interfaces implemented by one class,
specifically so browsing screens cannot delete. `ChessEngine` is deliberately
narrow — a move, not evaluations or principal variations — so everything
protocol-shaped stays in the adapter.

`GameArchive` itself is the counter-example: `list`, `load`, `importPgn`,
`durability`, `exportPgn`, `suggestPlayers`, `facets`. That is a wide interface,
and a screen that only lists games depends on all of it. Splitting it further
would be defensible; V3 in §8.10 sets out why it is not being done.

### 8.5 Dependency Inversion (DIP) — honoured, and now enforced

`domain/` and `application/` import no React, no chess.js, no Stockfish, no
SQLite. Dependencies point inward only. `composition/services.ts` is the single
module that names concrete classes, and it is 85 lines.

This used to be a convention that nothing checked, and a scan found the
predictable result: one breach that had gone unnoticed for exactly that reason.
`src/architecture.test.ts` now asserts the rule — each layer imports only itself
or inward, outer libraries stay out of `domain/` and `application/`, only the
composition root constructs adapters, and `presentation/` does not reach
`@infrastructure`. Hand-rolled rather than an ESLint rule, because the project
has no linter and adding one plus a plugin to assert four things is a worse trade
than thirty lines that already run in the commit hook. Verified by injecting a
`chess.js` import into `domain/` and confirming the failure.

**One accepted exception**, listed in that test with its reason:
`presentation/hooks/useFederations.ts` imports `@infrastructure/archive/federations`
directly. It reads a static JSON file to put flags beside player names. A port
plus injection would buy substitutability for something that will never have a
second implementation; the cost of the exception is that flag rendering cannot be
tested without stubbing `fetch`. Keeping it in a list means it stays a decision
rather than becoming a precedent — the test also fails if an entry in that list
no longer exists, so a fixed exception cannot linger as implied permission.

### 8.6 Clean Architecture — followed in substance, not ceremony

The layering and the dependency rule are real. What is skipped:

- **No DI container.** A plain `createAppServices()` function is enough at this
  size.
- **No use-case-per-class.** `LiveGame` is one object with `start`, `submitMove`,
  `resign`, `agreeDraw`, `undo` rather than five command classes. They share
  state and a turn loop; splitting them would spread one cohesive thing across
  five files.
- **No repository wrapper over React state**, no CQRS, no event sourcing, no
  mediator. Ceremony at this size.

The tradeoff is honest: this is Clean Architecture's *dependency rule* without
its *file taxonomy*. Someone arriving expecting `CreateGameUseCase.ts` will not
find it. What they will find is a `domain/` they can read without knowing what
React is.

### 8.7 DRY — mostly, with one knowing duplication

Good: case-folding lives once in `search_text`; `Clock` handles blitz and 1927
adjournments as the same shape; the identity and PGN-tag helpers the build
scripts share now live in `scripts/lib/gameKey.mjs` rather than being copied
into each one.

Deliberately duplicated:

- **Game identity is implemented twice** — `gameKey.ts` for the app and
  `scripts/lib/gameKey.mjs` for the build scripts. The app's is TypeScript
  behind path aliases, and a script that needs a compile step to run is a script
  nobody runs. `gameKey.test.ts` pins the two to identical output over a fixture
  set, so the duplication is a checked invariant rather than a risk. Verified by
  injecting drift into the `.mjs` and confirming the test fails.
- **The engine filename appears in two places** — `copy-engine.mjs` chooses it,
  `services.ts` references it. Nothing but a broken engine says so if they
  diverge. Both carry a comment pointing at the other; a generated constant
  would be better.

> **Correction.** An earlier version of this section claimed `gameKey.test.ts`
> already locked two of three implementations. It did not: neither that test nor
> `scripts/lib/gameKey.mjs` existed, and the comment at the top of `gameKey.ts`
> had promised both for some time. A scan for violations found the claim before
> it found anything else. Both now exist, the third copy is gone, and the test is
> proven to fail on drift — but the lesson is that a comment asserting a safety
> net is worth exactly nothing until something fails without it.

### 8.8 Summary

| Principle | Verdict | The tradeoff |
| --- | --- | --- |
| SRP | Mostly held | `SqliteGameArchive` does too much; extraction deferred by design (§8.10 V2) |
| OCP | Held where extension is likely | Screens are closed to extension by choice |
| LSP | Held, and load-bearing | Capability check (`isInteractive`) instead of type check |
| ISP | Held | `GameArchive` is wide; splitting prevents no defect (§8.10 V3) |
| DIP | Held, and enforced | `architecture.test.ts` asserts it; one exception, argued in §8.10 V1 |
| Clean Arch | Dependency rule yes, taxonomy no | No use-case classes, no DI container |
| DRY | Mostly | Game identity duplicated 2× for a real reason, and test-locked |

### 8.9 The scan, and what was done about it

The verdicts above came partly from reading the code as it was written and partly
from a deliberate scan for violations — greps for outward imports, concrete
adapters named outside the composition root, duplicated logic, interface widths
and file sizes. Six things came out of it. Three were fixed; three stand, and are
argued in §8.10.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | The dependency rule was a convention nothing checked | **Fixed** — `src/architecture.test.ts` |
| 2 | `gameKey.ts` and this document both claimed a safety net that did not exist | **Fixed** — comment corrected, §8.7 carries the correction |
| 3 | Game identity implemented three times, nothing holding them in agreement | **Fixed** — reduced to two, locked by `gameKey.test.ts` |
| 4 | `useFederations` imports infrastructure directly | **Stands** — §8.10 V1 |
| 5 | `SqliteGameArchive` carries six responsibilities | **Stands** — §8.10 V2 |
| 6 | `GameArchive` is a wide interface | **Stands** — §8.10 V3 |

#### How 1 was fixed

`src/architecture.test.ts` asserts four rules: each layer imports only itself or
inward; `react`, `chess.js`, `stockfish`, `react-dom`, `react-chessboard` and
`@sqlite.org/sqlite-wasm` stay out of `domain/` and `application/`; only
`composition/` constructs adapters; and `presentation/` does not import
`@infrastructure`. It walks `src/` itself and reads the import specifiers — no
ESLint, because the project has no linter and adding one plus a plugin to assert
four things is a worse trade than thirty lines that already run in the commit
hook.

Two details that make it a guard rather than a decoration. It asserts it found
more than forty files, so a broken directory walk cannot make every other
assertion vacuously true. And accepted exceptions live in a list in the test with
their reason beside them, checked both ways: a second exception fails the build,
and an entry naming a file that no longer exists also fails — so a breach that
gets fixed cannot leave stale permission behind.

#### How 3 was fixed

`scripts/lib/gameKey.mjs` is the plain-JavaScript twin the build scripts can
import; `gameKey.test.ts` pins it to `gameKey.ts` over cases chosen for what the
key exists to get right — the same game with and without clock comments, with
annotation glyphs, with punctuation and case differing in names, a forfeit with no
moves at all, and identical moves played by different people.

The duplication was also reduced rather than merely checked. `audit-pgn-archive`
and `dedupe-pgn-archive` each had private copies of the tag, person and move-text
helpers; both now import the shared module. Three implementations became two, and
the two that remain are the ones that cannot be collapsed — a build script cannot
import TypeScript behind path aliases without a compile step, and a script that
needs one is a script nobody runs.

#### Both fixes were proven to fail

A guard that has only ever passed is not known to work. Each was verified by
injecting the fault it exists to catch, and then restored:

| Injected | Result |
| --- | --- |
| NAG stripping removed from `gameKey.mjs` | `gameKey.test.ts`: 1 failed, 16 passed |
| `import { Chess } from 'chess.js'` added to `domain/chess/Move.ts` | `architecture.test.ts`: 1 failed, 7 passed, naming the file |

The refactor was also checked for behaviour: `audit-pgn` still reports 130,565
distinct games and no duplicates over the same archive, so moving the helpers
changed no answer.

---

### 8.10 Known violations left standing

Three violations found by a deliberate scan are **not** being fixed. They are
recorded here with what is actually wrong, what fixing it would cost, and why the
trade does not pay — so that leaving them is a position rather than an oversight,
and so the next person does not spend an afternoon on work already judged not
worth doing.

The test for each: does fixing it prevent a defect, or does it only make the
diagram tidier?

---

#### V1 — `useFederations` reaches infrastructure directly (DIP, Clean Architecture)

**The violation.** `src/presentation/hooks/useFederations.ts` imports
`@infrastructure/archive/federations`. It is the only place in production code
where presentation reaches past the composition root into infrastructure. Three
things make it real rather than technical:

- **No port exists.** Every other external dependency has one — `ChessEngine`,
  `ChessRules`, `Ticker`, `GameArchive`, `GameStore`.
- **`federations.ts` performs `fetch()`.** So a React hook depends directly on a
  concrete network call.
- **It caches in module-level mutable state** (`loading ??=`), which makes it a
  hidden singleton: not injected, not substitutable, shared across every consumer.

**What fixing it costs.** A `PlayerFederations` port in `application/ports/`, an
adapter in `infrastructure/`, a line in `composition/services.ts`, and threading
it through `ServicesContext` to the one hook that wants it. Four files and a new
seam.

**Why it stands.** The abstraction would buy substitutability for something that
will never have a second implementation. It reads one static JSON file to put a
flag beside a player's name — there is no second source of federations, no
server-backed variant to swap in, no test that wants a fake. The port would exist
to satisfy the diagram.

**What it actually costs to leave.** Flag rendering cannot be unit-tested without
stubbing `fetch`, and the module-level cache means a test that loads federations
once affects later tests in the same file. Both are real and neither has bitten:
no test currently needs to.

**The condition that would change the answer.** A second source of federation
data, a need to test flag rendering directly, or that cache causing a test to
interfere with another. Any of those and the port pays for itself immediately.

**Why it is safe to leave.** It is listed in `architecture.test.ts` beside its
reason, so the exception is enforced as a *single* exception — a second one fails
the build. And the test fails if the listed file stops existing, so if this is
ever fixed the stale permission cannot linger.

---

#### V2 — `SqliteGameArchive` does too much (SRP)

**The violation.** 590 lines, 15 methods, and at least six distinct
responsibilities: query construction, durability reporting and the storage
permission request, PGN import, export, the parsed-game cache, player-index
rebuilding, schema migration, and first-run initialisation. `ArchiveScreen.tsx`
is the same shape from the other end — 594 lines and 17 hooks holding filter
state, sort state, pagination, import and export.

**What fixing it costs.** The natural extraction is `rebuildPlayerIndex` — about
70 lines with its own concern, name-merging, which already has its own test file
in `playerIdentity.test.ts`. Pulling it out means a new collaborator, a
constructor parameter, and a decision about whether it owns its own SQL or is
handed statements to run.

**Why it stands.** Nothing is *wrong* today. Every method is short, each carries a
comment explaining the decision it encodes, and they genuinely share the same
concern — one SQLite database and its lifecycle. Splitting now would trade a long
cohesive file for two files plus a seam, and the reader would have to follow the
seam to understand initialisation. Size alone is not a defect; size *plus* a
reason to change is.

**What it actually costs to leave.** The file is intimidating to a newcomer, and
a bug in one responsibility is read in the context of five others. That is a
comprehension cost, not a correctness one.

**The condition that would change the answer.** The next time that file needs a
non-trivial change. At that point the extraction is nearly free, because the code
is already being read and tested — and doing it then means the split is shaped by
a real requirement instead of guessed at now.

---

#### V3 — `GameArchive` is a wide interface (ISP)

**The violation.** Seven methods — `list`, `load`, `importPgn`, `durability`,
`exportPgn`, `suggestPlayers`, `facets` — and no consumer uses more than four:

| Consumer | Uses |
| --- | --- |
| `App.tsx` | `load` |
| `PlayerSearch.tsx` | `suggestPlayers` |
| `useLibraryDurability.ts` | `durability` |
| `ArchiveScreen.tsx` | `list`, `facets`, `importPgn`, `exportPgn` |

Strictly, every one depends on all seven.

**What fixing it costs.** Three or four narrower interfaces —
`GameReader`, `GameImporter`, `PlayerDirectory`, `LibraryStatus` — each
implemented by the same adapter, plus the corresponding context plumbing so a
component receives only the one it needs.

**Why it stands.** No defect is reachable through this. A component holding a
reference it never calls cannot misuse it, and TypeScript already prevents
calling something that is not on the interface. The one segregation that *does*
prevent a defect already exists: `GameArchive` and `GameStore` are separate so a
browsing screen is never handed `remove()`. That split was made because deletion
is dangerous — the remaining methods are all reads and one import, where the
worst outcome of over-exposure is nothing at all.

**What it actually costs to leave.** A reader cannot tell from a component's type
which parts of the library it touches. Minor, and answered by reading the
component.

**The condition that would change the answer.** A method arriving that is
dangerous in the way `remove()` is — something destructive, expensive, or
irreversible. Segregation earns its keep by keeping capability away from code that
should not have it, and there is currently nothing left worth withholding.

---

**The through-line.** V1 is a violation with a cheap fix and no payoff. V2 is a
real smell whose fix should be triggered by a change, not by a scan. V3 is a
technicality that would cost plumbing and prevent nothing. Fixing all three would
score better against a checklist and leave the app no more correct — which is the
argument for writing down why, instead of doing it.

---

## 9. Verification

Everything above was checked rather than assumed.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` | 107 passing, 11 files — including the two architecture guards |
| `npm run build` | clean; CSP meta tag present in output |
| `npm audit` | 0 vulnerabilities |
| `npm run audit-pgn` | 130,565 games, 0 duplicates, 11,142,485 half-moves replayed |
| `npm run audit-library` | 2,987 served games, 0 unplayable, 1 forfeit, 0 duplicates |
| Browser | engine loads WASM and moves; archive imports and renders; click-to-move and drag-and-drop both play |

Two independent scripts arriving at 11,142,485 half-moves over the same games is
the cross-check worth having: `audit-pgn-archive` and `audit-library` share no
code.

The two guard tests were each verified by injecting the fault they exist to catch
and confirming the failure, then restoring — see §8.9. A guard that has only ever
passed is not known to work.

Two things remain unexercised: the promotion chooser needs a game reaching a
seventh-rank pawn, and storage persistence has only been observed being
*refused* — Chrome declines a low-engagement `localhost` origin, which is the
pessimistic path and the one worth having seen.
