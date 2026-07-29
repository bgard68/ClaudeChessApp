import type { PieceColor } from '@domain/chess/Piece'
import { formatDuration } from '@domain/clock/formatDuration'

const LOW_TIME_MS = 30_000

interface ClockPanelProps {
  readonly whiteMs: number | null
  readonly blackMs: number | null
  readonly activeColor: PieceColor | null
  /** The side shown at the bottom of the board. */
  readonly orientation: PieceColor
  readonly whiteName: string
  readonly blackName: string
  /** Provenance note, e.g. that a replay clock is simulated. */
  readonly note?: string | null
}

/**
 * Both clocks, ordered to match the board.
 *
 * Shared by live play and replay. They differ only in where the numbers come
 * from, which is the caller's problem, not the display's.
 */
export function ClockPanel({
  whiteMs,
  blackMs,
  activeColor,
  orientation,
  whiteName,
  blackName,
  note,
}: ClockPanelProps) {
  const top: PieceColor = orientation === 'white' ? 'black' : 'white'
  const bottom: PieceColor = orientation === 'white' ? 'white' : 'black'

  const readingFor = (color: PieceColor) => (color === 'white' ? whiteMs : blackMs)
  const nameFor = (color: PieceColor) => (color === 'white' ? whiteName : blackName)

  return (
    <div className="clock-panel">
      <ClockFace
        name={nameFor(top)}
        color={top}
        ms={readingFor(top)}
        isActive={activeColor === top}
      />
      <ClockFace
        name={nameFor(bottom)}
        color={bottom}
        ms={readingFor(bottom)}
        isActive={activeColor === bottom}
      />
      {note ? <p className="clock-note">{note}</p> : null}
    </div>
  )
}

function ClockFace({
  name,
  color,
  ms,
  isActive,
}: {
  name: string
  color: PieceColor
  ms: number | null
  isActive: boolean
}) {
  const isLow = ms !== null && ms <= LOW_TIME_MS
  const classes = ['clock-face', `clock-face--${color}`]
  if (isActive) classes.push('clock-face--active')
  if (isLow) classes.push('clock-face--low')

  return (
    <div className={classes.join(' ')}>
      <span className="clock-face__name">{name}</span>
      <span className="clock-face__time">{formatDuration(ms)}</span>
    </div>
  )
}
