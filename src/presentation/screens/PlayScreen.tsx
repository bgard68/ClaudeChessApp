import { useEffect, useRef, useState } from 'react'
import { isOver } from '@domain/chess/GameOutcome'
import { opposite, type PieceColor } from '@domain/chess/Piece'
import type { Square } from '@domain/chess/Square'
import { describeTimeControl } from '@domain/clock/TimeControl'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { HintAdviser } from '@application/HintAdviser'
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

interface Hint {
  readonly from: Square
  readonly to: Square
  readonly san: string | null
}

interface PlayScreenProps {
  readonly game: LiveGame
  readonly configuration: GameConfiguration
  readonly onNewGame: () => void
}

export function PlayScreen({ game, configuration, onNewGame }: PlayScreenProps) {
  const state = useObservableStore(game)
  const { services, factory } = useServices()
  const durability = useLibraryDurability()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [hint, setHint] = useState<Hint | null>(null)
  const [isAdvising, setAdvising] = useState(false)
  const adviser = useRef<HintAdviser | null>(null)
  const [autoFlip, setAutoFlip] = useState(configuration.opponent === 'human')
  const [manualOrientation, setManualOrientation] = useState<PieceColor>(
    configuration.playerColor,
  )
  const orientation =
    autoFlip && !isOver(state.outcome) ? state.position.sideToMove : manualOrientation

  const gameOver = isOver(state.outcome)
  const isHumanToMove = state.awaiting?.kind === 'human'
  const lastMove = state.history.at(-1) ?? null
  const isWatching = configuration.opponent === 'engines'
  const names = seatNames(configuration)
  const fen = state.position.fen
  const fenNow = useRef(fen)
  fenNow.current = fen

  useEffect(() => setHint(null), [fen, gameOver])

  useEffect(
    () => () => {
      adviser.current?.dispose()
      adviser.current = null
    },
    [],
  )

  const requestHint = async () => {
    if (isAdvising) return
    setAdvising(true)
    const askedFor = state.position
    try {
      adviser.current ??= factory.createHintAdviser()
      const intent = await adviser.current.advise(askedFor)
      if (fenNow.current !== askedFor.fen) return
      const san = services.rules.play(askedFor, intent)?.move.san ?? null
      setHint({ from: intent.from, to: intent.to, san })
    } catch {
      // The screen closed while the worker was searching.
    } finally {
      setAdvising(false)
    }
  }

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
      <span aria-hidden="true">⌁</span>
      {saveLabel(saveState)}
    </button>
  )

  const durabilityWarning = describeDurability(durability)

  return (
    <div className="screen screen--play phase2-play">
      <section className="phase2-board-column" aria-label="Game board">
        <div className="phase2-board-heading">
          <div>
            <p className="phase2-kicker">{eventName(configuration)}</p>
            <h1>{names.white} vs {names.black}</h1>
          </div>
          <span className={`phase2-turn${state.isCheck ? ' phase2-turn--check' : ''}`}>
            {gameOver
              ? 'Game complete'
              : state.awaiting === null
                ? 'Starting…'
                : `${state.awaiting.name} to move`}
          </span>
        </div>

        <div className="phase2-board-frame">
          {/* Keep ChessBoardView mounted directly and preserve its v5 API and
              first-commit sizing behavior. Only its surrounding layout changes. */}
          <ChessBoardView
            fen={state.position.fen}
            orientation={orientation}
            interactive={isHumanToMove && !gameOver}
            legalMoves={state.legalMoves}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
            hint={hint}
            onMove={(intent) => game.submitMove(intent)}
          />
        </div>

        <div className="phase2-board-toolbar" aria-label="Board controls">
          <button
            type="button"
            className="phase2-icon-button"
            onClick={() => {
              if (autoFlip) {
                setManualOrientation(state.position.sideToMove)
                setAutoFlip(false)
              } else {
                setManualOrientation(opposite(manualOrientation))
              }
            }}
          >
            <span aria-hidden="true">↻</span>
            Flip
          </button>
          {!isWatching ? (
            <>
              <button
                type="button"
                className="phase2-icon-button"
                disabled={!isHumanToMove || gameOver || isAdvising}
                onClick={() => void requestHint()}
              >
                <span aria-hidden="true">◇</span>
                {isAdvising ? 'Thinking…' : 'Hint'}
              </button>
              <button
                type="button"
                className="phase2-icon-button"
                disabled={!state.canUndo}
                onClick={() => game.undo()}
              >
                <span aria-hidden="true">↶</span>
                Undo
              </button>
            </>
          ) : null}
          {configuration.opponent === 'human' ? (
            <label className="toggle phase2-auto-flip">
              <input
                type="checkbox"
                checked={autoFlip}
                onChange={(event) => setAutoFlip(event.target.checked)}
              />
              Auto-flip
            </label>
          ) : null}
        </div>
      </section>

      <aside className="play__panel phase2-game-panel">
        <section className="phase2-panel-card phase2-clock-card">
          <div className="phase2-section-title">
            <span>Game clock</span>
            <small>{describeTimeControl(state.timeControl)}</small>
          </div>
          <ClockPanel
            whiteMs={state.clock.whiteMs}
            blackMs={state.clock.blackMs}
            activeColor={state.clock.running}
            orientation={orientation}
            whiteName={names.white}
            blackName={names.black}
            note={describeTimeControl(state.timeControl)}
          />
        </section>

        <div className="play__status phase2-status-strip" aria-live="polite">
          {gameOver ? null : (
            <>
              {state.awaiting?.kind === 'engine' ? (
                <span className="play__thinking">Stockfish is thinking…</span>
              ) : null}
              {state.isCheck ? <span className="play__check">Check</span> : null}
              {hint?.san ? <span className="play__hint">Suggested: {hint.san}</span> : null}
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

        <section className="phase2-panel-card phase2-moves-card">
          <div className="phase2-section-title">
            <span>Move history</span>
            <small>{state.history.length} ply</small>
          </div>
          <div className="play__moves">
            <MoveList sanMoves={state.history.map((move) => move.san)} />
          </div>
        </section>

        <section className="phase2-panel-card">
          <div className="phase2-section-title">
            <span>Game actions</span>
          </div>
          <div className="play__actions phase2-action-grid">
            {!isWatching ? (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={gameOver}
                  onClick={() => game.agreeDraw()}
                >
                  Offer draw
                </button>
                {gameOver ? null : saveButton}
                <button
                  type="button"
                  className="button button--danger"
                  disabled={gameOver}
                  onClick={() => game.resign(state.position.sideToMove)}
                >
                  Resign
                </button>
              </>
            ) : null}
            <button type="button" className="button button--primary" onClick={onNewGame}>
              New game
            </button>
          </div>
        </section>
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

function eventName(configuration: GameConfiguration): string {
  switch (configuration.opponent) {
    case 'computer':
      return `Game vs computer · ${configuration.difficulty.label}`
    case 'engines':
      return `Stockfish match · ${configuration.difficulty.label}`
    case 'human':
      return 'Two-player game'
  }
}
