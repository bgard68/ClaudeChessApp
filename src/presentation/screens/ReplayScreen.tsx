import { useEffect, type CSSProperties } from 'react'
import { displayYear } from '@domain/archive/ArchivedGame'
import { describeTimeControl } from '@domain/clock/TimeControl'
import { REPLAY_SPEEDS, type ReplaySession, type ReplaySpeed } from '@application/replay/ReplaySession'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { ChessBoardView } from '../components/ChessBoardView'
import { ClockPanel } from '../components/ClockPanel'
import { MoveList } from '../components/MoveList'
import { describeOutcome } from '../components/OutcomeBanner'
import { ScreenHeader } from '../components/ScreenHeader'
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
      if (isEditableTarget(event.target)) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          session.previous()
          break
        case 'ArrowRight':
          event.preventDefault()
          session.next()
          break
        case 'Home':
          event.preventDefault()
          session.first()
          break
        case 'End':
          event.preventDefault()
          session.last()
          break
        case ' ':
          event.preventDefault()
          session.togglePlay()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])

  const detail = [
    game.event,
    game.round === '' || game.round === '-' || game.round === '?' ? null : `Round ${game.round}`,
    displayYear(game.date),
  ].filter((part): part is string => part !== null && part !== '')
  const progress = state.totalPlies === 0 ? 0 : Math.round((state.ply / state.totalPlies) * 100)

  return (
    <div className="screen screen--replay phase3-replay phase46-replay">
      <ScreenHeader
        kicker="Championship replay"
        title={`${game.white} vs ${game.black}`}
        description={`${detail.join(' · ')} · ${describeOutcome(game.outcome)}`}
        onBack={onBack}
        backLabel="Back to championships"
        metrics={
          <div className="phase3-replay__position-summary phase46-replay__position-summary" aria-live="polite">
            <span className="phase46-replay__position-icon" aria-hidden="true">
              <AppIcon name={state.isPlaying ? 'play' : 'pause'} size={15} />
            </span>
            <strong>{state.ply}</strong>
            <span>of {state.totalPlies} ply</span>
          </div>
        }
      />

      <section className="phase3-replay__board-column phase46-board-column" aria-label="Replay board">
        <div className="phase46-replay__board-meta">
          <span>
            <AppIcon name="archive" size={15} />
            {state.ply === 0 ? 'Starting position' : `Move ${Math.ceil(state.ply / 2)}`}
          </span>
          <span>{progress}% complete</span>
        </div>
        <div className="phase2-board-frame phase3-replay__board-frame phase46-board-frame">
          <ChessBoardView
            fen={state.position.fen}
            orientation="white"
            interactive={false}
            legalMoves={[]}
            lastMove={
              state.lastMove ? { from: state.lastMove.from, to: state.lastMove.to } : null
            }
          />
        </div>

        <p className="phase3-replay__shortcuts phase46-replay__shortcuts">
          <kbd>←</kbd>/<kbd>→</kbd> move · <kbd>Space</kbd> play or pause · <kbd>Home</kbd>/<kbd>End</kbd> jump
        </p>
      </section>

      <aside className="play__panel phase3-replay__panel phase46-replay__panel">
        <section className="phase2-panel-card phase2-clock-card phase46-clock-card">
          <div className="phase2-section-title">
            <span>Game clock</span>
            <small>{clockSourceLabel(session)}</small>
          </div>
          <ClockPanel
            whiteMs={state.clock.whiteMs}
            blackMs={state.clock.blackMs}
            activeColor={state.ply === 0 ? null : state.lastMove?.color ?? null}
            orientation="white"
            whiteName={game.white}
            blackName={game.black}
            note={clockNote(session)}
          />
        </section>

        <section className="phase2-panel-card phase3-replay__transport-card phase46-transport-card">
          <div className="phase2-section-title">
            <span>Replay controls</span>
            <small>Move {Math.ceil(state.ply / 2) || 0} of {Math.ceil(state.totalPlies / 2)}</small>
          </div>

          <div className="replay__transport phase3-replay__transport" role="group" aria-label="Replay transport">
            <TransportButton label="First position" icon="first" onClick={() => session.first()} />
            <TransportButton label="Previous move" icon="previous" onClick={() => session.previous()} />
            <button
              type="button"
              className="button button--primary phase3-replay__play phase46-replay__play"
              aria-label={state.isPlaying ? 'Pause replay' : 'Play replay'}
              onClick={() => session.togglePlay()}
            >
              <AppIcon name={state.isPlaying ? 'pause' : 'play'} size={17} />
              {state.isPlaying ? 'Pause' : 'Play'}
            </button>
            <TransportButton label="Next move" icon="next" onClick={() => session.next()} />
            <TransportButton label="Final position" icon="last" onClick={() => session.last()} />
          </div>

          <label className="phase3-replay__scrubber-label phase46-replay__scrubber-label">
            <span className="visually-hidden">Move position</span>
            <input
              className="replay__scrubber"
              type="range"
              min={0}
              max={state.totalPlies}
              value={state.ply}
              style={{ '--replay-progress': `${progress}%` } as CSSProperties}
              onChange={(event) => session.goTo(Number(event.target.value))}
            />
            <span className="phase46-replay__scrubber-meta" aria-hidden="true">
              <span>Start</span>
              <span>{progress}%</span>
              <span>Finish</span>
            </span>
          </label>

          <div className="replay__speed phase3-replay__speed" role="group" aria-label="Replay speed">
            <span>Speed</span>
            {REPLAY_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={`chip${state.speed === speed ? ' chip--selected' : ''}`}
                aria-pressed={state.speed === speed}
                onClick={() => session.setSpeed(speed as ReplaySpeed)}
              >
                {speed}×
              </button>
            ))}
          </div>
        </section>

        <section className="phase2-panel-card phase2-moves-card phase3-replay__moves-card phase46-moves-card">
          <div className="phase2-section-title">
            <span>Move history</span>
            <small>{state.totalPlies} ply</small>
          </div>
          <div className="play__moves">
            <MoveList
              sanMoves={game.moves.map((move) => move.san)}
              currentPly={state.ply}
              onSelectPly={(ply) => session.goTo(ply)}
            />
          </div>
        </section>
      </aside>
    </div>
  )
}

function TransportButton({
  label,
  icon,
  onClick,
}: {
  readonly label: string
  readonly icon: AppIconName
  readonly onClick: () => void
}) {
  return (
    <button type="button" className="button phase3-replay__step" aria-label={label} title={label} onClick={onClick}>
      <AppIcon name={icon} size={16} />
    </button>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.matches('input, textarea, select, button, a[href], [role="button"], [role="slider"]')
  )
}

function clockSourceLabel(session: ReplaySession): string {
  return session.clockModelInfo.source === 'recorded' ? 'Recorded' : 'Estimated'
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
