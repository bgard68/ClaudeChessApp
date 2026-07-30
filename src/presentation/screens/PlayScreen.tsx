import { useState } from 'react'
import { isOver } from '@domain/chess/GameOutcome'
import { opposite, type PieceColor } from '@domain/chess/Piece'
import { describeTimeControl } from '@domain/clock/TimeControl'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { LiveGame } from '@application/LiveGame'
import { recordGame } from '@application/recordGame'
import { ChessBoardView } from '../components/ChessBoardView'
import { ClockPanel } from '../components/ClockPanel'
import { MoveList } from '../components/MoveList'
import { OutcomeBanner } from '../components/OutcomeBanner'
import { useObservableStore } from '../hooks/useObservableStore'
import { describeDurability, useLibraryDurability } from '../hooks/useLibraryDurability'
import { useServices } from '../ServicesContext'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface PlayScreenProps {
  readonly game: LiveGame
  readonly configuration: GameConfiguration
  readonly onNewGame: () => void
}

export function PlayScreen({ game, configuration, onNewGame }: PlayScreenProps) {
  const state = useObservableStore(game)
  const { services } = useServices()
  const durability = useLibraryDurability()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // Pass-and-play turns the board to whoever is on the move; against the
  // computer the player keeps their own side of the board throughout.
  const [autoFlip, setAutoFlip] = useState(configuration.opponent === 'human')
  const [manualOrientation, setManualOrientation] = useState<PieceColor>(
    configuration.playerColor,
  )

  const orientation =
    autoFlip && !isOver(state.outcome) ? state.position.sideToMove : manualOrientation

  const gameOver = isOver(state.outcome)
  const isHumanToMove = state.awaiting?.kind === 'human'
  const lastMove = state.history.at(-1) ?? null
  // Watching the computer play itself: nobody at the keyboard has a game to
  // undo, a draw to agree, or anything to resign.
  const isWatching = configuration.opponent === 'engines'

  const names = seatNames(configuration)

  const saveGame = async () => {
    setSaveState('saving')
    try {
      await services.store.save(
        recordGame(state, {
          whiteName: names.white,
          blackName: names.black,
          event: eventName(configuration),
          site: 'This device',
          at: new Date(),
        }),
      )
      setSaveState('saved')
    } catch (error) {
      console.error('Could not save the game.', error)
      setSaveState('error')
    }
  }

  const saveButton = (
    <button
      type="button"
      className="button"
      disabled={state.history.length === 0 || saveState === 'saving' || saveState === 'saved'}
      onClick={() => void saveGame()}
    >
      {saveLabel(saveState)}
    </button>
  )

  const durabilityWarning = describeDurability(durability)

  return (
    <div className="screen screen--play">
      <ChessBoardView
        fen={state.position.fen}
        orientation={orientation}
        interactive={isHumanToMove && !gameOver}
        legalMoves={state.legalMoves}
        lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
        onMove={(intent) => game.submitMove(intent)}
      />

      <aside className="play__panel">
        <ClockPanel
          whiteMs={state.clock.whiteMs}
          blackMs={state.clock.blackMs}
          activeColor={state.clock.running}
          orientation={orientation}
          whiteName={names.white}
          blackName={names.black}
          note={describeTimeControl(state.timeControl)}
        />

        <div className="play__status">
          {gameOver ? null : (
            <>
              <span>
                {state.awaiting === null
                  ? 'Starting…'
                  : `${state.awaiting.name} to move`}
              </span>
              {state.awaiting?.kind === 'engine' ? (
                <span className="play__thinking">thinking…</span>
              ) : null}
              {state.isCheck ? <span className="play__check">Check</span> : null}
            </>
          )}
        </div>

        <OutcomeBanner outcome={state.outcome} onNewGame={onNewGame}>
          {saveButton}
        </OutcomeBanner>

        {saveState === 'error' ? (
          <p className="notice notice--error">The game could not be saved.</p>
        ) : null}
        {durabilityWarning !== null && saveState !== 'saved' ? (
          <p className="clock-note">{durabilityWarning}</p>
        ) : null}

        <div className="play__moves">
          <MoveList sanMoves={state.history.map((move) => move.san)} />
        </div>

        <div className="play__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              if (autoFlip) {
                setManualOrientation(state.position.sideToMove)
                setAutoFlip(false)
              } else {
                setManualOrientation(opposite(manualOrientation))
              }
            }}
          >
            Flip board
          </button>
          {configuration.opponent === 'human' ? (
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoFlip}
                onChange={(event) => setAutoFlip(event.target.checked)}
              />
              Turn board each move
            </label>
          ) : null}
          {isWatching ? null : (
            <>
              <button
                type="button"
                className="button"
                disabled={!state.canUndo}
                onClick={() => game.undo()}
              >
                Undo
              </button>
              <button
                type="button"
                className="button"
                disabled={gameOver}
                onClick={() => game.agreeDraw()}
              >
                Draw
              </button>
            </>
          )}
          {/* While the game runs, saving lives here; once it ends the banner
              carries it, which is the moment you actually decide. */}
          {gameOver ? null : saveButton}
          {isWatching ? null : (
            <button
              type="button"
              className="button button--danger"
              disabled={gameOver}
              onClick={() => game.resign(state.position.sideToMove)}
            >
              Resign
            </button>
          )}
          <button type="button" className="button" onClick={onNewGame}>
            New game
          </button>
        </div>
      </aside>
    </div>
  )
}

function saveLabel(state: SaveState): string {
  switch (state) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved ✓'
    case 'error':
      return 'Retry save'
    case 'idle':
      return 'Save game'
  }
}

function seatNames(configuration: GameConfiguration): Record<PieceColor, string> {
  if (configuration.opponent === 'human') {
    return { white: 'White', black: 'Black' }
  }
  if (configuration.opponent === 'engines') {
    return { white: 'Stockfish (White)', black: 'Stockfish (Black)' }
  }
  const computer = `Computer · ${configuration.difficulty.label}`
  return configuration.playerColor === 'white'
    ? { white: 'You', black: computer }
    : { white: computer, black: 'You' }
}

/** What the saved record calls the occasion. */
function eventName(configuration: GameConfiguration): string {
  switch (configuration.opponent) {
    case 'computer':
      return `Game vs computer (${configuration.difficulty.label})`
    case 'engines':
      return `Stockfish match (${configuration.difficulty.label})`
    case 'human':
      return 'Two-player game'
  }
}
