# Phase 2 UI architecture and design trade-offs

This document records how the Phase 2 redesign applies Clean Architecture,
SOLID, DRY, dependency inversion, and single responsibility—and where it
intentionally stops applying them because the abstraction cost would exceed the
payoff.

## Scope

Phase 2 is a presentation-only change. The UI may depend inward on application
and domain contracts, but it does not move game logic into React and does not
name concrete infrastructure adapters.

The dependency direction remains:

```text
presentation -> application -> domain
composition  -> all layers, for wiring only
infrastructure -> application/domain ports
```

The existing architecture test continues to enforce the important boundary:
presentation cannot import infrastructure directly.

## react-chessboard v5 boundary

`ChessBoardView` remains the single adapter between ClaudeChess presentation
code and `react-chessboard` v5.

**Payoff**

- Screens do not know the library's v5 option object.
- Promotion, legal-move highlighting, orientation, hints, and move submission
  share one tested contract.
- The first-commit mount and memoized-option protections remain centralized.
- A future board-library migration is isolated to one presentation component.

**Trade-off**

`ChessBoardView` is larger than a minimal visual wrapper because v5 promotion,
measurement, and lifecycle behavior are real integration concerns. Splitting
those details into several tiny files would reduce file length but would not
reduce conceptual coupling; it would make the integration harder to audit.

## Single Responsibility Principle

### `App`

Responsibility: screen selection and lifetime/disposal of game and replay
resources.

It creates no concrete adapters. The factory is injected through the existing
services context.

### `AppShell`

Responsibility: application chrome and navigation controls.

It receives navigation intent through a callback and has no knowledge of games,
workers, storage, or archives.

### Screens

Each screen coordinates one user workflow:

- `NewGameScreen`: collect temporary setup choices and emit a
  `GameConfiguration`.
- `PlayScreen`: render and issue commands against one `LiveGame`.
- `PuzzleScreen`: coordinate one daily puzzle session.
- `ArchiveScreen`: browse, filter, import, export, preview, and select stored
  games.
- `ReplayScreen`: control one `ReplaySession`.

Pure, local rendering helpers remain near the screen when they are used only
there. This keeps the workflow readable without creating a component directory
full of one-use wrappers.

## Dependency Inversion Principle

The redesign preserves existing ports and injected dependencies:

- Screens receive `LiveGame`, `ReplaySession`, and callback contracts.
- The services context exposes application-facing services and factories.
- No screen instantiates Stockfish, chess.js rules, SQLite, or a ticker.
- `NewGameScreen` emits configuration data; `App` asks the injected factory to
  create the game.

**Payoff**

Presentation remains replaceable and tests can use fakes at the existing seams.

## DRY decisions

### Shared rules that are centralized

`phase2.css` centralizes:

- design tokens
- shell layout
- panel surfaces
- board frames
- headings and status pills
- responsive breakpoints
- focus behavior
- reduced-motion behavior

`ChessBoardView`, `ClockPanel`, `MoveList`, and `OutcomeBanner` continue to be
shared behavior-bearing components rather than duplicated screen markup.

### Duplication intentionally retained

Some short headings, card wrappers, and action layouts remain explicit in each
screen.

**Trade-off**

A generic `Card`, `ScreenHeader`, `Metric`, or schema-driven screen renderer
could remove a small amount of JSX repetition.

**Payoff**

- Screen-specific semantics stay visible.
- Accessibility labels remain close to their content.
- Components do not acquire dozens of style and behavior flags.
- A one-off visual difference does not require expanding a shared API.

This is intentional duplication of simple structure, not duplicated business
logic.

## Open/Closed Principle

Navigation items are data-driven in `AppShell`; adding another top-level route
requires adding an item and extending the navigation target union.

Screen-specific visual composition remains explicit. The redesign does not
introduce a plugin system or generic route registry because the application has
three primary destinations and no current extension requirement.

**Trade-off**

Adding a fourth destination touches `App`, `AppShell`, and the navigation type.

**Payoff**

The current flow remains statically exhaustive, easy to trace, and compiler
checked. A generalized routing abstraction would add indirection without a
present use case.

## Interface Segregation Principle

Existing application ports remain narrow. The redesign adds no broad UI service
or global screen interface.

Component props expose only the commands each screen needs. For example,
`NewGameScreen` receives only `onStart`; redundant puzzle and archive callbacks
were removed because navigation belongs to `AppShell`.

## New Game layout decision

The Start Game action is a real child of the settings panel footer. CSS controls
its appearance but does not relocate it.

**Payoff**

- The DOM matches the visual hierarchy.
- Keyboard order is correct.
- The button can only span the settings panel.
- Responsive behavior does not depend on absolute positioning or selector
  overrides.

The settings list may use internal scrolling on short desktop viewports.

**Trade-off**

A short display can require scrolling inside the settings panel.

**Payoff**

The page itself, board preview, selected-setup summary, and primary action stay
visible. Clipping choices or shrinking controls below usable sizes would be a
worse usability trade.

## ArchiveScreen size

`ArchiveScreen` remains a comparatively large workflow component.

A deeper split was considered but not performed as part of a visual release.
Its data loading, query cancellation, keyboard selection, import progress,
preview loading, pagination, and filtering states are tightly coordinated.

**Trade-off**

The file is longer than ideal for a purely visual component.

**Payoff**

Phase 2 avoids mixing a behavior refactor with a UI refactor, which reduces
regression risk in the most state-heavy screen. Existing behavior helpers such
as `ArchiveFilters`, `PlayerSearch`, and `GamePreview` boundaries are preserved.
A future archive refactor should have dedicated tests and a separate commit.

## CSS architecture

Phase 2 uses one additive stylesheet imported after the established base
stylesheet.

**Trade-off**

Some selectors override legacy base rules instead of deleting and rewriting the
entire original stylesheet.

**Payoff**

- The Phase 2 change is isolated and reversible.
- Existing non-Phase-2 component behavior is protected.
- The consolidated file replaces the earlier chain of incremental overrides.
- No runtime styling dependency or CSS-in-JS layer is introduced.

The final `phase2.css` is a clean consolidated file; it does not append the
previous Start-button patches.

## Accessibility and responsiveness

- Native buttons, inputs, labels, and tables are retained.
- Focus-visible rings are consistent across shell controls.
- Status text uses existing live regions where behavior requires it.
- Mobile navigation moves to the bottom and keeps visible labels.
- Desktop board screens use the available viewport; mobile returns to normal
  document flow.
- Reduced-motion preference disables the loading animation.

## Verification boundary

The presentation changes should be validated with the repository's existing
commands and visual viewport checks. No new test framework was added solely for
layout assertions.

**Trade-off**

CSS geometry is not unit tested.

**Payoff**

The project avoids a DOM-testing dependency and brittle pixel assertions. Logic
continues to be covered by the existing unit tests, while layout is verified in
real browser viewports.
