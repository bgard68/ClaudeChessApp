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

/**
 * A hint, and the position it belongs to.
 *
 * One value rather than an `isAdvising` boolean beside a nullable hint. Two
 * variables made four combinations where only three are reachable, and the
 * unreachable one — thinking, with a hint already on the board — had to be
 * excluded by *ordering the branches* of the status line rather than by being
 * impossible. The states also could not express an answer that arrived too late
 * to use, so that case had no words and said nothing at all.
 *
 * Every variant carries the FEN it applies to, and `adviceFor` below is the
 * only reader. Advice for a position that has since been played out of is not
 * stale state to be cleared by an effect — it simply is not advice about the
 * position on the board.
 */
export type Advice =
  | { readonly kind: 'none' }
  | { readonly kind: 'thinking'; readonly fen: string }
  | {
      readonly kind: 'ready'
      readonly fen: string
      readonly from: Square
      readonly to: Square
      readonly san: string | null
    }
  /** The engine answered, but about a position no longer on the board. */
  | { readonly kind: 'stale'; readonly fen: string }
  | { readonly kind: 'failed'; readonly fen: string }

/**
 * The advice as it applies to `fen` — which is none, for anything asked about
 * or answered about another position.
 *
 * Exported for its own tests: the screen reaches these states only through a
 * worker search, which a static render cannot drive.
 */
export function adviceFor(advice: Advice, fen: string): Advice {
  if (advice.kind === 'none') return advice
  return advice.fen === fen ? advice : { kind: 'none' }
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
  /*
   * The save, and the move count it was made at.
   *
   * `saved` disabled the button on the grounds that the game had been stored —
   * and then kept it disabled as play continued, so a game saved at move 20 and
   * played on to move 40 could not be saved again. Stamped with the ply it
   * covers, the button re-arms itself the moment there is something new to save.
   */
  const [save, setSave] = useState<{ kind: SaveState; ply: number }>({
    kind: 'idle',
    ply: 0,
  })
  const [advice, setAdvice] = useState<Advice>({ kind: 'none' })
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

  // Only ever read by the search below, to learn what the board was showing by
  // the time its answer arrived. Written after the commit rather than during the
  // render: a render can be discarded — StrictMode throws one away on purpose —
  // and a ref written by one that never committed describes a tree nobody saw.
  const committedFen = useRef(fen)
  useEffect(() => {
    committedFen.current = fen
  })

  const currentAdvice = adviceFor(advice, fen)
  const isAdvising = currentAdvice.kind === 'thinking'
  const saveState: SaveState = save.ply === state.history.length ? save.kind : 'idle'

  useEffect(
    () => () => {
      adviser.current?.dispose()
      adviser.current = null
    },
    [],
  )

  const requestHint = async () => {
    if (isAdvising) return
    const askedFor = state.position
    setAdvice({ kind: 'thinking', fen: askedFor.fen })
    try {
      adviser.current ??= factory.createHintAdviser()
      const intent = await adviser.current.advise(askedFor)
      const san = services.rules.play(askedFor, intent)?.move.san ?? null
      // Answered about the position still on the board, or about one that has
      // been played out of — in which case say so, against the position the
      // player is actually looking at. Silently dropping it left the button
      // going quiet with no hint and no explanation.
      setAdvice(
        committedFen.current === askedFor.fen
          ? { kind: 'ready', fen: askedFor.fen, from: intent.from, to: intent.to, san }
          : { kind: 'stale', fen: committedFen.current },
      )
    } catch {
      // The screen closed, or the engine went away, while the worker searched.
      setAdvice({ kind: 'failed', fen: committedFen.current })
    }
  }

  const saveGame = async () => {
    const ply = state.history.length
    setSave({ kind: 'saving', ply })
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
      setSave({ kind: 'saved', ply })
    } catch (error) {
      console.error('Could not save the game.', error)
      setSave({ kind: 'error', ply })
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
    engineFailure: state.engineFailure,
    advice: currentAdvice,
    isCheck: state.isCheck,
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
            hint={
              currentAdvice.kind === 'ready'
                ? { from: currentAdvice.from, to: currentAdvice.to }
                : null
            }
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

        {state.engineFailure !== null ? (
          <p className="notice notice--error">
            {state.engineFailure} Your moves so far are safe on this device.
          </p>
        ) : null}
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

/** Exported for its own tests, as `adviceFor` is and for the same reason. */
export function statusForGame({
  gameOver,
  engineFailure,
  advice,
  isCheck,
  awaitingKind,
  awaitingName,
}: {
  readonly gameOver: boolean
  readonly engineFailure: string | null
  readonly advice: Advice
  readonly isCheck: boolean
  readonly awaitingKind: 'human' | 'engine' | null
  readonly awaitingName: string | null
}): { readonly icon: AppIconName; readonly label: string; readonly tone: string } {
  if (gameOver) return { icon: 'check', label: 'The game is complete.', tone: 'complete' }
  // Above check, and above whose turn it is: both describe a game that can
  // continue, and this one cannot. Said here because the alternative — which is
  // what happened — is a board that claims the computer is still thinking for
  // as long as the page stays open.
  if (engineFailure !== null) {
    return {
      icon: 'warning',
      label: 'The engine stopped responding. Save or start a new game.',
      tone: 'warning',
    }
  }
  if (isCheck) return { icon: 'warning', label: 'Check — respond to the attack.', tone: 'warning' }
  if (advice.kind === 'thinking') {
    return { icon: 'sparkles', label: 'Stockfish is finding a useful idea…', tone: 'thinking' }
  }
  if (advice.kind === 'ready' && advice.san !== null) {
    return { icon: 'hint', label: `Suggested move: ${advice.san}`, tone: 'hint' }
  }
  // Worth saying out loud. The alternative — which is what happened — is a
  // Hint button that stops saying "Thinking…" and produces nothing.
  if (advice.kind === 'stale') {
    return {
      icon: 'hint',
      label: 'The position changed before the hint arrived. Ask again.',
      tone: 'neutral',
    }
  }
  if (advice.kind === 'failed') {
    return { icon: 'warning', label: 'The hint is unavailable.', tone: 'warning' }
  }
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
