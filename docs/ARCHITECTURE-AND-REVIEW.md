# Architecture and Security Review

A companion to the README. The README says what the app is and how to run it;
this says how it is built, what a DevSecOps review of it found, what was fixed,
what was deliberately left, and where the design honours or breaks the usual
principles — with the reasons, not just the verdicts.

Written after a review on 2026-07-29 covering the full attack surface, the
supply chain, the data pipeline, and the client-side hardening.

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

### 2.1 Screen flow

`App.tsx` owns which screen shows and the lifetime of what that screen drives.
Games and replay sessions hold real resources — an engine worker, a running
timer — so every transition disposes what it replaces rather than leaving it to
each screen's unmount.

```mermaid
stateDiagram-v2
    [*] --> setup
    setup --> play: Start game
    setup --> archive: Browse championship games
    archive --> setup: Back
    archive --> loading: open a game
    loading --> replay: PGN parsed
    loading --> error: parse failed
    error --> archive: Back
    replay --> archive: Back
    play --> setup: New game

    note right of play
        disposes engine worker
        and ticker on exit
    end note
```

### 2.2 The turn loop

The abstraction the whole design turns on is `Opponent`. A person at the
keyboard and a search engine satisfy the same contract, so `LiveGame` runs **one**
loop rather than a branch per game mode.

```mermaid
sequenceDiagram
    participant UI as PlayScreen
    participant Game as LiveGame
    participant Opp as Opponent
    participant Rules as ChessRules
    participant Tick as Ticker

    Game->>Opp: requestMove({position, legalMoves, clock})
    alt human
        UI->>Game: submitMove(intent)
        Game->>Opp: offerMove(intent) resolves the pending promise
    else engine
        Opp->>Opp: UCI to Stockfish worker
    end
    Opp-->>Game: MoveIntent
    Game->>Rules: applyMove(position, intent)
    Rules-->>Game: new Position + legal moves
    Tick-->>Game: onTick(elapsedMs)
    Game->>UI: publish(state)
```

A human move resolves a pending promise; the engine's resolves from a worker.
A networked opponent would be a third implementation and the loop would not
change.

### 2.3 Threads

Three execution contexts, each for a hard reason:

```mermaid
flowchart LR
    Main["Main thread<br/>React, rules, turn loop"]
    SF["Stockfish worker<br/>stockfish-18-lite-single"]
    SQL["SQLite worker<br/>sqlite.worker.ts"]
    OPFS[("OPFS<br/>chess-library.sqlite")]

    Main -- "UCI text" --> SF
    SF -- "bestmove" --> Main
    Main -- "SqlStatement[]" --> SQL
    SQL -- "rows" --> Main
    SQL --> OPFS
```

- **SQLite must be in a worker.** `createSyncAccessHandle`, which the persistent
  storage backend is built on, exists only in worker scope. On the main thread it
  is `undefined` and nothing could ever be saved. Keeping queries off the main
  thread is a side effect, not the reason.
- **Stockfish is in a worker** because search is CPU-bound and would otherwise
  freeze the board on every move it thinks about.
- The **single-threaded** engine build is deliberate: the threaded builds need
  `SharedArrayBuffer`, which needs COOP/COEP headers, which would cost the app
  its ability to deploy as plain static files.

---

## 3. Database

### 3.1 Where it lives

**SQLite compiled to WebAssembly, stored in the browser's Origin Private File
System** as `chess-library.sqlite`, via the SAH-pool VFS named `chess-library`.

Per origin, per browser profile, on the user's own machine. Never uploaded,
never a file in this repo. Two documented fallbacks to an in-memory database,
both reported to the UI rather than hidden:

| Condition | Result |
| --- | --- |
| No OPFS (private window, older browser) | in-memory, `reason: 'no-storage'` |
| Another tab holds the access handles | in-memory, `reason: 'another-tab'` |
| OPFS but persistence not granted | durable, `evictable: true` |

### 3.2 Schema

Four tables. `SCHEMA_VERSION` bumps for any structural change;
`LIBRARY_VERSION` bumps when bundled collections change. They move for
different reasons, so they are separate.

