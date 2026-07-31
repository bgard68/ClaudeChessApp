import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { Square } from '@domain/chess/Square'
import { dailySeed } from '@application/puzzle/DailyPuzzle'
import { mateStartingMove, solvesMateWithin, toughestDefence } from '@application/puzzle/mate'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { ChessBoardView } from '../components/ChessBoardView'
import { ScreenHeader } from '../components/ScreenHeader'
import { todaysPuzzle, type StoredDailyPuzzle } from '../dailyPuzzle'
import {
  dayKey,
  loadStreak,
  recordSolve,
  saveStreak,
  streakOn,
  type PuzzleStreak,
} from '../puzzleStreak'
import { useServices } from '../ServicesContext'

type Phase =
  | { readonly kind: 'generating'; readonly ply: number }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly puzzle: StoredDailyPuzzle }

type SolveStatus = 'solving' | 'wrong' | 'solved'

interface PuzzleScreenProps {
  readonly onBack: () => void
}

export function PuzzleScreen({ onBack }: PuzzleScreenProps) {
  const { services, factory } = useServices()
  const rules = services.rules
  const today = useMemo(() => dayKey(new Date()), [])
  const [phase, setPhase] = useState<Phase>({ kind: 'generating', ply: 0 })
  const [position, setPosition] = useState<Position | null>(null)
  const [movesLeft, setMovesLeft] = useState(2)
  const [status, setStatus] = useState<SolveStatus>('solving')
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null)
  const [streak, setStreak] = useState<PuzzleStreak>(() => loadStreak())

  const begin = useCallback(
    (puzzle: StoredDailyPuzzle) => {
      setPosition(rules.positionFromFen(puzzle.fen))
      setMovesLeft(puzzle.mateIn)
      setStatus('solving')
      setLastMove(null)
      setHint(null)
    },
    [rules],
  )

  /** Only the rules can say whether a stored FEN still loads; loading throws. */
  const isUsable = useCallback(
    (puzzle: StoredDailyPuzzle) => {
      try {
        rules.positionFromFen(puzzle.fen)
        return true
      } catch {
        return false
      }
    },
    [rules],
  )

  const load = useCallback(() => {
    let cancelled = false
    setPhase({ kind: 'generating', ply: 0 })
    todaysPuzzle(
      today,
      () =>
        factory.createPuzzleGenerator().generate(dailySeed(new Date()), (ply) => {
          if (!cancelled) {
            setPhase((current) =>
              current.kind === 'generating' ? { kind: 'generating', ply } : current,
            )
          }
        }),
      isUsable,
    )
      .then((puzzle) => {
        if (cancelled) return
        setPhase({ kind: 'ready', puzzle })
        begin(puzzle)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setPhase({
          kind: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        })
      })

    return () => {
      cancelled = true
    }
  }, [factory, today, begin, isUsable])

  useEffect(() => load(), [load])

  const tryMove = (intent: MoveIntent): boolean => {
    if (position === null || status === 'solved') return false
    setHint(null)

    if (!solvesMateWithin(rules, position, intent, movesLeft)) {
      setStatus('wrong')
      return false
    }

    const played = rules.play(position, intent)!
    setLastMove({ from: intent.from, to: intent.to })

    const outcome = rules.outcome(played.position, [played.position])
    if (outcome.status === 'decisive' && outcome.reason === 'checkmate') {
      setPosition(played.position)
      setStatus('solved')
      const next = recordSolve(streak, today)
      setStreak(next)
      saveStreak(next)
      return true
    }

    const defence = toughestDefence(rules, played.position)!
    const defended = rules.play(played.position, defence)!
    setPosition(defended.position)
    setLastMove({ from: defence.from, to: defence.to })
    setMovesLeft(movesLeft - 1)
    setStatus('solving')
    return true
  }

  const showHint = () => {
    if (position === null || status === 'solved') return
    const move = mateStartingMove(rules, position, movesLeft)
    if (move !== null) setHint({ from: move.from, to: move.to })
  }

  const shownStreak = streakOn(streak, today)
  const sideToMove =
    phase.kind === 'ready'
      ? rules.positionFromFen(phase.puzzle.fen).sideToMove
      : 'white'
  const totalMoves = phase.kind === 'ready' ? phase.puzzle.mateIn : movesLeft
  // The objective is fixed; only the countdown moves. Solving the last move
  // never decrements movesLeft — it ends the puzzle — so a solved board would
  // otherwise sit there claiming a move is still owed.
  const remaining = status === 'solved' ? 0 : movesLeft
  const feedback = puzzleFeedback(status, shownStreak)

  return (
    <div className="screen screen--puzzle phase2-puzzle phase3-puzzle phase46-puzzle">
      <ScreenHeader
        kicker="Daily training"
        // The top bar already names the destination "Puzzle of the day"; this
        // names the task, as the setup screen does with "Choose your match".
        // Repeating the destination stacked the same two lines twice.
        title="Today’s position"
        description="Find the forcing continuation composed locally by Stockfish."
        onBack={onBack}
        backLabel="Back to play"
        metrics={
          <div className="phase2-puzzle-metrics phase46-puzzle-metrics">
            <span>
              <AppIcon name="sparkles" size={16} />
              <strong>{shownStreak}</strong>
              <small>day streak</small>
            </span>
            <span>
              <AppIcon name="clock" size={16} />
              <strong>{remaining}</strong>
              <small>moves left</small>
            </span>
          </div>
        }
      />

      {phase.kind === 'generating' ? (
        <section className="phase2-loading-card phase46-loading-card" role="status">
          <span className="phase2-loader" aria-hidden="true" />
          <div>
            <p className="phase2-kicker">Generating locally</p>
            <strong>Stockfish is composing today’s puzzle.</strong>
            <p>{phase.ply === 0 ? 'Warming up…' : `Playing move ${Math.ceil(phase.ply / 2)}…`}</p>
          </div>
          <div className="phase46-loading-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </section>
      ) : null}

      {phase.kind === 'error' ? (
        <section className="phase2-loading-card phase46-loading-card phase46-loading-card--error" role="alert">
          <span className="phase46-state-icon" aria-hidden="true">
            <AppIcon name="warning" size={22} />
          </span>
          <div>
            <p className="phase2-kicker">Puzzle unavailable</p>
            <p className="notice notice--error">{phase.message}</p>
            <button type="button" className="button" onClick={() => load()}>
              <AppIcon name="sparkles" size={16} />
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {phase.kind === 'ready' && position !== null ? (
        <div className="phase2-puzzle-grid phase46-puzzle-grid">
          <section className="phase2-board-column phase46-board-column" aria-label="Puzzle board">
            <div className="phase46-puzzle-board-meta">
              <span>
                <AppIcon name="puzzle" size={16} />
                {sideToMove === 'white' ? 'White' : 'Black'} to move
              </span>
              <span>{status === 'solved' ? 'Solved' : `Mate in ${movesLeft}`}</span>
            </div>
            <div className="phase2-board-frame phase46-board-frame" data-status={status}>
              {/* Same react-chessboard v5 component and prop contract. */}
              <ChessBoardView
                fen={position.fen}
                orientation={sideToMove}
                interactive={status !== 'solved'}
                legalMoves={rules.legalMoves(position)}
                lastMove={lastMove}
                hint={hint}
                onMove={tryMove}
              />
              {status === 'solved' ? (
                <span className="phase46-solved-badge" role="status">
                  <AppIcon name="check" size={18} />
                  Solved
                </span>
              ) : null}
            </div>
          </section>

          <aside className="phase2-puzzle-panel phase46-puzzle-panel">
            <section className="phase2-panel-card phase2-puzzle-objective phase46-objective-card">
              <div className="phase46-card-icon" aria-hidden="true">
                <AppIcon name="puzzle" size={20} />
              </div>
              <div>
                <p className="phase2-kicker">Objective</p>
                <h2>{sideToMove === 'white' ? 'White' : 'Black'} to move</h2>
                <p className="phase2-puzzle-target">Mate in {totalMoves}</p>
                <p>
                  Any legal continuation that preserves the forced mate is accepted.
                </p>
              </div>
            </section>

            <PuzzleProgress total={totalMoves} remaining={remaining} solved={status === 'solved'} />

            <p
              className={`puzzle__prompt phase2-puzzle-feedback phase46-puzzle-feedback${
                status === 'wrong'
                  ? ' puzzle__prompt--wrong'
                  : status === 'solved'
                    ? ' puzzle__prompt--solved'
                    : ''
              }`}
              data-status={status}
              aria-live="polite"
            >
              <span className="phase46-state-icon" aria-hidden="true">
                <AppIcon name={feedback.icon} size={19} />
              </span>
              <span>{feedback.message}</span>
            </p>

            <section className="phase2-panel-card phase46-details-card">
              <div className="phase2-section-title">
                <span>Puzzle details</span>
                <small>Daily position</small>
              </div>
              <dl className="phase2-detail-list">
                <div><dt>Composed</dt><dd>Today</dd></div>
                <div><dt>Mate occurred</dt><dd>Move {phase.puzzle.mateOnMove}</dd></div>
                <div><dt>Resets</dt><dd>At midnight</dd></div>
              </dl>
            </section>

            <div className="puzzle__actions phase2-puzzle-actions phase46-puzzle-actions">
              {status === 'solved' ? null : (
                <button type="button" className="button button--primary" onClick={showHint}>
                  <AppIcon name="hint" size={16} />
                  Show hint
                </button>
              )}
              <button type="button" className="button" onClick={() => begin(phase.puzzle)}>
                <AppIcon name="undo" size={16} />
                Start over
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function PuzzleProgress({
  total,
  remaining,
  solved,
}: {
  readonly total: number
  readonly remaining: number
  readonly solved: boolean
}) {
  const completed = solved ? total : Math.max(0, total - remaining)

  return (
    <section className="phase2-panel-card phase46-puzzle-progress" aria-label="Puzzle progress">
      <div className="phase2-section-title">
        <span>Combination</span>
        <small>{solved ? 'Complete' : `${completed} of ${total}`}</small>
      </div>
      <ol>
        {Array.from({ length: total }, (_, index) => {
          const step = index + 1
          const state = solved || step <= completed ? 'complete' : step === completed + 1 ? 'current' : 'upcoming'
          return (
            <li key={step} data-state={state}>
              <span>{state === 'complete' ? <AppIcon name="check" size={13} /> : step}</span>
              <small>{state === 'complete' ? 'Found' : state === 'current' ? 'Find move' : 'Next'}</small>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function puzzleFeedback(
  status: SolveStatus,
  streak: number,
): { readonly icon: AppIconName; readonly message: string } {
  switch (status) {
    case 'solved':
      return {
        icon: 'check',
        message: `Checkmate — solved!${streak > 1 ? ` ${streak} days running.` : ''}`,
      }
    case 'wrong':
      return {
        icon: 'warning',
        message: 'That move lets the mate slip away. Look for a forcing move.',
      }
    case 'solving':
      return {
        icon: 'hint',
        message: 'Your move. Checks, captures, and threats are a good place to start.',
      }
  }
}
