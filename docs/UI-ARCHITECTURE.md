# UI architecture and design trade-offs

Which abstractions the presentation redesign added, which it deliberately
refused, and what each choice bought. The redesign applies Clean Architecture,
SOLID, DRY, DIP, and SRP where the resulting seam has a real payoff — and stops
where the abstraction would cost more than it returns.

For what actually changed on each screen, see
[UI-REDESIGN.md](UI-REDESIGN.md). For the same questions about the app as a
whole, see
[ARCHITECTURE-AND-REVIEW.md](ARCHITECTURE-AND-REVIEW.md).

The three phases each recorded their own trade-offs. Those records are merged
here by principle rather than by phase, because the principles did not change
between phases — only the components they applied to did.

## Scope and the dependency rule

The redesign is presentation-only. The UI depends inward on application and
domain contracts; it does not move game logic into React and does not name
concrete infrastructure adapters.

```text
presentation   -> application -> domain
composition    -> all layers, for wiring only
infrastructure -> application/domain ports
```

`architecture.test.ts` continues to enforce the boundary that matters:
presentation cannot import infrastructure directly. No new dependency direction
crosses from an inner layer to presentation.

## The `react-chessboard` boundary

`ChessBoardView` remains the single adapter between this app's presentation code
and `react-chessboard` v5. It is byte-for-byte unchanged through the entire
redesign.

**Payoff** — screens never see the library's v5 option object. Promotion, legal-move
highlighting, orientation, hints, and move submission share one tested contract.
The first-commit mount and memoized-option protections stay centralized. A
future board-library migration is isolated to one component.

**Trade-off** — `ChessBoardView` is larger than a minimal visual wrapper, because v5
promotion, measurement, and lifecycle behaviour are real integration concerns.
Splitting them into several small files would reduce file length without
reducing conceptual coupling, and would make the integration harder to audit.

The redesign works within the wrapper's existing measurement constraints. It
does not defer the board mount, key the board to force remounts, animate its
dimensions, reach into react-chessboard's internal DOM, reintroduce the removed
`boardWidth` prop, or change the v5 `options` contract. Animations on board
surfaces use opacity only; container sizing resolves through normal CSS layout
before the board fills the square it is given.

**Payoff** — the polish never reopens the mount-timing failure in
[LESSONS-LEARNED.md](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end).

## Single responsibility

### Applied

| Component | Its one job |
| --- | --- |
| `App` | Screen selection, and the lifetime and disposal of game and replay resources |
| `AppShell` | Application chrome and navigation controls |
| `ScreenHeader` | Semantic heading composition — heading, optional back action, supporting text, metrics, screen actions |
| `AppIcon` | Rendering the project's small decorative SVG set |
| `PanelDrawer` | Whether a panel card is a section or a collapsed drawer, which depends only on the width |

`AppShell` receives navigation intent through a callback and knows nothing of
games, workers, storage, or archives. `ScreenHeader` owns no routing, services,
or screen state. Each screen coordinates exactly one workflow:

- `NewGameScreen` — collect setup choices, emit a `GameConfiguration`
- `PlayScreen` — render and issue commands against one `LiveGame`
- `PuzzleScreen` — coordinate one daily puzzle session
- `ArchiveScreen` — browse, filter, import, export, preview, select
- `ReplayScreen` — control one `ReplaySession`

### Deliberately local

`Panel`, `Choice`, and `PuzzleProgress` stay inside the screens that use them
rather than becoming a generic form-card or progress-step framework.

**Trade-off** — they cannot be reused by import.

**Payoff** — their props describe the actual screen language instead of a premature
generic API. There is no second caller with the same contract. Pure, local
rendering helpers stay near the screen that uses them, which keeps the workflow
readable without a component directory full of one-use wrappers.

## The right rail

`AppShell` renders a second rail after the stage — full window height, flush
to the edge, beside the top bar rather than inside the content — and a screen
fills it through a portal.

**Why a portal.** The rail is a column of the shell, so the shell has to own
its position; but its contents are one screen's controls, driven by that
screen's state. Lifting five pieces of setup state into `App` to render them
from there would move state away from where it is used to satisfy a layout.
The portal keeps the state local and puts only the markup out in the rail.

**Payoff** — the rail hides itself when empty, so every screen that does not
use it is untouched and the shell stays two columns. No screen learns about
the rail except the one that fills it.

**Trade-off** — the markup's position in the DOM no longer matches its
position in the component tree, which is a real cost when reading the output.
It buys not restructuring a screen's state to satisfy its chrome.