```mermaid
erDiagram
    game {
        INTEGER id PK
        TEXT source "championship|famous|career|played|imported"
        TEXT white_name
        TEXT black_name
        INTEGER white_elo
        INTEGER black_elo
        TEXT event
        TEXT site
        TEXT round
        TEXT played_on
        INTEGER year
        TEXT result "1-0|0-1|1/2-1/2|*"
        TEXT outcome_status "decisive|draw|in_progress"
        TEXT outcome_reason
        TEXT eco
        TEXT opening
        TEXT time_control
        INTEGER move_count
        INTEGER has_clock_times
        TEXT nickname
        TEXT game_key "UNIQUE, NULL for your own games"
        TEXT pgn "canonical record"
        TEXT recorded_at
        TEXT search_text "GENERATED STORED"
    }
    player {
        INTEGER id PK
        TEXT canonical
        TEXT sort_key "UNIQUE - surname + initial"
        INTEGER game_count
        INTEGER first_year
        INTEGER last_year
        INTEGER peak_elo
    }
    player_alias {
        TEXT name PK
        INTEGER player_id FK
    }
    meta {
        TEXT key PK
        TEXT value
    }
    player ||--o{ player_alias : "spellings of"
    game }o--|| player_alias : "matched by name"
```

**Design decisions worth knowing:**

- **`pgn` is the canonical record.** Every metadata column is a queryable index
  over it, not a replacement. Export is therefore lossless — the bytes that went
  in come back out. This is why `exportPgn` reads the stored text rather than
  re-serialising the parsed form, which would quietly drop anything the app does
  not model.
- **There is no `move` table, on purpose.** PGN already encodes per-move clock
  times as `[%clk]` comments, which the replay code already reads. A move table
  would mean ~230,000 rows and a second source of truth competing with the PGN,
  for no capability this app needs.
- **`game_key` is `NULL` for games you played.** SQLite permits many NULLs in a
  unique index, so the constraint makes re-imports impossible while leaving your
  own short games free to be identical to each other.
- **`search_text` is generated and deliberately unindexed.** Substring search
  cannot use a B-tree and scanning a few thousand rows is sub-millisecond. The
  column exists so case-folding lives in exactly one place.
- **`player_alias` exists because the same person is spelled several ways.**
  "Anand,V" and "Anand, Viswanathan" resolve to one identity, so asking for a
  player's games returns all of them.
- **A schema change rebuilds the table and carries your own games across.** The
  bundled collections are re-importable; only games you played are
  irreplaceable. A version bump must never cost someone a game.

### 3.3 Migration safety

`migrate()` drops and rebuilds `game`, re-inserting rows whose `source` is
neither `championship` nor `famous`. This was checked specifically during the
review because the comment promises no game is ever lost: multi-statement
batches run inside `BEGIN`/`COMMIT` with `ROLLBACK` on failure
(`sqlite.worker.ts`), so a partial failure cannot leave the table half-built.
The promise holds.

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

These came out of the review rather than from a bug report, which is the
argument for having done it.

### 7.1 A real World Championship game was missing

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

### 7.2 The dev server bound IPv6-only

Vite was left to choose its own bind address and listened on `[::1]` alone. A
browser resolving `localhost` to `127.0.0.1` got connection refused while the
server was up and answering over IPv6 — so `curl` from a shell reported success
while the browser could not load the page. Fixed with `--host`; `--strictPort`
was added at the same time so a busy port fails loudly instead of drifting to
the next one and serving a different app than the preview expects.

### 7.3 The test suite was not hermetic

`bundledLibrary.test.ts` called `readdirSync` at import time against
`public/games/`, which is generated. A worktree that had not fetched assets
failed the whole file and reported a *broken* library rather than an absent one —
and blocked the new pre-commit hook for an environment reason rather than a code
one, which is how a gate teaches people to reach for `--no-verify`. Now a
declared `describe.skipIf`, so vitest lists the checks as skipped and the gap
stays visible.

### 7.4 Upstream data defects

- **Gelfand–Gareev, World Blitz 2019** — `Invalid move in PGN: Qxe1`. Corrupt
  move text upstream. One game in 130,565.
- **The career fetchers write duplicates** — 9,601 of them, because per-player
  collections are concatenated and a game between two listed players arrives
  twice. This is **deliberate and documented**: `build-library` scores competing
  records and keeps the better one, so deduplicating at fetch time would discard
  that ability. Harmless to the app because `game_key` is unique; it only makes
  the "games added" count on import misleading.

### 7.5 react-chessboard 4 → 5: the migration, and a two-day dead end

#### What the API change required

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

#### The failure

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

#### Remedies tried and ruled out

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

#### Verified, and not

Verified: the board renders on the setup screen and in a live game, the engine's
reply appears, click-to-move plays, and drag-and-drop works. Not verified: the
promotion chooser, which needs a game to reach a seventh-rank pawn.

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
