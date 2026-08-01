import { useEffect, useRef, useState } from 'react'
import { isOver } from '@domain/chess/GameOutcome'
import { opposite, type PieceColor } from '@domain/chess/Piece'
import type { Square } from '@domain/chess/Square'
import { describeTimeControl } from '@domain/clock/TimeControl'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { HintAdviser } from '@application/HintAdviser'
import type { LiveGame } from '@application/LiveGame'
import { recordGame } from '@application/recordGame'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { ChessBoardView } from '../components/ChessBoardView'
import { ClockPanel } from '../components/ClockPanel'
import { MoveList } from '../components/MoveList'
import { OutcomeBanner } from '../components/OutcomeBanner'
import { PanelDrawer } from '../components/PanelDrawer'
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
      <AppIcon name="save" size={16} />
      {saveLabel(saveState)}
    </button>
  )

  const durabilityWarning = describeDurability(durability)
  const currentStatus = statusForGame({
    gameOver,
    isAdvising,
    isCheck: state.isCheck,
    hintSan: hint?.san ?? null,
    awaitingKind: state.awaiting?.kind ?? null,
    awaitingName: state.awaiting?.name ?? null,
  })

  const compactStatus = (
    <div
      className="play__status phase2-status-strip phase46-status-strip"
      data-tone={currentStatus.tone}
      aria-live="polite"
    >
      <AppIcon name={currentStatus.icon} size={17} />
      <span>{currentStatus.label}</span>
    </div>
  )

  const gameActions = (
    <div className="play__actions phase2-action-grid">
      {!isWatching ? (
        <>
          <button type="button" className="button" disabled={gameOver} onClick={() => game.agreeDraw()}>
            <AppIcon name="draw" size={16} />
            Offer draw
          </button>
          {gameOver ? null : saveButton}
          <button
            type="button"
            className="button button--danger"
            disabled={gameOver}
            onClick={() => game.resign(state.position.sideToMove)}
          >
            <AppIcon name="resign" size={16} />
            Resign
          </button>
        </>
      ) : null}
      <button type="button" className="button button--primary" onClick={onNewGame}>
        <AppIcon name="play" size={16} />
        New game
      </button>
    </div>
  )

  return (
    <div className="screen screen--play phase2-play phase3-play phase46-play">
      <section className="phase2-board-column phase46-board-column" aria-label="Game board">
        <div className="phase2-board-heading phase46-board-heading">
          <div className="phase46-board-heading__copy">
            <p className="phase2-kicker">{eventName(configuration)}</p>
            <h1>{names.white} vs {names.black}</h1>
            <div className="phase46-game-meta" aria-label="Game details">
              <span>
                <AppIcon name="clock" size={14} />
                {describeTimeControl(state.timeControl)}
              </span>
              <span>Move {Math.floor(state.history.length / 2) + 1}</span>
              <span>{orientation === 'white' ? 'White' : 'Black'} perspective</span>
            </div>
          </div>
          <span
            className={`phase2-turn phase46-turn${state.isCheck ? ' phase2-turn--check' : ''}`}
            data-tone={state.isCheck ? 'warning' : gameOver ? 'complete' : 'live'}
          >
            <span className="phase46-live-dot" aria-hidden="true" />
            {gameOver
              ? 'Game complete'
              : state.awaiting === null
                ? 'Starting…'
                : `${state.awaiting.name} to move`}
          </span>
        </div>

        <div className="phase46-mobile-game-head">
          <ClockPanel
            whiteMs={state.clock.whiteMs}
            blackMs={state.clock.blackMs}
            activeColor={state.clock.running}
            orientation={orientation}
            whiteName={names.white}
            blackName={names.black}
          />
          {compactStatus}
        </div>

        <div className="phase2-board-frame phase46-board-frame">
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

        <div className="phase2-board-toolbar phase46-board-toolbar" aria-label="Board controls">
          <button
            type="button"
            className="phase2-icon-button"
            aria-label="Flip board orientation"
            onClick={() => {
              if (autoFlip) {
                setManualOrientation(state.position.sideToMove)
                setAutoFlip(false)
              } else {
                setManualOrientation(opposite(manualOrientation))
              }
            }}
          >
            <AppIcon name="flip" size={17} />
            Flip board
          </button>
          {!isWatching ? (
            <>
              <button
                type="button"
                className="phase2-icon-button"
                disabled={!isHumanToMove || gameOver || isAdvising}
                aria-busy={isAdvising}
                onClick={() => void requestHint()}
              >
                <AppIcon name="hint" size={17} />
                {isAdvising ? 'Thinking…' : 'Hint'}
              </button>
              <button
                type="button"
                className="phase2-icon-button"
                disabled={!state.canUndo}
                onClick={() => game.undo()}
              >
                <AppIcon name="undo" size={17} />
                Undo move
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
              Auto-flip after each move
            </label>
          ) : null}
        </div>

        <details className="phase46-mobile-game-menu">
          <summary>Game &amp; moves</summary>
          <PanelDrawer
            className="phase2-panel-card phase2-moves-card phase46-moves-card"
            title="Move history"
            note={`${state.history.length} ply`}
          >
            <div className="play__moves">
              <MoveList sanMoves={state.history.map((move) => move.san)} />
            </div>
          </PanelDrawer>
          {gameActions}
        </details>
      </section>

      <aside className="play__panel phase2-game-panel phase46-game-panel">
        <section className="phase2-panel-card phase2-clock-card phase46-clock-card">
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

        {compactStatus}

        <OutcomeBanner outcome={state.outcome} onNewGame={onNewGame}>
          {saveButton}
        </OutcomeBanner>

        {saveState === 'error' ? (
          <p className="notice notice--error">The game could not be saved.</p>
        ) : null}
        {durabilityWarning !== null && saveState !== 'saved' ? (
          <p className="clock-note">{durabilityWarning}</p>
        ) : null}

        <PanelDrawer
          className="phase2-panel-card phase2-moves-card phase46-moves-card"
          title="Move history"
          note={`${state.history.length} ply`}
        >
          <div className="play__moves">
            <MoveList sanMoves={state.history.map((move) => move.san)} />
          </div>
        </PanelDrawer>

        <section className="phase2-panel-card phase46-actions-card">
          <div className="phase2-section-title">
            <span>Game actions</span>
            <small>{gameOver ? 'Finished' : 'In progress'}</small>
          </div>
          {gameActions}
        </section>
      </aside>
    </div>
  )
}

