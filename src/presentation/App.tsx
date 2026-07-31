import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { LiveGame } from '@application/LiveGame'
import type { ReplaySession } from '@application/replay/ReplaySession'
import { AppIcon } from './components/AppIcon'
import { AppShell } from './components/AppShell'
import { ArchiveScreen } from './screens/ArchiveScreen'
import { NewGameScreen } from './screens/NewGameScreen'
import { PlayScreen } from './screens/PlayScreen'
import { PuzzleScreen } from './screens/PuzzleScreen'
import { ReplayScreen } from './screens/ReplayScreen'
import { useServices } from './ServicesContext'
import './phase2.css'
import './phase3.css'
import './phase4-6.css'

type View =
  | { readonly name: 'setup' }
  | { readonly name: 'archive' }
  | { readonly name: 'puzzle' }
  | { readonly name: 'loading'; readonly message: string }
  | { readonly name: 'play'; readonly game: LiveGame; readonly configuration: GameConfiguration }
  | { readonly name: 'replay'; readonly session: ReplaySession }
  | { readonly name: 'error'; readonly message: string }

type ShellTarget = 'setup' | 'puzzle' | 'archive'

/**
 * Owns screen selection and the lifetime of resources driven by each screen.
 * AppShell receives navigation callbacks only; it does not know about services,
 * workers, games, or replay sessions.
 */
export function App() {
  const { services, factory } = useServices()
  const [view, setView] = useState<View>({ name: 'setup' })
  const disposableView = useRef<View | null>(null)

  const goTo = useCallback((next: View) => {
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
      services.archive
        .load(id)
        .then((game) => goTo({ name: 'replay', session: factory.createReplaySession(game) }))
        .catch((cause: unknown) =>
          goTo({
            name: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        )
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
      {renderView()}
    </AppShell>
  )

  function renderView() {
    switch (view.name) {
      case 'setup':
        return (
          <NewGameScreen
            onStart={startGame}
            onBrowseArchive={() => goTo({ name: 'archive' })}
            onOpenPuzzle={() => goTo({ name: 'puzzle' })}
          />
        )

      case 'puzzle':
        return <PuzzleScreen onBack={() => goTo({ name: 'setup' })} />

      case 'archive':
        return (
          <ArchiveScreen
            onOpenGame={openArchivedGame}
            onBack={() => goTo({ name: 'setup' })}
          />
        )

      case 'play':
        return (
          <PlayScreen
            game={view.game}
            configuration={view.configuration}
            onNewGame={() => goTo({ name: 'setup' })}
          />
        )

      case 'replay':
        return <ReplayScreen session={view.session} onBack={() => goTo({ name: 'archive' })} />

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
      return 'Championship archive'
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
      return 'Local game library'
    case 'puzzle':
      return 'Daily training'
    case 'loading':
    case 'error':
      return 'Championship archive'
    case 'setup':
      return 'Local chess studio'
  }
}
