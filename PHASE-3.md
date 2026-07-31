# ClaudeChess Phase 3 — UX hardening and remaining-screen completion

Phase 3 starts from the uploaded `feature/ui-redesign` snapshot and completes the presentation work as one cohesive package. It preserves the existing domain, application, infrastructure, composition, engine, archive, and board behavior.

## Included

- Structural New Game layout correction
  - `Start game` is inside the right-hand **Game settings** panel.
  - It spans only that panel.
  - The settings list scrolls internally on short desktop viewports while the action remains visible.
  - Mobile returns to normal document flow so no settings are clipped.
- Shared accessible `ScreenHeader` used by setup, puzzle, archive, and replay screens.
- Skip link and improved collapsed-navigation labels in `AppShell`.
- Completed Replay redesign with:
  - board-first responsive layout
  - accessible transport controls
  - scrubber and speed controls
  - keyboard shortcuts that ignore interactive/editable controls
  - recorded-versus-estimated clock disclosure
- Championship archive hardening with:
  - shared header treatment
  - accessible search naming and live result count
  - consistent filter, table, and preview surfaces
  - removal of a duplicated menu guard
- Final responsive and reduced-motion rules in `phase3.css`.
- A server-rendered component test for the shared header.

## Files added

```text
src/presentation/components/ScreenHeader.tsx
src/presentation/components/ScreenHeader.test.tsx
src/presentation/phase3.css
PHASE-3.md
PHASE-3-VALIDATION.md
docs/PHASE-3-TRADEOFFS.md
```

## Files updated

```text
src/presentation/App.tsx
src/presentation/components/AppShell.tsx
src/presentation/screens/NewGameScreen.tsx
src/presentation/screens/PlayScreen.tsx
src/presentation/screens/PuzzleScreen.tsx
src/presentation/screens/ArchiveScreen.tsx
src/presentation/screens/ReplayScreen.tsx
```

## Deliberately unchanged

- `src/presentation/components/ChessBoardView.tsx`
- `react-chessboard` v5.10.0 and its prop/lifecycle contract
- domain rules and value objects
- application use cases and ports
- Stockfish worker behavior
- SQLite archive behavior and schema
- PGN parsing, writing, import, export, and bundled library data
- Vite bootstrap and root `index.html`

## Apply

This ZIP is a complete runnable source package. Extract it into a clean `feature/ui-redesign` working tree, replacing matching files. Generated `dist`, dependency folders, and raw PGN build workspaces are intentionally excluded.

Run:

```powershell
npm ci
npm run verify
npm run build
git diff --check
npm run dev
```

Suggested commit:

```powershell
git add .
git commit -m "feat(ui): complete phase 3 experience hardening"
git push origin feature/ui-redesign
```
