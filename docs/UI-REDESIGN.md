# The UI redesign

What the presentation rewrite changed, screen by screen, what it deliberately
left alone, and what was actually verified.

The companion document is
[UI-ARCHITECTURE.md](UI-ARCHITECTURE.md), which answers the other question:
which abstractions the redesign added, which it refused, and why.

## How it arrived

The redesign was delivered as three successive source packages — Phase 2,
Phase 3, and Phases 4–6 — each a complete tree rather than a patch on the last.
Each package carried its own README and validation report, six files in all at
the repository root. Those are consolidated here; their apply instructions
("extract this ZIP into a clean working tree", suggested commit commands) were
specific to that hand-off and are **historical, not instructions to follow.**
The work is merged.

The phase numbering is kept because the commits, the stylesheets, and the
trade-off records all use it. Phase 1 was the original board work that predates
this sequence.

## Phase 2 — the shell and the first two screens

Introduced the application chrome and rebuilt the two board screens on it.

- `AppShell` — visual chrome and navigation, receiving navigation intent by
  callback.
- `App` retained screen selection and the disposal of game and replay
  resources.
- `PlayScreen` and `PuzzleScreen` rebuilt on the shared shell.
- `phase2.css` — design tokens, shell layout, panel surfaces, board frames,
  headings, status pills, responsive breakpoints, focus and reduced-motion
  behaviour, as one additive stylesheet imported after `styles.css`.

**New Game viewport.** The setup screen was changed to use the available
desktop viewport instead of extending the page vertically: a compact two-column
arrangement where space permits, secondary descriptions collapsing before the
screen itself scrolls, and tablet and mobile returning to normal document flow
so nothing is clipped. No `NewGameScreen` logic or component contract changed.

**Superseded within the sequence.** Phase 2 first placed the `Start game`
button spanning the full bottom of the screen. Phase 3 corrected this: the
button is structurally a child of the right-hand Game settings panel and spans
only that panel. The Phase 3 arrangement is the one that shipped.

## Phase 3 — accessibility and the remaining screens

- **`ScreenHeader`** — one shared, accessible page-heading component, used by
  setup, puzzle, archive, and replay.
- **Skip link** and improved collapsed-navigation labels in `AppShell`.
- **Start game relocated** into the Game settings panel, as above. The settings
  list scrolls internally on short desktop viewports while the action stays
  visible; mobile returns to normal document flow.
- **Replay completed** — board-first responsive layout, accessible transport
  controls, scrubber and speed controls, keyboard shortcuts that ignore
  interactive and editable controls, and recorded-versus-estimated clock
  disclosure.
- **Archive hardened** — shared header treatment, accessible search naming, a
  live result count, consistent filter/table/preview surfaces, and the removal
  of a duplicated menu guard.
- `phase3.css` for the final responsive and reduced-motion rules.
- The first presentation test: a server-rendered check of `ScreenHeader`.

## Phases 4–6 — polish and motion

### Phase 4, layout

Rebalanced the desktop shell and compact rail. Added a viewport-aware workspace
fitting setup, play, puzzle, replay, and archive at common desktop sizes. Board
regions stay square without touching the `react-chessboard` v5 sizing contract.
Long settings, move lists, filters, and side panels get their own bounded
scrolling rather than scrolling the whole application. The small-screen top rail
became an accessible bottom navigation bar. Short-height rules were added for
1366×768-class displays. Phones and tablets keep normal document flow — content
is never clipped merely to satisfy a desktop no-scroll target.

### Phase 5, screen by screen

- **Shell** — context-aware top-bar titles for setup, live play, puzzle,
  archive, loading, error, and replay; consistent vector icons via `AppIcon`
  with no new third-party dependency; a clear active-navigation indicator.
- **New Game** — a structured five-step settings treatment with concise
  descriptions, a live board-orientation badge, clearer selection feedback, and
  a consolidated selection summary immediately above the primary action.
