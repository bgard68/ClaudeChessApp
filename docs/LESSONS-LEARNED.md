# Lessons learned

Bugs that were found, what actually caused them, and what each one changed.
Kept as a document rather than as commit messages because the useful part is
rarely the fix — it is the wrong explanation that looked right first.

Most of these came out of review rather than from a bug report, which is the
argument for having done the review.

---

# From the code

These came out of the review rather than from a bug report, which is the
argument for having done it.

## A real World Championship game was missing

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

## The dev server bound IPv6-only

Vite was left to choose its own bind address and listened on `[::1]` alone. A
browser resolving `localhost` to `127.0.0.1` got connection refused while the
server was up and answering over IPv6 — so `curl` from a shell reported success
while the browser could not load the page. Fixed with `--host`; `--strictPort`
was added at the same time so a busy port fails loudly instead of drifting to
the next one and serving a different app than the preview expects.

## The test suite was not hermetic

`bundledLibrary.test.ts` called `readdirSync` at import time against
`public/games/`, which is generated. A worktree that had not fetched assets
failed the whole file and reported a *broken* library rather than an absent one —
and blocked the new pre-commit hook for an environment reason rather than a code
one, which is how a gate teaches people to reach for `--no-verify`. Now a
declared `describe.skipIf`, so vitest lists the checks as skipped and the gap
stays visible.

## Upstream data defects

- **Gelfand–Gareev, World Blitz 2019** — `Invalid move in PGN: Qxe1`. Corrupt
  move text upstream. One game in 130,565.
- **The career fetchers write duplicates** — 9,601 of them, because per-player
  collections are concatenated and a game between two listed players arrives
  twice. This is **deliberate and documented**: `build-library` scores competing
  records and keeps the better one, so deduplicating at fetch time would discard
  that ability. Harmless to the app because `game_key` is unique; it only makes
  the "games added" count on import misleading.

## react-chessboard 4 → 5: the migration, and a two-day dead end

### What the API change required

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

### The failure

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

### Remedies tried and ruled out

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

### Verified, and not

Verified: the board renders on the setup screen and in a live game, the engine's
reply appears, click-to-move plays, and drag-and-drop works. Not verified: the
promotion chooser, which needs a game to reach a seventh-rank pawn.

---

# From the build and the repository

These came out of a security pass on 2026-07-30. The controls they produced are
described in [SUPPLY-CHAIN.md](SUPPLY-CHAIN.md); what they *taught* is here.

## npm prunes the lock file to one platform

The deploy died on `@rolldown/binding-linux-x64-gnu` and
`@typescript/typescript-linux-x64`. The diagnosis reached for was
`npm/cli#4828` — "a lock written on Windows omits other platforms' bindings" —
and the fix applied was to delete the lock in CI and re-resolve from
`package.json`.

That worked, and it cost more than it looked. Re-resolving meant the deployed
build contained whatever npm picked at that second rather than the tree anyone
had reviewed, which is a supply-chain hole opened to close a build error.

The real behaviour is narrower than the issue title suggests. **npm prunes
optional dependencies to the current platform when it writes a lock from an
installed tree — not when it resolves one.** Regenerate with
`--package-lock-only` and no `node_modules` present and every platform
survives: 115 packages instead of 66, with 20 Linux entries. `npm ci` then works
on Windows and on the runner.

The lesson is not about npm. A workaround that removes a safety property should
be treated as a temporary diagnosis, not a resolution — and "it works now" is
the point at which the underlying cause stops being investigated.

**The trap that hid it:** the failure is invisible from Windows. The lock looks
fine, `npm ci` succeeds locally, `npm run verify` passes, and only the Linux
deploy fails.

## A worktree with no node_modules resolves against its parent

`npm run verify` failed in a fresh worktree with a type error in
`ChessBoardView.tsx` — a file the branch had never touched. The obvious reading
was a real regression from the react-chessboard 5 migration.

It was not. The worktree had no `node_modules`, so TypeScript walked up the
directory tree and resolved against the parent checkout's installed copy, which
was still on **4.7.3** while `package.json` declared `^5.10.0`. The `options`
prop genuinely does not exist in v4. CI was green throughout, because CI
installs.

Run `npm ci` in a new worktree before trusting any gate result. When a check
fails on a file outside the diff, the environment is the first suspect, not the
code.

## A required review that nobody can give

Branch protection required one approving review. GitHub does not let an author
approve their own pull request, and this repository has one maintainer — so
every pull request was permanently unmergeable, and the only way to land
anything was the admin bypass.

The setting looked like protection and functioned as an exception generator:
every merge became a bypass, which destroys the signal that a bypass was ever
used. It now requires zero approvals and two passing checks instead. The gate is
the reviewer.

A control that can only be satisfied by circumventing it is worse than no
control, because it also teaches everyone to reach for the circumvention.

## The leak scanner's own test was a leak

The gate includes a probe that plants a fake credential and asserts gitleaks
rejects it. Written the obvious way — a literal token in the script — it made
the script itself a finding, which the pre-publish history scan duly caught.

The probe now generates the token at run time. Two details were learned the hard
way and are worth keeping: it is shaped like a GitHub PAT rather than an AWS
key, because current gitleaks allowlists AWS's documented example key and has no
rule for bare AWS key ids at all.

## Piping a download into tar cannot verify it

`curl ... | sudo tar -xz` was how gitleaks was installed. There is no point in
the pipeline at which a checksum could be computed: the archive is unpacked as
it arrives, so by the time you could hash it the binary is already root-owned on
`PATH`. In the deploy workflow, that job goes on to hold the Azure token.

Download, verify, then extract — in that order. The shape matters more than the
specific tool; any `curl | sh` has the same property.