function statusForGame({
  gameOver,
  isAdvising,
  isCheck,
  hintSan,
  awaitingKind,
  awaitingName,
}: {
  readonly gameOver: boolean
  readonly isAdvising: boolean
  readonly isCheck: boolean
  readonly hintSan: string | null
  readonly awaitingKind: 'human' | 'engine' | null
  readonly awaitingName: string | null
}): { readonly icon: AppIconName; readonly label: string; readonly tone: string } {
  if (gameOver) return { icon: 'check', label: 'The game is complete.', tone: 'complete' }
  if (isCheck) return { icon: 'warning', label: 'Check — respond to the attack.', tone: 'warning' }
  if (isAdvising) return { icon: 'sparkles', label: 'Stockfish is finding a useful idea…', tone: 'thinking' }
  if (hintSan !== null) return { icon: 'hint', label: `Suggested move: ${hintSan}`, tone: 'hint' }
  if (awaitingKind === 'engine') {
    return { icon: 'computer', label: `${awaitingName ?? 'Stockfish'} is thinking…`, tone: 'thinking' }
  }
  if (awaitingKind === 'human') {
    return { icon: 'play', label: `${awaitingName ?? 'Player'} can move.`, tone: 'live' }
  }
  return { icon: 'clock', label: 'Starting the game…', tone: 'neutral' }
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
