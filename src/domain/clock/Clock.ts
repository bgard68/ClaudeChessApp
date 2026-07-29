import type { PieceColor } from '../chess/Piece'
import type { TimeControl, TimeStage } from './TimeControl'

export interface ClockSnapshot {
  /** Remaining milliseconds, or `null` when the game is untimed. */
  readonly whiteMs: number | null
  readonly blackMs: number | null
  readonly running: PieceColor | null
  readonly flagged: PieceColor | null
}

interface PlayerClock {
  readonly remainingMs: number | null
  readonly stageIndex: number
  readonly movesInStage: number
}

/**
 * An immutable chess clock.
 *
 * It knows nothing about wall time: callers advance it by an elapsed duration.
 * That is what makes flag-fall and stage transitions testable without waiting
 * for real seconds to pass, and it lets the same class drive both live play and
 * a simulated replay.
 */
export class Clock {
  private constructor(
    private readonly control: TimeControl,
    private readonly white: PlayerClock,
    private readonly black: PlayerClock,
    readonly running: PieceColor | null,
  ) {}

  static forControl(control: TimeControl): Clock {
    const startingMs =
      control.kind === 'unlimited' ? null : (control.stages[0]?.addedMs ?? 0)
    const player: PlayerClock = { remainingMs: startingMs, stageIndex: 0, movesInStage: 0 }
    return new Clock(control, player, player, null)
  }

  get isUntimed(): boolean {
    return this.control.kind === 'unlimited'
  }

  remainingMs(color: PieceColor): number | null {
    return this.playerFor(color).remainingMs
  }

  get flagged(): PieceColor | null {
    if (this.white.remainingMs === 0) return 'white'
    if (this.black.remainingMs === 0) return 'black'
    return null
  }

  /** Hands the clock to `color`. The previous side stops being charged. */
  startTurn(color: PieceColor): Clock {
    if (this.isUntimed || this.running === color) return this
    return new Clock(this.control, this.white, this.black, color)
  }

  pause(): Clock {
    if (this.running === null) return this
    return new Clock(this.control, this.white, this.black, null)
  }

  /** Charges `elapsedMs` to whichever side is on the move. */
  advance(elapsedMs: number): Clock {
    const color = this.running
    if (color === null || this.isUntimed || elapsedMs <= 0) return this

    const player = this.playerFor(color)
    if (player.remainingMs === null || player.remainingMs === 0) return this

    const remainingMs = Math.max(0, player.remainingMs - elapsedMs)
    return this.withPlayer(color, { ...player, remainingMs })
  }

  /**
   * Applies the bookkeeping owed once a move is finished: the increment for the
   * current stage, and — if the stage's move quota is met — the next stage's
   * time bonus. Does not switch sides; call `startTurn` for that.
   */
  completeMove(color: PieceColor): Clock {
    if (this.isUntimed) return this

    const player = this.playerFor(color)
    const stage = this.stageAt(player.stageIndex)
    if (stage === undefined || player.remainingMs === null) return this

    // A player who has already flagged gains nothing from finishing a move.
    if (player.remainingMs === 0) return this

    let remainingMs = player.remainingMs + stage.incrementMs
    let stageIndex = player.stageIndex
    let movesInStage = player.movesInStage + 1

    if (stage.movesToComplete !== null && movesInStage >= stage.movesToComplete) {
      const nextStage = this.stageAt(stageIndex + 1)
      if (nextStage !== undefined) {
        stageIndex += 1
        movesInStage = 0
        remainingMs += nextStage.addedMs
      }
    }

    return this.withPlayer(color, { remainingMs, stageIndex, movesInStage })
  }

  snapshot(): ClockSnapshot {
    return {
      whiteMs: this.white.remainingMs,
      blackMs: this.black.remainingMs,
      running: this.running,
      flagged: this.flagged,
    }
  }

  private stageAt(index: number): TimeStage | undefined {
    return this.control.kind === 'unlimited' ? undefined : this.control.stages[index]
  }

  private playerFor(color: PieceColor): PlayerClock {
    return color === 'white' ? this.white : this.black
  }

  private withPlayer(color: PieceColor, player: PlayerClock): Clock {
    return color === 'white'
      ? new Clock(this.control, player, this.black, this.running)
      : new Clock(this.control, this.white, player, this.running)
  }
}