Three earlier attempts styled a card inside the content padding instead. A
card has a panel's surface but not a panel's shape, and it read as content on
a background beside a rail that is genuinely structural.

## Dependency inversion

Screens receive `LiveGame`, `ReplaySession`, and callback contracts; the
services context exposes application-facing services and factories. No screen
instantiates Stockfish, chess.js rules, SQLite, or a ticker. `NewGameScreen`
emits configuration data and `App` asks the injected factory to create the game.

**Payoff** — presentation stays replaceable, and tests use fakes at the existing
seams.

### No routing interface

`App.tsx` still owns screen selection and the lifetime of `LiveGame` and
`ReplaySession`.

**Trade-off** — screen selection is a small local state machine rather than an
abstract router.

**Payoff** — resource disposal stays beside the transition that creates the
resource. Splitting them would add indirection and a greater risk of leaking
workers or replay timers.

## DRY

### Centralized

Repeated SVG markup became `AppIcon`. Repeated page-heading structure became
`ScreenHeader`. Replay transport buttons share one local `TransportButton`.
`ChessBoardView`, `ClockPanel`, `MoveList`, and `OutcomeBanner` remain shared
behaviour-bearing components rather than duplicated markup. Cross-screen design
tokens, layout, accessibility, and responsive rules live in the phase
stylesheets.

### Duplication kept on purpose

Setup, play, puzzle, archive, and replay retain screen-specific markup even
where card shapes look similar. The Play and Replay sidebars both use cards,
clocks, and move lists, but their orchestration stays in their own screens.

**Trade-off** — some structural CSS and heading markup repeats.

**Payoff** — screen-specific semantics stay visible, accessibility labels stay next
to their content, and components do not acquire dozens of style and behaviour
flags. A generic "chess session sidebar" would need many conditional props and
would couple live-game commands to replay commands. A one-off visual difference
should not require expanding a shared API.

This is intentional duplication of simple structure, not of business logic.

## Open/closed

Navigation items are data-driven in `AppShell`: another top-level destination
means adding an item and extending the navigation target union. No plugin system
or generic route registry was introduced — the app has three primary
destinations and no present extension requirement.

**Trade-off** — a fourth destination touches `App`, `AppShell`, and the
navigation type. My games proved the cost exactly: three files, plus a mobile
bar written as `repeat(3, 1fr)` that silently wrapped the fourth item onto a
second row inside a 72px strip. The compiler caught the first three; only
measuring caught the fourth.

**Payoff** — the flow stays statically exhaustive, traceable, and compiler-checked.

The domain, application, infrastructure, and composition layers were left closed
to this visual pass entirely. New behaviour arrives through presentation
components and stylesheets.

## Interface segregation

Existing application ports stay narrow. No broad UI service or global screen
interface was added, and no new port was created for icons, animations, media
queries, or screen titles — those are presentation details, and exposing them
through inner-layer interfaces would reverse the dependency rule.
`GameArchive`/`GameStore`, `ChessEngine`, `ChessRules`, and `Ticker` are
unchanged.

Component props expose only the commands a screen needs: `NewGameScreen`
receives only `onStart`, since navigation belongs to `AppShell`.

## The Start game button

The action is a real child of the settings panel footer. CSS controls its
appearance but never relocates it.

**Payoff** — the DOM matches the visual hierarchy, keyboard order is correct, the
button can only span the settings panel, and responsive behaviour does not
depend on absolute positioning or selector overrides.

**Trade-off** — a short display can require scrolling inside the settings panel.

**Payoff** — the page itself, the board preview, the setup summary, and the primary
action all stay visible. Clipping choices or shrinking controls below usable
sizes would be the worse trade.

## Layout in CSS, not in React

Responsive layout is expressed in CSS rather than calculated in React.

**Trade-off** — some screen structure is described by class contracts.

**Payoff** — viewport changes trigger no JavaScript layout state, media behaviour
stays declarative, and presentation stays separate from application logic.

Two components read a media query in JavaScript anyway, and both are here
because CSS cannot express the thing being decided. `ArchiveScreen` asks whether
there is a preview pane, because that changes what a *click* means — select, or
open the replay. `PanelDrawer` asks whether it is on a phone, because a
`<details>` and a `<section>` are different elements and a stylesheet cannot
turn one into the other; a CSS-only disclosure would have to exist at every
width, which is a control the desktop never needed. Both use `useMediaQuery`,
which returns `false` where there is no browser to ask — a static render — so
neither can take a `renderToStaticMarkup` pass down with it.

