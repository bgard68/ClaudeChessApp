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

/**
 * The daily puzzle: the engine plays itself once per day on this device, and
 * the finish of that game is yours to find. Answers are judged by the rules —
 * any move that still forces the mate counts, not just the game's own.
 */
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

  /** Judged, not compared: any move that keeps the mate forced is right. */
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

    // The defender resists as well as a lost position allows, and play goes on.
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
    <div className="screen screen--puzzle">
      <header className="puzzle__header">
        <button type="button" className="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Puzzle of the day</h1>
        {shownStreak > 0 ? <span className="streak-pill">🔥 {shownStreak}-day streak</span> : null}
      </header>

      {phase.kind === 'generating' ? (
        <div className="puzzle__generating">
          <p>
            <strong>Stockfish is composing today's puzzle.</strong>
          </p>
          <p>
            It plays a fresh game against itself and serves you the finish —{' '}
            {phase.ply === 0 ? 'warming up…' : `playing move ${Math.ceil(phase.ply / 2)}…`}
          </p>
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div className="puzzle__generating">
          <p className="notice notice--error">{phase.message}</p>
          <button type="button" className="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      ) : null}

      {phase.kind === 'ready' && position !== null ? (
        <>
          <p className="puzzle__caption">
            Composed today by Stockfish playing itself — in its game, mate fell on move{' '}
            {phase.puzzle.mateOnMove}. Everyone's board turns over at midnight.
          </p>

          <ChessBoardView
            fen={position.fen}
            orientation={sideToMove}
            interactive={status !== 'solved'}
            legalMoves={rules.legalMoves(position)}
            lastMove={lastMove}
            hint={hint}
            onMove={tryMove}
          />

          <p
            className={`puzzle__prompt${
              status === 'wrong'
                ? ' puzzle__prompt--wrong'
                : status === 'solved'
                  ? ' puzzle__prompt--solved'
                  : ''
            }`}
          >
            {status === 'solved'
              ? `Checkmate — solved!${shownStreak > 1 ? ` ${shownStreak} days running.` : ''}`
              : status === 'wrong'
                ? 'Not that one — the mate slips away. Take it back and look again.'
                : `${sideToMove === 'white' ? 'White' : 'Black'} to move · mate in ${movesLeft}`}
          </p>

          <div className="puzzle__actions">
            {status === 'solved' ? null : (
              <button type="button" className="button" onClick={showHint}>
                💡 Hint
              </button>
            )}
            <button type="button" className="button" onClick={() => begin(phase.puzzle)}>
              Start over
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
