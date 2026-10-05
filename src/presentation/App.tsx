import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { LiveGame } from '@application/LiveGame'
import type { ReplaySession } from '@application/replay/ReplaySession'
import { AppIcon } from './components/AppIcon'
import { AppShell } from './components/AppShell'
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary'
import { ArchiveScreen } from './screens/ArchiveScreen'
import { NewGameScreen } from './screens/NewGameScreen'
import { PlayScreen } from './screens/PlayScreen'
import { PuzzleScreen } from './screens/PuzzleScreen'
import { ReplayScreen } from './screens/ReplayScreen'
import { useServices } from './ServicesContext'

type View =
  | { readonly name: 'setup' }
  | { readonly name: 'archive' }
  | { readonly name: 'mine' }
  | { readonly name: 'puzzle' }
  | { readonly name: 'loading'; readonly message: string }
  | { readonly name: 'play'; readonly game: LiveGame; readonly configuration: GameConfiguration }
  | { readonly name: 'replay'; readonly session: ReplaySession }
  | { readonly name: 'error'; readonly message: string }

type ShellTarget = 'setup' | 'puzzle' | 'archive' | 'mine'

/**
 * Owns screen selection and the lifetime of resources driven by each screen.
 * AppShell receives navigation callbacks only; it does not know about services,
 * workers, games, or replay sessions.
 */
export function App() {
  const { services, factory } = useServices()
  const [view, setView] = useState<View>({ name: 'setup' })
  const disposableView = useRef<View | null>(null)

  /*
   * Which navigation is the current one.
   *
   * Work started in order to *reach* a screen outlives the decision to go
   * there: loading an archived game takes as long as it takes, and the only
   * thing stopping a resolved load from taking over the screen was that nobody
   * had tried it. Clicking a game and then reaching for the sidebar — or
   * clicking a second game — pulled you into the first one when it landed, and
   * two clicks in quick succession opened whichever game answered last rather
   * than the one asked for second.
   *
   * Bumped by every `goTo`, so an async navigation can compare the count it
   * started with against the count now and stand down. A `cancelled` flag per
   * request would not do: the cancellation here is *any* later navigation, from
   * anywhere, not just the next call to this one function.
   */
  const navigation = useRef(0)

  const goTo = useCallback((next: View) => {
    navigation.current += 1
    disposeView(disposableView.current)
    disposableView.current = next
    setView(next)
  }, [])

  useEffect(() => () => disposeView(disposableView.current), [])

  const navigate = useCallback(
    (target: ShellTarget) => {
      goTo({ name: target })
    },
    [goTo],
  )

  const startGame = useCallback(
    (configuration: GameConfiguration) => {
      const game = factory.createLiveGame(configuration)
      goTo({ name: 'play', game, configuration })
      game.start()
    },
    [factory, goTo],
  )

  const openArchivedGame = useCallback(
    (id: string) => {
      goTo({ name: 'loading', message: 'Loading game…' })
      const request = navigation.current

      services.archive
        .load(id)
        .then((game) => {
          // Checked before the session is built, not after: a replay session
          // holds resources, and one created for a screen nobody is waiting for
          // would have to be disposed again immediately.
          if (request !== navigation.current) return
          goTo({ name: 'replay', session: factory.createReplaySession(game) })
        })
        .catch((cause: unknown) => {
          if (request !== navigation.current) return
          goTo({
            name: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          })
        })
    },
    [services.archive, factory, goTo],
  )

  const shellActive: ShellTarget =
    view.name === 'archive' || view.name === 'replay'
      ? 'archive'
      : view.name === 'puzzle'
        ? 'puzzle'
        : 'setup'

  return (
    <AppShell
      active={shellActive}
      title={shellTitle(view)}
      context={shellContext(view)}
      onNavigate={navigate}
    >
      {/* Keyed by screen so a crash in one does not leave the boundary tripped
          when the user navigates to another. `view.name` is enough: the two
          archive halves already carry their own keys below it. */}
      <ScreenErrorBoundary key={view.name} onReset={() => goTo({ name: 'setup' })}>
        {renderView()}
      </ScreenErrorBoundary>
    </AppShell>
  )

  function renderView() {
    switch (view.name) {
      case 'setup':
        return (
          <NewGameScreen onStart={startGame} />
        )

      case 'puzzle':
        return <PuzzleScreen />

      case 'archive':
        // Keyed so the two halves do not inherit each other's search,
        // filters, sort or page — they are different libraries.
        return <ArchiveScreen key="reference" scope="reference" onOpenGame={openArchivedGame} />

      case 'mine':
        return <ArchiveScreen key="mine" scope="mine" onOpenGame={openArchivedGame} />

      case 'play':
        return (
          <PlayScreen
            game={view.game}
            configuration={view.configuration}
            onNewGame={() => goTo({ name: 'setup' })}
          />
        )

      case 'replay':
        return <ReplayScreen session={view.session} />

      case 'loading':
        return (
          <section className="phase46-system-state" role="status" aria-live="polite">
            <span className="phase46-system-state__icon phase46-system-state__icon--loading" aria-hidden="true">
              <AppIcon name="sparkles" size={24} />
            </span>
            <div>
              <p className="phase2-kicker">Preparing replay</p>
              <h1>{view.message}</h1>
              <p>The selected game is being loaded from your local archive.</p>
            </div>
          </section>
        )

      case 'error':
        return (
          <section className="phase46-system-state phase46-system-state--error" role="alert">
            <span className="phase46-system-state__icon" aria-hidden="true">
              <AppIcon name="warning" size={24} />
            </span>
            <div>
              <p className="phase2-kicker">Unable to open game</p>
              <h1>Replay unavailable</h1>
              <p>{view.message}</p>
              <button type="button" className="button" onClick={() => goTo({ name: 'archive' })}>
                <AppIcon name="arrow-left" size={16} />
                Back to championships
              </button>
            </div>
          </section>
        )
    }
  }
}

function disposeView(view: View | null): void {
  if (view === null) return
  if (view.name === 'play') view.game.dispose()
  if (view.name === 'replay') view.session.dispose()
}

function shellTitle(view: View): string {
  switch (view.name) {
    case 'setup':
      return 'New game'
    case 'play':
      return 'Live game'
    case 'puzzle':
      return 'Puzzle of the day'
    case 'archive':
      return 'Championships'
    case 'mine':
      return 'My games'
    case 'replay':
      return 'Game replay'
    case 'loading':
      return 'Loading replay'
    case 'error':
      return 'Replay unavailable'
  }
}

function shellContext(view: View): string {
  switch (view.name) {
    case 'play':
      return 'Match room'
    case 'replay':
      return 'Analysis room'
    case 'archive':
      return 'Reference library'
    case 'mine':
      return 'Games you have saved'
    case 'puzzle':
      return 'Daily training'
    case 'loading':
    case 'error':
      return 'Championship archive'
    case 'setup':
      return 'Local chess studio'
  }
}