Motion is CSS transitions and keyframes, with no animation library.

**Trade-off** — there is no centralized JavaScript animation timeline or route
transition orchestrator.

**Payoff** — zero runtime dependency, no additional bundle or supply-chain surface,
no lifecycle interaction with the chessboard, and a straightforward
`prefers-reduced-motion` override.

## Known debt

### The base section is last, and has to stay there

The four stylesheets are now one file, but its sections are concatenated in the
order the browser used to apply them — phase2, phase3, phase4-6, then base.
Base last reads wrong. It is load-bearing.

A fifth section, **phone**, now follows base. That is not the same kind of
ordering: base is last because moving it breaks things, and phone is last
because it is *meant* to be — it is one `@media (max-width: 620px)` block whose
whole job is to overrule what four desktop-era sections decided about a screen
393 points wide, and position is how it does that without raising specificity
in four places. Everything in it is inside that query, so it is inert above
620px and cannot participate in the base-ordering problem below.

Reordering it to the natural sequence has been attempted twice and reverted
twice.

The first attempt swapped the imports in `main.tsx`, before the merge. It
worked, and it changed what the board measures at mount: the replay board came
back 314×490 against a 314×314 area. That is the mount-timing failure in
[LESSONS-LEARNED.md](LESSONS-LEARNED.md#react-chessboard-4--5-the-migration-and-a-two-day-dead-end),
and not worth reopening for tidiness.

The second attempt reordered the sections after the merge, where mount timing
was not in play. It broke the right rail immediately: `.app-rail--right` sets a
366px width in the base section, and phase4-6's `.app-rail` sets 224px — equal
specificity, and the phase now came later. The rails overlapped and the
navigation stopped being clickable.

An exact-selector scan finds 28 base declarations a later section also sets.
That number is a floor, not the scope: the fault that actually broke it was a
*different* selector winning over a more specific-sounding one, which no static
scan enumerates. The real work is not reordering the sections — it is deciding,
for every conflict discoverable only by running the app, which rule was meant to
win. That is a rewrite of the phase sections, not a refactor.

**What that leaves.** Nine `!important` declarations that exist because the base
section wins by position. They are the price of not doing the rewrite, and they
are documented here rather than removed, because removing them without the
rewrite silently changes which rule applies.

### `ArchiveScreen` remains large

It still owns list, filter, sort, paging, import, export, and preview state.
Its data loading, query cancellation, keyboard selection, import progress,
preview loading, pagination, and filtering states are tightly coordinated.

**Trade-off** — SRP is strained in that file.

**Payoff** — the redesign avoided mixing a behaviour refactor with a visual one in
the most state-heavy screen, which is where regression risk is highest.
`ArchiveFilters`, `PlayerSearch`, and the preview boundaries are preserved.

A future extraction should start with an archive-query hook or reducer, be
covered by behaviour tests written *first*, and land as its own commit.

## Verification boundary

Component behaviour is tested by rendering through `react-dom/server` and
asserting on the markup — `AppIcon`, `ScreenHeader`, `AppShell`, and
`PanelDrawer` each have a test. CSS geometry is not unit tested.

**Trade-off** — layout regressions are not caught by the suite.

**Payoff** — no DOM-testing dependency and no brittle pixel assertions. Logic stays
covered by unit tests; layout is verified in real browser viewports, per the QA
matrix in [UI-REDESIGN.md](UI-REDESIGN.md#browser-qa-still-worth-doing).

`scripts/layout-check.mjs` now automates the part of that matrix a machine can
judge: it drives the built app through every screen at four widths and asserts
presence first — the board, the options, the actions, the archive table — then
containment, tap targets, text size, board dimensions, and on a phone whether
the screen's primary action is above the fold. It runs in the gate.

Two more scripts joined it, on the same browser. `behaviour-check.mjs` asks
whether the screens can be *used* — paging appends, searching replaces, reset
clears the sort as well as the filters — because everything an effect drives is
invisible to a suite that renders to static markup. `a11y-check.mjs` runs
axe-core over four screens at two widths, which nothing had ever done.

All three, what they cover and what they cannot, are in
[TESTING.md](TESTING.md).

Presence is the point. The suite was green, the build was green and the smoke
test was green on a day the settings panel was absent from every phone, because
each existing check asks whether anything present is wrong and none asked
whether everything was there.

One caveat learned the hard way: presentation tests live in `.tsx` files, and
vitest's `include` pattern must say so. A `src/**/*.test.ts` pattern skips them
silently — the suite passes, just without them.
