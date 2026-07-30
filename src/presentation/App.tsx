import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { LiveGame } from '@application/LiveGame'
import type { ReplaySession } from '@application/replay/ReplaySession'
import { ArchiveScreen } from './screens/ArchiveScreen'
import { NewGameScreen } from './screens/NewGameScreen'
import { PlayScreen } from './screens/PlayScreen'
import { PuzzleScreen } from './screens/PuzzleScreen'
import { ReplayScreen } from './screens/ReplayScreen'
import { useServices } from './ServicesContext'

type View =
  | { readonly name: 'setup' }
  | { readonly name: 'archive' }
  | { readonly name: 'puzzle' }
  | { readonly name: 'loading'; readonly message: string }
  | { readonly name: 'play'; readonly game: LiveGame; readonly configuration: GameConfiguration }
  | { readonly name: 'replay'; readonly session: ReplaySession }
  | { readonly name: 'error'; readonly message: string }

/**
 * Owns which screen is showing, and the lifetime of whatever that screen is
 * driving.
 *
 * Games and replay sessions hold real resources — an engine worker, a running
 * timer — so every transition disposes what it replaces. Leaving that to each
 * screen's unmount would scatter the responsibility and eventually leak a
 * worker.
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

  // Covers the last view when the whole app goes away.
  useEffect(() => () => disposeView(disposableView.current), [])

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
        <div className="screen">
          <p className="notice">{view.message}</p>
        </div>
      )

    case 'error':
      return (
        <div className="screen">
          <p className="notice notice--error">{view.message}</p>
          <button type="button" className="button" onClick={() => goTo({ name: 'archive' })}>
            Back
          </button>
        </div>
      )
  }
}

function disposeView(view: View | null): void {
  if (view === null) return
  if (view.name === 'play') view.game.dispose()
  if (view.name === 'replay') view.session.dispose()
}
