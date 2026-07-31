# ClaudeChess Phase 2 — Consolidated UI release

This package is the complete Phase 2 presentation release built from the uploaded
`feature/ui-redesign` snapshot. It replaces the earlier incremental ZIPs. No
previous Phase 2 package or CSS patch is required.

## What is included

- Shared application shell and responsive navigation
- New Game redesign
- Live Play redesign
- Puzzle of the Day redesign
- Championship Archive visual redesign
- Championship Replay redesign
- One consolidated Phase 2 stylesheet
- Architecture and trade-off documentation

The package includes the complete project source so the Phase 2 files are not
separated from the branch state they were built against.

## New Game correction

The **Start game** button is structurally inside the right-hand **Game settings**
panel:

- It spans only the settings panel.
- It does not span the bottom of the application window.
- It is separated from the settings by the panel's own footer and border.
- The desktop page uses the available viewport without introducing document
  scrolling. On short displays, only the settings list may scroll inside its
  panel so the board and primary action remain visible.

This is a JSX layout change in `NewGameScreen.tsx`, not another CSS positioning
workaround.

## react-chessboard v5

The project remains on:

```json
"react-chessboard": "^5.10.0"
```

`ChessBoardView.tsx` and its lifecycle protections remain unchanged. In
particular, the board still mounts on the component's first commit and receives
memoized v5 options, preserving the behavior documented in
`docs/LESSONS-LEARNED.md`.

## Architecture boundaries

Phase 2 changes stay in `src/presentation` and documentation. They do not alter:

- domain rules or chess entities
- application use cases
- engine, SQLite, PGN, or clock adapters
- composition-root wiring
- storage, puzzle generation, replay, or game behavior

Detailed SOLID, Clean Architecture, DRY, DIP, and SRP decisions—including
intentional trade-offs—are documented in
[`docs/PHASE-2-UI-ARCHITECTURE.md`](docs/PHASE-2-UI-ARCHITECTURE.md).

## Primary files changed

```text
src/presentation/App.tsx
src/presentation/components/AppShell.tsx
src/presentation/screens/NewGameScreen.tsx
src/presentation/screens/PlayScreen.tsx
src/presentation/screens/PuzzleScreen.tsx
src/presentation/screens/ArchiveScreen.tsx
src/presentation/screens/ReplayScreen.tsx
src/presentation/phase2.css
PHASE-2.md
docs/PHASE-2-UI-ARCHITECTURE.md
docs/README.md
PHASE-2-VALIDATION.md
```

## Verification

Run from the repository root:

```powershell
npm ci
npm run typecheck
npm test
npm run build
git diff --check
npm run dev
```

Recommended visual checks:

- 2560×1440 desktop
- 1920×1080 desktop
- 1366×768 laptop
- 768px tablet
- 390px mobile
- keyboard focus and reduced-motion preference

## Suggested commit

```powershell
git add src/presentation PHASE-2.md docs

git commit -m "refactor(ui): consolidate phase 2 presentation redesign"
```
