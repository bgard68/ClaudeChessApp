# Phases 4–6 validation report

Validation was performed against the complete source package before it was
zipped.

## Passed

- Strict TypeScript validation of every changed presentation component and its
  local dependencies using the container's TypeScript compiler.
- TypeScript/TSX parse and strict validation across all 102 source and test
  files with validation declarations for unavailable external packages.
- CSS parsing for `styles.css`, `phase2.css`, `phase3.css`, and
  `phase4-6.css` with zero parser errors.
- Clean Architecture dependency scan across 83 non-test source files.
- `react-chessboard` remains on v5 (`^5.10.0`).
- `ChessBoardView.tsx` is byte-for-byte unchanged from the Phase 3 baseline.
- `package.json`, `package-lock.json`, `vite.config.ts`, and `index.html` are
  byte-for-byte unchanged from the Phase 3 baseline.
- Structural verification that `setup__start` remains nested inside
  `setup__settings` → `setup__actions`.
- Reduced-motion coverage for every new looping or entrance animation.
- Merge-conflict marker scan.
- Credential-pattern, forbidden-artifact, and temporary-file scan.
- Whitespace and line-ending check for every changed Phase 4–6 file.

## Authoritative local gate still required

The container could not run the repository's exact `npm ci`, Vitest suite, npm
audit, or Vite production build because its configured npm mirror does not
serve all locked public packages. No successful npm build is claimed here.

Run the authoritative gate on your normal npm connection after extraction:

```powershell
npm ci
npm run verify
npm run build
git diff --check
```

Then perform browser QA at minimum at:

- 1366×768
- 1920×1080
- 2560×1440
- tablet width
- phone width
- Windows display scaling at 125% and 150%
- reduced-motion enabled

The board should render immediately on setup, live play, puzzle, archive
preview, and replay. It should never be deferred or remounted to obtain a size.