- **Live Play** — game metadata, move number, orientation, and a persistent
  status strip; refined clock, move history, completion banner, and action
  hierarchy.
- **Puzzle** — a visual combination/progress model; improved loading, error,
  wrong-move, hint, and solved states; a non-blocking solved badge.
- **Archive** — live result, loaded-game, and active-filter metrics; improved
  search focus, row selection, preview, and replay-action hierarchy. All
  existing search, filtering, import, export, paging, and keyboard behaviour
  preserved.
- **Replay** — replay progress context, improved transport icons, a
  progress-filled scrubber, clearer recorded-versus-estimated clock
  presentation. Existing keyboard shortcuts and `ReplaySession` behaviour
  preserved.

### Phase 6, motion

Restrained screen, panel, board, selection, loading, solved, low-time, and
status transitions. **Motion changes opacity and surface presentation only — it
never delays or remounts the chessboard.** Hover, press, focus, disabled, and
active states across the shared UI, with a comprehensive
`prefers-reduced-motion` fallback.

## Deliberately unchanged

Constant across all three phases, and worth keeping constant:

- `src/presentation/components/ChessBoardView.tsx` — byte-for-byte unchanged
  through every phase.
- `react-chessboard` v5.10.0, its `options`-based API, and the board's
  first-commit mount and measurement protections.
- Domain rules and value objects.
- Application use cases and ports.
- Stockfish worker behaviour.
- SQLite archive behaviour and schema.
- PGN parsing, writing, import, export, and the bundled library data.
- Composition-root wiring, `vite.config.ts`, and `index.html`.

The board exclusion is the load-bearing one. Deferring the board mount, keying
it to force remounts, animating its dimensions, or reaching into
react-chessboard's internal DOM would reopen the mount-timing failure recorded
in [LESSONS-LEARNED.md](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end).

## What was verified, and what was not

**Each phase's validation report was explicit that the repository's own gate
never ran.** The container producing the packages had an npm mirror that did not
serve all locked packages — `why-is-node-running`, `@sqlite.org/sqlite-wasm`,
`vitest`, and `tslib` among them — so `npm ci`, `npm run verify`, and the Vite
production build could not execute. No successful build was claimed.

What the packages *did* check, with the container's own TypeScript compiler and
static scans:

- TypeScript/TSX parse and strict validation across all source and test files.
- CSS parse for `styles.css`, `phase2.css`, `phase3.css`, and `phase4-6.css`.
- Clean Architecture dependency scan across the non-test sources, retaining only
  the documented `useFederations` exception.
- `react-chessboard` pinned at v5, and `ChessBoardView.tsx`, `package.json`,
  `package-lock.json`, `vite.config.ts`, and `index.html` byte-for-byte
  unchanged from their baselines.
- Structural verification that the only `setup__start` button is nested inside
  `setup__settings` → `setup__actions`.
- Reduced-motion coverage for every new looping or entrance animation.
- Merge-conflict marker, credential-pattern, forbidden-artifact, and whitespace
  scans.

**The gate has since been run** on the merge, and it passes: typecheck clean,
the full suite green, `npm audit` reporting no vulnerabilities.

That run also caught what the static checks could not. `vite.config.ts`
included only `src/**/*.test.ts`, so `AppIcon.test.tsx` and
`ScreenHeader.test.tsx` — both written as part of this redesign — had never
executed. A `.ts`-only pattern skips `.tsx` silently: the suite still passes,
just without them. The pattern now covers both, and `AppShell` gained the tests
it never had.

### Browser QA still worth doing

Layout is not unit tested, by choice
([UI-ARCHITECTURE.md](UI-ARCHITECTURE.md#verification-boundary) explains why).
The phases asked for manual checks at 1366×768, 1920×1080, 2560×1440, tablet
and phone widths, Windows display scaling at 125% and 150%, and with
reduced-motion enabled. The board should render immediately on setup, live play,
puzzle, archive preview, and replay — never deferred or remounted to obtain a
size.
