import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { Square } from '@domain/chess/Square'
import { dailySeed } from '@application/puzzle/DailyPuzzle'
import { mateStartingMove, solvesMateWithin, toughestDefence } from '@application/puzzle/mate'
import { ChessBoardView } from '../components/ChessBoardView'
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

  const load = useCallback(() => {
    let cancelled = false
    setPhase({ kind: 'generating', ply: 0 })
    todaysPuzzle(today, () =>
      factory.createPuzzleGenerator().generate(dailySeed(new Date()), (ply) => {
        if (!cancelled) {
          setPhase((current) =>
            current.kind === 'generating' ? { kind: 'generating', ply } : current,
          )
        }
      }),
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
  }, [factory, today, begin])

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

  return (
    <div className="screen screen--puzzle phase2-puzzle">
      <header className="phase2-page-heading">
        <button type="button" className="phase2-back-button" onClick={onBack}>
          ← Back to play
        </button>
        <div>
          <p className="phase2-kicker">Daily training</p>
          <h1>Puzzle of the day</h1>
          <p>Find the forcing continuation composed locally by Stockfish.</p>
        </div>
        <div className="phase2-puzzle-metrics">
          <span><strong>{shownStreak}</strong><small>day streak</small></span>
          <span><strong>{movesLeft}</strong><small>moves left</small></span>
        </div>
      </header>

      {phase.kind === 'generating' ? (
        <section className="phase2-loading-card">
          <span className="phase2-loader" aria-hidden="true" />
          <div>
            <strong>Stockfish is composing today’s puzzle.</strong>
            <p>{phase.ply === 0 ? 'Warming up…' : `Playing move ${Math.ceil(phase.ply / 2)}…`}</p>
          </div>
        </section>
      ) : null}

      {phase.kind === 'error' ? (
        <section className="phase2-loading-card">
          <div>
            <p className="notice notice--error">{phase.message}</p>
            <button type="button" className="button" onClick={() => load()}>
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {phase.kind === 'ready' && position !== null ? (
        <div className="phase2-puzzle-grid">
          <section className="phase2-board-column">
            <div className="phase2-board-frame">
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
            </div>
          </section>

          <aside className="phase2-puzzle-panel">
            <section className="phase2-panel-card phase2-puzzle-objective">
              <p className="phase2-kicker">Objective</p>
              <h2>{sideToMove === 'white' ? 'White' : 'Black'} to move</h2>
              <p className="phase2-puzzle-target">Mate in {movesLeft}</p>
              <p>
                The answer is judged by the rules. Any move that preserves the
                forced mate is accepted.
              </p>
            </section>

            <p
              className={`puzzle__prompt phase2-puzzle-feedback${
                status === 'wrong'
                  ? ' puzzle__prompt--wrong'
                  : status === 'solved'
                    ? ' puzzle__prompt--solved'
                    : ''
              }`}
              aria-live="polite"
            >
              {status === 'solved'
                ? `Checkmate — solved!${shownStreak > 1 ? ` ${shownStreak} days running.` : ''}`
                : status === 'wrong'
                  ? 'That move lets the mate slip away. Look for a forcing move.'
                  : 'Your move. Checks, captures, and threats are a good place to start.'}
            </p>

            <section className="phase2-panel-card">
              <div className="phase2-section-title">
                <span>Puzzle details</span>
              </div>
              <dl className="phase2-detail-list">
                <div><dt>Composed</dt><dd>Today</dd></div>
                <div><dt>Mate occurred</dt><dd>Move {phase.puzzle.mateOnMove}</dd></div>
                <div><dt>Resets</dt><dd>At midnight</dd></div>
              </dl>
            </section>

            <div className="puzzle__actions phase2-puzzle-actions">
              {status === 'solved' ? null : (
                <button type="button" className="button button--primary" onClick={showHint}>
                  Show hint
                </button>
              )}
              <button type="button" className="button" onClick={() => begin(phase.puzzle)}>
                Start over
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
