# Phase 3 validation report

Validation was performed against the complete source package before it was zipped.

## Passed

- TypeScript/TSX syntax parse across every file under `src`.
- Targeted strict TypeScript validation of all changed Phase 3 components and their local dependencies.
- CSS parse for `styles.css`, `phase2.css`, and `phase3.css`.
- Clean Architecture dependency scan across 82 non-test source files.
- Structural verification that the only `setup__start` button is nested inside:
  - `setup__settings`
  - `setup__actions`
- `react-chessboard` remains on v5 (`^5.10.0`).
- `ChessBoardView.tsx` is byte-for-byte unchanged from the uploaded baseline.
- `index.html` and `package.json` are byte-for-byte unchanged from the uploaded baseline.
- All baseline files under `src`, `scripts`, `public`, and `docs` are present.
- Runtime Stockfish and bundled game assets are present.
- Merge-conflict marker scan.
- Credential-pattern and forbidden-artifact scan.
- Whitespace/diff check for every Phase 3 file.

## Environment limitation

The container could not complete `npm ci`, and therefore could not run the repository's exact `npm run verify` or Vite production build. The configured package mirror returned `404` responses for locked public packages including `why-is-node-running@2.3.0`, `vitest@4.1.10`, and `tslib@2.8.1`.

To avoid claiming a build that did not run, Phase 3 was instead checked with the globally available TypeScript compiler, local project types, external-package validation declarations, static architecture checks, and CSS parsing.

Run the authoritative gate after extraction on a normal npm connection:

```powershell
npm ci
npm run verify
npm run build
git diff --check
```

Then perform browser QA at 1366×768, 1920×1080, tablet width, and mobile width before merging.
