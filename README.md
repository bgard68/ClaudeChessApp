# Chess

A browser chess app: play a friend on one device or Stockfish locally, with or
without a clock, replay 2,850 World Championship games on the board, and keep
your own games in a local library.

No backend. Everything — rules, engine, clocks, and the SQLite game library —
runs client-side.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (copies the engine into `public/` first) |
| `npm run build` | Typecheck and produce `dist/` |
| `npm test` | Run the test suite |
| `npm run fetch-games` | Re-download the World Championship games |
| `npm run fetch-famous` | Re-extract the famous-games collection |
| `npm run fetch-modern` | Re-fetch title matches played since 2008 |
| `npm run build-library` | Validate, deduplicate, and write the collections |
| `npm run audit-library` | Independently re-check the built library |

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
  library stays free of three-move abandonments. Saved games sit at the top of
  the archive, badged, and only they can be deleted.
- **Import your own PGN** from the archive screen.

## Honest limitations

Worth reading before trusting anything the app displays.

- **Replay clocks are simulated — for historical games.** Per-move clock times
  were never recorded for them: of the 2,850 championship games, **zero** carry
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
- **Difficulty levels quote no Elo.** Difficulty comes from skill level and
  depth caps, so any rating printed beside those labels would be a guess. The
  Stockfish 18 build does expose `UCI_LimitStrength` and `UCI_Elo`, which would
  let the levels name a real rating — not wired up yet.

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
  one you open. Indexing 2,850 games takes milliseconds; parsing them all would
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

58 tests covering the clock (increments, stage transitions, flag fall), the turn
loop (checkmate, timeout, resignation, illegal-move rejection, late moves after
the game ends), rules adaptation, PGN parsing, and replay clock alignment.

`bundledLibrary.test.ts` runs against the real 1.9 MB game file rather than a
tidy fixture — historical PGN is messy, and that is the test that catches the
game nobody imagined.

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
| Games | 2,986 across 3 non-overlapping files |
| Coverage | 1886 to 2024 — every title match |
| Unplayable | 0 — every one replayed, 256,826 half-moves |
| Duplicates | 0 identical, 0 truncated |

The database enforces it too: every bundled game carries a fingerprint under a
unique index, so re-importing a file it already holds adds nothing. Games you
played are exempt from that constraint — two short games of your own would
otherwise look identical.

## Data and storage

**Nothing generated is committed.** Both `public/games/` and `public/engine/`
are gitignored, so the repository holds source only — no binaries, no datasets,
nothing to drift out of step with what produced it.

- **Championship games** come from the public
  [Chess-Dataset](https://github.com/mainali123/Chess-Dataset) repository and
  are merged into `public/games/world-championship.pgn` by `npm run
  fetch-games`. `prebuild` runs the same fetch, so a deploy pulls them once at
  build time. Game move scores are factual records.
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
- **The database is never a file in this project.** It is created inside the
  browser's Origin Private File System on first visit — per origin, per browser
  profile, on the user's own machine. There is no `.sqlite` in the repo, the
  build output, or the deploy.

One rule worth stating plainly, for whoever works on this next:

> **Anything shipped to the browser is public.** The database is downloaded to
> the user's machine and readable with any SQLite tool. Credentials, tokens, and
> connection strings can never live here — that is a server-side concern, and
> this app has no server.

If the upstream dataset repository ever moves or disappears, the build breaks.
Mirroring the PGN into storage you control is the durable fix.
