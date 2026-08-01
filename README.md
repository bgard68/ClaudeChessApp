# Chess

A browser chess app: play a friend on one device or Stockfish locally, with or
without a clock, replay 2,987 World Championship games on the board, and keep
your own games in a local library.

No backend. Everything — rules, engine, clocks, and the SQLite game library —
runs client-side.

## Running it

```bash
npm ci
```

```bash
npm run dev
```

Then open http://localhost:5173.

`npm ci` rather than `npm install`: it installs exactly what `package-lock.json`
records, which is what CI and the deploy use. `npm install` is for *changing*
dependencies, not for setting up.

> **Run `npm ci` again after every `git pull` that touched the lock file.**
> Skipping it is the one setup mistake that does not announce itself. `npm` does
> not notice that your `node_modules` is behind, and TypeScript reports the
> mismatch as an ordinary type error in whichever file happens to use the
> outdated package:
>
> ```
> ChessBoardView.tsx: Property 'options' does not exist on type ... ChessboardProps
> ```
>
> That is not a bug in the file named. It is react-chessboard 4 still on disk
> while `package.json` asks for 5, where `options` was introduced. **When a
> typecheck fails in a file your changes never touched, run `npm ci` before
> reading the error.** See
> [docs/LESSONS-LEARNED.md](docs/LESSONS-LEARNED.md#a-stale-or-missing-install-fails-as-a-type-error-somewhere-else).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (copies the engine into `public/` first) |
| `npm run build` | Typecheck and produce `dist/` |
| `npm test` | Run the test suite |
| `npm run layout-check` | Layout invariants, every screen at four widths (needs a build) |
| `npm run behaviour-check` | Interaction behaviour in a real browser (needs a build) |
| `npm run a11y-check` | axe-core accessibility pass (needs a build) |
| `npm run paths-check` | Nothing forbidden is tracked, or ever was in this change |
| `npm run screens` | Screenshot every screen at phone size, with touch (needs `npm run dev`) |
| `npm run fetch-games` | Re-download the World Championship games |
| `npm run fetch-famous` | Re-extract the famous-games collection |
| `npm run fetch-modern` | Re-fetch title matches played since 2008 |
| `npm run fetch-careers` | Fetch the two large optional career collections |
| `npm run build-library` | Validate, deduplicate, and write the collections |
| `npm run audit-library` | Independently re-check the built library |
| `npm run audit-pgn` | Audit any PGN directory or file for validity, duplicates and overlap |
| `npm run dedupe-pgn` | Merge a directory of collections into one file, each game once |
| `npm run verify` | Typecheck, test, and `npm audit` in one go |

`prepare-assets` runs before `dev` and `build`, and no-ops when the collections
are already present — a clone needs no network. `FORCE=1` refetches and rebuilds.

## What it does

- **Play a person or the computer.** Choose White, Black, or random. Five
  difficulty levels, from one that hangs pieces to full-strength Stockfish.
- **Timed or untimed.** Ten presets from 1-minute bullet to 90|30, or no clock.
- **Pass-and-play** turns the board between moves; against the computer you keep
  your own side.
- **Replay championship history.** Every game from Steinitz–Zukertort 1886 to
  Gukesh–Ding 2024, searchable, with playback at five speeds, a scrubber, arrow-key
  stepping, and a clickable move list.
- **Eighteen famous games**, listed under the names people know them by — the
  Immortal, the Evergreen, the Opera Game, the Game of the Century, Kasparov's
  Immortal. Searchable by nickname.
- **Save your own games.** A "Save game" button appears in the game-over banner
  and in the actions row while you play — deliberately not automatic, so the
  library stays free of three-move abandonments. They land under **My games**,
  which is the only place they can be deleted from.
- **Two libraries, kept apart.** **Titles** is the 2,987 bundled championship
  games — read-only, there to search and replay. **My games** is what you
  played or imported. They are separate because the rules are: only your games
  can be deleted, exported, or added to.
- **Import and export PGN** from **My games**. Import reads anything a
  chess program writes, up to 128 MB, and rejects games it already holds. Export
  writes the games you played or imported to a file — the only thing that
  survives clearing site data. See
  [docs/ARCHITECTURE-AND-REVIEW.md §5](docs/ARCHITECTURE-AND-REVIEW.md#5-pgn-import-export-and-where-files-come-from)
  for both, and for where to find PGN files worth importing.

## Your games: saving, exporting, importing

### Saving a game

Press **Save game** — it sits in the actions row while you play, and in the
game-over banner afterwards. It turns to **Saved ✓**. Saving is deliberately not
automatic, so the library stays free of three-move abandonments.

Saved games appear at the top of the archive, badged, and only they can be
deleted.

### Exporting your games to a file

**My games → Export my games**. That downloads
`my-chess-games.pgn`.

The file holds the games you **played or imported**, oldest first — not the
championship collections, which ship with the app and need no backup. If you
have not saved anything yet, it says so rather than writing an empty file.

The games are written exactly as they were stored, so nothing is lost in
translation: open the file in any chess program, or import it back here.

> **"Insecure download blocked"?** Running locally, the app is served over
> `http://localhost`, and Chrome flags every download from a non-HTTPS address
> that way whatever the file is. The PGN was generated by your own browser from
> your own library and never went near the network. Click **Keep**. The warning
> goes away once the app is served over HTTPS.

**Export is the only real backup.** The library lives in your browser's private
storage, so clearing site data removes it, and no amount of storage permission
prevents that. A file on your disk is the one copy that survives.

### Importing PGN

**My games → Import PGN**, then choose a `.pgn` file. Anything
a chess program can write will load, up to 128 MB per file.

Re-importing the same file is safe — the app fingerprints every game and refuses
one it already holds, then reports how many were actually added rather than how
many you handed it. Your original file is never altered.

Places to find games worth importing: [pgnmentor.com](https://www.pgnmentor.com)
for player and tournament collections, the
[Lichess database](https://database.lichess.org) for monthly dumps (split them
first — they are far past 128 MB), [TWIC](https://theweekinchess.com) for weekly
bulletins, or your own game history exported from Lichess or Chess.com.

Two much larger collections are built but not shipped, because they would burden
every visitor with games nobody asked for. After `npm run build-library` they
wait in `library/` for you to import by hand: `optional-careers.pgn` (107,352
games) and `optional-elite-tournaments.pgn` (20,225).

## Honest limitations

Worth reading before trusting anything the app displays.

- **Replay clocks are simulated — for historical games.** Per-move clock times
  were never recorded for them: of the 2,987 championship games, **zero** carry
  `[%clk]` annotations. The replay clock estimates those by spending each
  stage's budget at an even pace, and labels itself "Simulated" wherever it
  appears. Games *you* play are different — the app records the clock with each
  move and writes it as `[%clk]`, so your own games replay with genuine times
  and are labelled "as recorded". Nothing is ever presented as record when it
  isn't.
- **Saved games live in your browser, not in the cloud.** The library is stored
  in the browser's private filesystem, per-profile. It does not sync between
  devices, and clearing site data removes it. If storage is unavailable — a
  private window, or a second tab already holding the library — the app says so
  before you save rather than losing the game quietly.
- **The famous-games list is deliberately short.** Thirty were attempted; only
  the eighteen that could be pinned to one specific game were kept. These
  players met many times, and each plausible tie-break — first match, longest
  game — was observed attaching a famous name to the wrong moves. Anything that
  could not be identified beyond doubt was dropped and is reported by the fetch
  script. A mislabelled Immortal Game is worse than a missing one.
- **"White won" without a reason.** A PGN records the result, not whether the
  loser resigned or lost on time, so decisive archived games say only who won
  unless the final position is actually checkmate.
- **Flag falls always lose.** FIDE 6.9 draws the game if the opponent has no
  material to mate with. Not implemented; running out of time always loses.
- **The ratings on the difficulty levels are the engine's own estimate.** They
  come from Stockfish's `UCI_Elo` target, not from a guess mapped off its skill
  dial — but they are still what the engine believes about itself, not a FIDE
  rating earned over a board. Stockfish will not aim below 1320, which is already
  well above a beginner, so the easiest level leans on a shallow depth cap for the
  rest. Maximum quotes no figure at all: unlimited strength has none, and what it
  reaches depends on the machine and the time it is given.

## Architecture

Four layers, dependencies pointing inward only. Nothing in `domain/` or
`application/` imports React, chess.js, or Stockfish.

```
domain/         Pure model — Position, Move, Clock, TimeControl, GameOutcome
application/    Use cases — LiveGame, ReplaySession, Opponent
infrastructure/ Adapters — chess.js, Stockfish worker, PGN parsing, timers
presentation/   React
composition/    The one place that names concrete classes
```

[docs/](docs/) goes further, one question per document:

| | |
| --- | --- |
| [FLOWS.md](docs/FLOWS.md) | Component wiring, the turn loop, threads, and one game traced from **Start** to a stored result |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | The schema with its entity diagram, where the database lives, how a row gets written |
| [LESSONS-LEARNED.md](docs/LESSONS-LEARNED.md) | What broke, what actually caused it, and the wrong explanations that looked right first |
| [ARCHITECTURE-AND-REVIEW.md](docs/ARCHITECTURE-AND-REVIEW.md) | The security review, and where the design honours SOLID and Clean Architecture — and where it does not, with reasons |
| [SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md) | What the build enforces, and how to audit it |
| [UI-REDESIGN.md](docs/UI-REDESIGN.md) | What the presentation rewrite changed on each screen, what it left alone, and what was actually verified |
| [UI-ARCHITECTURE.md](docs/UI-ARCHITECTURE.md) | Which UI abstractions were added, which were refused, and what each choice bought |

### Where the abstractions earn their keep

Four ports, chosen because each pays for itself:

- **`Opponent`** — the one the design turns on. `HumanOpponent` and
  `EngineOpponent` satisfy the same contract, so `LiveGame` runs a single turn
  loop instead of a branch per game mode. A person's move resolves a pending
  promise; the engine's resolves from a worker. A networked opponent would be a
  third implementation and the loop would not change.
- **`ChessRules`** — wraps chess.js. Swappability is the least of it: chess.js
  is a *mutable stateful* object, and the port converts it into position-in /
  position-out calls so live play, replay, and analysis cannot corrupt each
  other's board.
- **`Ticker`** — clocks wired to `Date.now()` are untestable. Behind this port a
  test advances five minutes instantly and asserts on flag fall. The clock tests
  run in 5 ms.
- **`GameArchive` / `GameStore`** — reading and writing the library, kept as two
  interfaces so browsing screens are never handed the ability to delete. One
  SQLite adapter implements both.

### Where it was deliberately not applied

No DI container — a plain `createAppServices()` function is enough. No
repository wrapper over React state. No interface for single-implementation
classes. No CQRS, event sourcing, or mediator. Those would be ceremony at this
size.

### Some specific decisions

- `Clock` is immutable and knows nothing about wall time; callers advance it by
  an elapsed duration. That is what lets live play and replay simulation reuse
  one implementation.
- A blitz control and a 1927 adjournment control are the same shape — a list of
  stages — so `Clock` has no branch per format.
- `GameOutcome` is a discriminated union, so a drawn checkmate or a winner on a
  draw cannot be constructed.
- The archive indexes games from their tags and only plays out the moves of the
  one you open. Indexing 2,987 games takes milliseconds; parsing them all would
  take seconds and throw the result away.
- **SQLite runs in a worker, and had to.** `createSyncAccessHandle` — the API
  the persistent storage backend is built on — exists only in worker scope; on
  the main thread it is `undefined` and nothing could ever be saved. Keeping
  queries off the main thread is a welcome side effect, not the reason.
- **The database has no `move` table.** PGN already encodes per-move clock times
  as `[%clk]`, which the replay code already reads, so writing your games as PGN
  makes them replay with real clocks through machinery that already exists. A
  move table would mean ~230,000 rows and a second source of truth competing
  with the PGN, for no capability the app needs.
- The one-time import happens on the first visit that finds the table empty:
  roughly two seconds once, then under a second on every later launch. Each
  collection is tracked separately, so adding one later does not re-import the
  rest.
- **Schema changes rebuild the table and carry your own games across.** The
  bundled collections are re-importable, so only games you played are
  irreplaceable. A version bump must never cost someone a game.
- Stockfish runs in a worker because search is CPU-bound and would otherwise
  freeze the board on every move it thinks about.

## Testing

494 tests covering the clock (increments, stage transitions, flag fall), the turn
loop (checkmate, timeout, resignation, illegal-move rejection, late moves after
the game ends), rules adaptation, PGN parsing, import limits, player identity,
replay stepping and clock alignment, the archive's query and paging rules,
federation matching, and archive first-load recovery.

Presentation components are tested by rendering through `react-dom/server` and
asserting on the markup; CSS geometry deliberately is not. Those tests live in
`.tsx` files, so vitest's `include` pattern covers `.test.tsx` as well as
`.test.ts`. It once covered only the latter, and two component tests sat unrun
for their whole existence while the suite reported green.

Four more checks run in a real browser against the built app: `smoke-test`
(the bundle stands up and Stockfish answers), `layout-check` (every screen at
four widths), `behaviour-check` (paging, searching, sorting and the rest
actually work), and `a11y-check` (axe-core, WCAG 2.1 AA). They exist because a
suite that renders to static markup cannot see anything an effect does — which
is where this project's expensive faults have lived.

**[docs/TESTING.md](docs/TESTING.md)** covers all of it: how to run each check,
how to write one, why Playwright rather than jsdom (and how to add jsdom
anyway), and what is deliberately not covered.

Two of them guard the architecture rather than behaviour. `architecture.test.ts`
asserts the dependency rule — each layer imports only itself or inward, outer
libraries stay out of `domain/` and `application/`, and only the composition root
constructs adapters — with any accepted exception listed in the test beside its
reason. `gameKey.test.ts` holds the app's game-identity function and the build
scripts' copy of it to identical output, since a script cannot import TypeScript
behind path aliases and the two drifting apart would be silent.

`bundledLibrary.test.ts` runs against the real game files rather than a tidy
fixture — historical PGN is messy, and that is the test that catches the game
nobody imagined. It skips itself when those files have not been generated, so an
absent library reports as skipped rather than as a broken one.

A tracked `.githooks/pre-commit` runs typecheck and tests before a commit is
written. Enable it once per clone — git will not do it for you:

```bash
git config core.hooksPath .githooks
```

`npm run verify` runs the same two checks plus `npm audit`, which the hook leaves
out because committing should not require network.

## The game library

Games go through a pipeline before the app ever sees them:

```
public/games/raw/   downloaded, untouched
        |  build-library: replay every move, drop duplicates
        v
public/games/       what the app loads     library/   the same files, for you
```

`build-library` replays every move of every game through the rules engine and
discards any that will not play out. Where two records describe the same game,
the more complete one wins — judged on how far the moves run, whether the result
is recorded, and how much is known about the event.

Duplicate detection compares the moves, and requires one game's moves to be a
*prefix* of the other's. An earlier version keyed on the opening instead and
reported 253 duplicates that were nothing of the sort: players in a title match
repeat the same line for fifteen moves or more before diverging. The prefix test
cannot make that mistake — two different games diverge, and after that neither is
a prefix of the other.

Current state, confirmed by `npm run audit-library`:

| | |
| --- | --- |
| Games | 2,987 across 3 non-overlapping files |
| Coverage | 1886 to 2024 — every title match |
| Unplayable | 0 — every one replayed, 256,826 half-moves |
| Duplicates | 0 identical, 0 truncated |

The database enforces it too: every bundled game carries a fingerprint under a
unique index, so re-importing a file it already holds adds nothing. Games you
played are exempt from that constraint — two short games of your own would
otherwise look identical.

## Data and storage

**The finished collections are committed; everything else generated is not.**
`public/games/` holds the three cleaned PGN files and the federation lookup —
about 2 MB, and the repository packs to well under that. The raw downloads
(`public/games/raw/`), the hundred-megabyte career archives, and
`public/engine/` all stay out.

That split was a deliberate reversal. Previously every clone, dev start and
deploy pulled roughly a hundred megabytes from two third-party hosts to
reconstruct two megabytes of files — which meant whoever controlled those hosts
controlled the content of every build, and a bad day for either broke ours.
Committing the result removed them from the build path. See
[docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md).

- **Championship games** come from the public
  [Chess-Dataset](https://github.com/mainali123/Chess-Dataset) repository,
  cleaned by `npm run build-library` into
  `public/games/world-championship-knockout.pgn` and
  `world-championship-title-matches.pgn`. Those files are committed, so a
  build does not refetch them. Game move scores are factual records.
- **Title matches since 2008** are pulled from the Anand, Carlsen, Ding, and
  Gukesh collections by `npm run fetch-modern` — between them those four played
  in every match from 2010 to 2024. Games are identified by their event tag, not
  by guessing who played whom.
- **Famous games** are extracted from per-player collections on
  [pgnmentor.com](https://www.pgnmentor.com) by `npm run fetch-famous`, which
  locates each one by its players, year, and result.
- **Stockfish 18**, the `lite-single` build (GPL-3.0), is copied out of
  `node_modules` into `public/engine/` — 7.3 MB. The package ships four builds;
  the threaded ones need COOP/COEP headers this app deliberately does not set,
  and the full-net ones are 113 MB. See `scripts/copy-engine.mjs`.
- **The engine's licence ships with it.** Stockfish is GPL-3.0 and is served to
  every visitor, not merely used at build time, so `copy-engine` puts
  `LICENSE-stockfish.txt` and a source notice beside the binaries. It refuses to
  run if the upstream licence file is missing rather than quietly shipping GPL
  code without it. Everything else in the tree is MIT, BSD-2-Clause or
  Apache-2.0.
- **The database is never a file in this project.** It is created inside the
  browser's Origin Private File System on first visit — per origin, per browser
  profile, on the user's own machine. There is no `.sqlite` in the repo, the
  build output, or the deploy.

One rule worth stating plainly, for whoever works on this next:

> **Anything shipped to the browser is public.** The database is downloaded to
> the user's machine and readable with any SQLite tool. Credentials, tokens, and
> connection strings can never live here — that is a server-side concern, and
> this app has no server.

The upstream dataset repository moving or disappearing no longer breaks the
build — that is precisely what committing the cleaned collections fixed.
Regenerating them from scratch still needs those sources, but nothing on the
critical path does.

## Security

No server, no accounts, no personal data leaving the browser — so the real
exposure is the path from source to CDN, not a backend that does not exist.

- [SECURITY.md](SECURITY.md) — threat model, and how to report a vulnerability
  privately.
- [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md) — what the pipeline enforces,
  why, how to audit it, and the mistakes that would quietly undo it.

Briefly: merging to `main` requires the full gate to pass, dependencies install
from a committed lock rather than being re-resolved, every GitHub Action is
pinned to a commit SHA, and the whole history is scanned for secrets on every
run.
