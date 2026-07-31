# ClaudeChess Phases 4–6 — final presentation package

This package starts from the complete Phase 3 source and finishes the remaining
presentation roadmap as one cohesive delivery. It includes the earlier Phase 2
and Phase 3 work, so no previous ZIP or CSS patch is required.

## Phase 4 — layout polish

- Rebalanced the desktop application shell and compact rail.
- Added a viewport-aware workspace that fits the setup, play, puzzle, replay,
  and archive screens at common desktop sizes.
- Kept board regions square without changing the `react-chessboard` v5 sizing
  contract.
- Gave long settings, move lists, filters, and side panels their own bounded
  scrolling instead of scrolling the whole desktop application.
- Replaced the small-screen top rail with an accessible bottom navigation bar.
- Added short-height rules for 1366×768-class displays.
- Preserved normal document flow on phones and tablets so content is never
  clipped merely to satisfy a desktop no-scroll target.

## Phase 5 — screen-by-screen polish

### Application shell

- Context-aware top-bar titles for setup, live play, puzzle, archive, loading,
  error, and replay views.
- Consistent vector icons without an additional third-party dependency.
- Clear active navigation indicator and improved compact/mobile labels.

### New Game

- Structured five-step settings treatment with concise descriptions.
- Live board orientation badge and clearer selection feedback.
- Consolidated selection summary immediately above the primary action.
- **Start game remains inside the right Game Settings panel and spans only that
  panel.**

### Live Play

- Added game metadata, move number, orientation, and a persistent status strip.
- Improved board controls and action labels.
- Refined clock, move history, completion banner, and action hierarchy.

### Puzzle

- Added a visual combination/progress model.
- Improved loading, error, wrong-move, hint, and solved states.
- Added a non-blocking solved badge and clearer puzzle metadata.

### Championship Archive

- Added live result, loaded-game, and active-filter metrics.
- Improved search focus, row selection, preview, and replay-action hierarchy.
- Preserved all existing search, filtering, import, export, paging, and keyboard
  behavior.

### Replay

- Added replay progress context, improved transport icons, a progress-filled
  scrubber, and clearer recorded-versus-estimated clock presentation.
- Preserved the existing keyboard shortcuts and `ReplaySession` behavior.

## Phase 6 — motion and interaction refinement

- Added restrained screen, panel, board, selection, loading, solved, low-time,
  and status transitions.
- Motion changes opacity and surface presentation only; it does not delay or
  remount the chessboard.
- Added hover, press, focus, disabled, and active states across the shared UI.
- Added a comprehensive `prefers-reduced-motion` fallback.

## Files added

```text
src/presentation/components/AppIcon.tsx
src/presentation/components/AppIcon.test.tsx
src/presentation/phase4-6.css
PHASES-4-6.md
PHASES-4-6-VALIDATION.md
docs/PHASES-4-6-TRADEOFFS.md
```

## Files updated

```text
src/presentation/App.tsx
src/presentation/components/AppShell.tsx
src/presentation/components/OutcomeBanner.tsx
src/presentation/components/ScreenHeader.tsx
src/presentation/screens/NewGameScreen.tsx
src/presentation/screens/PlayScreen.tsx
src/presentation/screens/PuzzleScreen.tsx
src/presentation/screens/ArchiveScreen.tsx
src/presentation/screens/ReplayScreen.tsx
docs/README.md
```

## Deliberately unchanged

- `src/presentation/components/ChessBoardView.tsx`
- `react-chessboard` v5.10.0 and its `options`-based API
- the board's first-commit mount and measurement protection
- domain rules and value objects
- application use cases and ports
- Stockfish worker behavior
- SQLite archive behavior and schema
- PGN parsing, writing, import, export, and bundled data
- composition-root wiring
- `package.json`, `package-lock.json`, `vite.config.ts`, and `index.html`

## Apply

Extract this ZIP into a clean `feature/ui-redesign` working tree, replacing
matching files. The ZIP is complete; do not apply any earlier Phase 2 or Phase 3
ZIP on top of it.

```powershell
npm ci
npm run verify
npm run build
git diff --check
npm run dev
```

If Windows reports `EPERM` while deleting a native Rolldown binding, close the
Vite server and editors using Node, stop the locked Node process, remove
`node_modules`, and run `npm ci` again.

Suggested commit:

```powershell
git add .
git commit -m "feat(ui): complete phases 4 through 6 polish"
git push origin feature/ui-redesign
```
