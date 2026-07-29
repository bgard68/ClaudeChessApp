import { useEffect } from 'react'
import { displayYear } from '@domain/archive/ArchivedGame'
import { describeTimeControl } from '@domain/clock/TimeControl'
import { REPLAY_SPEEDS, type ReplaySession, type ReplaySpeed } from '@application/replay/ReplaySession'
import { ChessBoardView } from '../components/ChessBoardView'
import { ClockPanel } from '../components/ClockPanel'
import { MoveList } from '../components/MoveList'
import { describeOutcome } from '../components/OutcomeBanner'
import { useObservableStore } from '../hooks/useObservableStore'

interface ReplayScreenProps {
  readonly session: ReplaySession
  readonly onBack: () => void
}

export function ReplayScreen({ session, onBack }: ReplayScreenProps) {
  const state = useObservableStore(session)
  const { game } = state

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowLeft') session.previous()
      else if (event.key === 'ArrowRight') session.next()
      else if (event.key === ' ') {
        event.preventDefault()
        session.togglePlay()
      } else return
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])

  return (
    <div className="screen screen--replay">
      <ChessBoardView
        fen={state.position.fen}
        orientation="white"
        interactive={false}
        legalMoves={[]}
        lastMove={
          state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null
        }
      />

      <aside className="play__panel">
        <header className="replay__header">
          <button type="button" className="button" onClick={onBack}>
            ← Back
          </button>
          <h2>
            {game.white} vs {game.black}
          </h2>
          <p className="replay__meta">
            {game.event} · round {game.round} · {displayYear(game.date)}
          </p>
          <p className="replay__meta">{describeOutcome(game.outcome)}</p>
        </header>

        <ClockPanel
          whiteMs={state.clock.whiteMs}
          blackMs={state.clock.blackMs}
          activeColor={state.ply === 0 ? null : state.lastMove?.color ?? null}
          orientation="white"
          whiteName={game.white}
          blackName={game.black}
          note={clockNote(session)}
        />

        <div className="replay__transport">
          <button type="button" className="button" onClick={() => session.first()} title="Start">
            ⏮
          </button>
          <button type="button" className="button" onClick={() => session.previous()} title="Previous move">
            ◀
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => session.togglePlay()}
          >
            {state.isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button type="button" className="button" onClick={() => session.next()} title="Next move">
            ▶
          </button>
          <button type="button" className="button" onClick={() => session.last()} title="End">
            ⏭
          </button>
        </div>

        <div className="replay__speed">
          <span>Speed</span>
          {REPLAY_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`chip${state.speed === speed ? ' chip--selected' : ''}`}
              onClick={() => session.setSpeed(speed as ReplaySpeed)}
            >
              {speed}×
            </button>
          ))}
        </div>

        <input
          className="replay__scrubber"
          type="range"
          min={0}
          max={state.totalPlies}
          value={state.ply}
          onChange={(event) => session.goTo(Number(event.target.value))}
          aria-label="Move position"
        />
        <p className="replay__position">
          Move {Math.ceil(state.ply / 2) || 0} of {Math.ceil(state.totalPlies / 2)}
        </p>

        <div className="play__moves">
          <MoveList
            sanMoves={game.moves.map((move) => move.san)}
            currentPly={state.ply}
            onSelectPly={(ply) => session.goTo(ply)}
          />
        </div>
      </aside>
    </div>
  )
}

/**
 * States plainly where the numbers on the clock came from. A simulated reading
 * presented without comment would be indistinguishable from a historical record
 * that does not exist.
 */
function clockNote(session: ReplaySession): string {
  const model = session.clockModelInfo

  if (model.source === 'recorded') {
    return 'Clock times as recorded in the source PGN.'
  }
  const control =
    model.assumedControl === null ? 'a standard control' : describeTimeControl(model.assumedControl)
  return `Simulated clock — this game was never recorded with move times. Estimated from ${control}, spent at an even pace.`
}
