# Phases 4–6 architecture and design trade-offs

The final UI pass follows Clean Architecture, SOLID, DRY, DIP, and SRP where the
resulting seam has a real payoff. This document records where a principle was
applied, where it was intentionally not applied, and what was gained.

## Dependency rule and DIP

### Applied

`AppShell` receives navigation callbacks, the current title, and contextual
copy through props. It does not import the game factory, archive, engine,
persistence, or application state. Screens continue to depend on domain and
application contracts supplied by the existing composition root.

**Payoff:** the shell can change its responsive behavior without acquiring a
new reason to change when game or archive services change.

### Intentionally not expanded

No routing interface was introduced. `App.tsx` still owns screen selection and
the lifetime of `LiveGame` and `ReplaySession` resources.

**Trade-off:** screen selection is a small local state machine rather than an
abstract router.

**Payoff:** resource disposal remains beside the transition that creates the
resource. Splitting those concerns would create more indirection and a greater
risk of leaking workers or replay timers.

## SRP

### Applied

`AppIcon` owns one job: rendering the project's small decorative SVG set.
`ScreenHeader` owns semantic heading composition. `AppShell` owns application
chrome. Game, puzzle, archive, and replay behavior remain in their existing
screens and application objects.

### Intentionally local

`Panel`, `Choice`, and `PuzzleProgress` remain local to their screens instead of
becoming a generic form-card or progress-step framework.

**Trade-off:** those small pieces cannot be reused by importing a shared
component.

**Payoff:** their props describe the actual screen language rather than a
premature generic API. There is currently no second caller with the same
contract.

## DRY

### Applied

Repeated SVG markup was consolidated into `AppIcon`. Shared shell, heading,
clock, move-list, outcome, and board components continue to be reused.

### Deliberately not forced

The setup, play, puzzle, archive, and replay screens retain screen-specific
markup even where card shapes look similar.

**Trade-off:** some structural CSS and heading markup is repeated.

**Payoff:** the screens can evolve independently. A generic `Card` component
would remove only a few tags while coupling unrelated content and responsive
behavior to one abstraction.

## Open/Closed Principle

The established domain, application, infrastructure, and composition layers
were left closed to this visual pass. New behavior is added through
presentation components and the final stylesheet.

**Trade-off:** `phase4-6.css` is a late, explicit cascade layer rather than a
rewrite of the older Phase 2 and Phase 3 styles.

**Payoff:** the final package is low-risk to apply over the completed Phase 3
source, preserves earlier reviewed behavior, and makes every final override
visible in one file. The cost is an additional stylesheet in the cascade. A
future maintenance-only cleanup may merge the phase styles after visual
regression tests exist.

## Interface Segregation

No new application port was added for icons, animations, media queries, or
screen titles. These are presentation details and exposing them through inner
layer interfaces would reverse the dependency rule.

The existing `GameArchive`/`GameStore`, `ChessEngine`, `ChessRules`, and `Ticker`
ports remain unchanged.

## `react-chessboard` v5 protection

`ChessBoardView.tsx` is unchanged. The final UI does not:

- defer the board mount,
- key the board to force remounts,
- animate its dimensions,
- reach into react-chessboard's internal DOM,
- reintroduce the removed `boardWidth` prop, or
- change the v5 `options` contract.

Animations on board surfaces use opacity only. Container sizing is resolved by
normal CSS layout before the board fills the square supplied to it.

**Payoff:** the Phase 4–6 polish does not reopen the mount-timing failure
recorded in `LESSONS-LEARNED.md`.

## Animation library not introduced

Motion is implemented with CSS transitions and keyframes.

**Trade-off:** there is no centralized JavaScript animation timeline or route
transition orchestrator.

**Payoff:** zero runtime dependency, no additional bundle or supply-chain
surface, no lifecycle interaction with the chessboard, and a straightforward
`prefers-reduced-motion` override.

## ArchiveScreen not decomposed in this phase

`ArchiveScreen` remains large and continues to own list, filter, sort, paging,
import, export, and preview state.

**Trade-off:** SRP remains strained in that file.

**Payoff:** Phases 4–6 are a presentation milestone, not an archive-use-case
rewrite. Decomposing the state machine while also changing its layout would
increase regression risk in import, pagination, preview, and keyboard behavior.
A future extraction should begin with an archive-query hook or reducer and be
covered by behavior tests first.
