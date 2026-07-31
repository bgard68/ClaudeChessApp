# ClaudeChess Phase 2 — Full presentation redesign

Source baseline: public `feature/ui-redesign` branch.

## Included

- `src/presentation/App.tsx`
- `src/presentation/components/AppShell.tsx`
- `src/presentation/screens/PlayScreen.tsx`
- `src/presentation/screens/PuzzleScreen.tsx`
- `src/presentation/phase2.css`

## Deliberately unchanged

- `ChessBoardView.tsx`
- `react-chessboard` v5
- Board prop contract and lifecycle
- Domain/application/infrastructure/composition layers
- Archive querying, filtering, import/export, and replay logic
- Game, puzzle, clock, engine, storage, and PGN behavior

The championship screen is modernized through the shared shell and additive CSS.
Its 900+ line behavior-heavy component is intentionally not duplicated or
refactored merely to satisfy a visual change.

## Apply

Copy the included `src` folder over the repository root on
`feature/ui-redesign`. The new `phase2.css` is imported by `App.tsx`; do not
replace the original `styles.css`.

Run:

```powershell
npm run typecheck
npm test
npm run build
git diff --check
npm run dev
```

Suggested commit:

```powershell
git add src/presentation
git commit -m "refactor(ui): implement phase 2 application redesign"
```

## Architecture decisions

- `App` retains navigation and resource disposal.
- `AppShell` owns visual chrome only and receives navigation intent by callback.
- Play and Puzzle retain their existing use cases and state transitions.
- Shared visual rules live in one additive stylesheet to avoid duplicating
  screen-specific token values.
- No new abstraction was introduced for one-off content blocks.

## New Game viewport adjustment

The setup screen now uses the available desktop viewport instead of extending
the page vertically:

- The existing board preview and settings remain unchanged functionally.
- Settings use a compact two-column arrangement where space permits.
- The existing `Start game` button spans the full bottom of the screen.
- At shorter desktop heights, secondary choice descriptions collapse before
  the screen itself needs to scroll.
- Tablet and mobile layouts return to normal document flow so content remains
  accessible rather than being clipped.

No `NewGameScreen.tsx` logic or component contract was changed.


### Button layout correction
The Start Game button remains inside the options panel and spans only that panel. It is pinned to the bottom of the right-hand panel on desktop while preserving the compact no-scroll layout.
