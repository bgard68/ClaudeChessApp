# Phase 3 architecture decisions, trade-offs, and pay-offs

Phase 3 follows Clean Architecture and applies SOLID, DRY, DIP, and SRP where they reduce coupling or make behavior easier to verify. It deliberately does not introduce abstractions merely to satisfy a pattern.

## Clean Architecture and DIP

### Decision

Presentation components continue to receive navigation intent and application objects through props or `ServicesContext`. `ScreenHeader`, `AppShell`, and the new layout rules do not import infrastructure implementations.

### Pay-off

- UI composition remains replaceable.
- Domain and application behavior stay independent of React and CSS.
- No new dependency direction crosses from inner layers to presentation.

## SRP

### Applied: `ScreenHeader`

The repeated page-heading structure now has one responsibility: render semantic heading, optional back action, supporting text, metrics, and screen actions. It does not own routing, services, or screen state.

### Not applied: New Game `Panel` and `Choice`

`Panel` and `Choice` remain local to `NewGameScreen`.

**Trade-off:** They are not reusable outside that file.

**Pay-off:** They are setup-specific and currently have one consumer. Promoting them to a shared design-system API would create a broader contract without demonstrated reuse.

## DRY

### Applied

- Shared screen-heading markup moved to `ScreenHeader`.
- Cross-screen accessibility, layout, and responsive rules live in `phase3.css`.
- Replay transport buttons share one local `TransportButton` implementation.

### Deliberate duplication retained

The Play and Replay sidebars both use cards, clocks, and move lists, but their orchestration remains in their respective screens.

**Trade-off:** Some layout composition looks similar.

**Pay-off:** A generic “chess session sidebar” would need many conditional props and would couple live-game commands to replay commands. Keeping the two coordinators separate protects SRP and avoids a premature abstraction.

## Open/closed principle

Phase 3 extends the visual system through an additive stylesheet imported after Phase 2. The original board styles and board wrapper are not rewritten.

**Trade-off:** There are now sequential Phase 2 and Phase 3 stylesheets.

**Pay-off:** The approved Phase 2 baseline remains auditable, and Phase 3 can be reviewed or reverted independently. A future consolidation pass can merge them after visual acceptance.

## React Chessboard v5 lifecycle

`ChessBoardView.tsx` remains unchanged. Phase 3 only sizes and decorates containers around it.

**Trade-off:** The layouts work within the wrapper’s existing measurement constraints instead of replacing the wrapper with a new board abstraction.

**Pay-off:** The documented first-commit sizing and mount protections remain intact, reducing regression risk in drag, promotion, orientation, and resize behavior.

## Archive screen

The behavior-heavy `ArchiveScreen` is not split into many new hooks or coordinators during a presentation phase.

**Trade-off:** The file remains large.

**Pay-off:** Query cancellation, pagination accumulation, import progress, filtering, preview selection, keyboard navigation, and file export remain co-located and unchanged. Splitting it safely deserves a dedicated behavior-refactoring phase with focused tests, not a visual milestone.

## CSS versus component props

Responsive layout remains in CSS rather than being calculated in React.

**Trade-off:** Some screen structure is described by class contracts.

**Pay-off:** Viewport changes do not trigger JavaScript layout state, media behavior stays declarative, and presentation remains separate from game/application logic.
