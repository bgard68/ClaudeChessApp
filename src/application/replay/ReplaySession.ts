import type { ArchivedGame, RecordedMove } from '@domain/archive/ArchivedGame'
import { Position } from '@domain/chess/Position'
import type { Ticker } from '@domain/ports/Ticker'
import { Observable, type Unsubscribe } from '../Observable'
import { ReplayClockModel, type ReplayClockReading } from './ReplayClockModel'

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

/** Wall time one move occupies at 1× speed. */
const BASE_MS_PER_MOVE = 1_200

export interface ReplayState {
  readonly game: ArchivedGame
  /** 0 is the starting position; `totalPlies` is the final position. */
  readonly ply: number
  readonly totalPlies: number
  readonly position: Position
  readonly lastMove: RecordedMove | null
  readonly clock: ReplayClockReading
  readonly clockSource: ReplayClockModel['source']
  readonly isPlaying: boolean
  readonly speed: ReplaySpeed
}

/**
 * Steps a recorded game back and forth on the board.
 *
 * Separate from `LiveGame` on purpose: an archived game's moves are already
 * fixed, so there is nothing to validate, no opponent to ask, and no result to
 * decide. Sharing one class between the two would mean a mode flag threaded
 * through every method.
 *
 * Needs no rules engine — each recorded move already carries the position it
 * produced.
 */
export class ReplaySession {
  private readonly changes = new Observable<ReplayState>()
  private readonly clockModel: ReplayClockModel
  private readonly startPosition: Position

  private ply = 0
  private speed: ReplaySpeed = 1
  private playing = false
  private elapsedSinceMove = 0
  private disposed = false
  private cachedState: ReplayState | null = null

  constructor(
    private readonly ticker: Ticker,
    private readonly game: ArchivedGame,
  ) {
    this.clockModel = ReplayClockModel.forGame(game)
    this.startPosition = game.moves[0]?.positionBefore ?? Position.initial()
  }

  get state(): ReplayState {
    if (this.cachedState === null) this.cachedState = this.buildState()
    return this.cachedState
  }

  get clockModelInfo(): ReplayClockModel {
    return this.clockModel
  }

  subscribe(listener: (state: ReplayState) => void): Unsubscribe {
    return this.changes.subscribe(listener)
  }

  goTo(ply: number): void {
    const clamped = Math.max(0, Math.min(ply, this.game.moves.length))
    if (clamped === this.ply) return
    this.ply = clamped
    this.elapsedSinceMove = 0
    this.publish()
  }

  next(): void {
    this.goTo(this.ply + 1)
  }

  previous(): void {
    this.goTo(this.ply - 1)
  }

  first(): void {
    this.goTo(0)
  }

  last(): void {
    this.goTo(this.game.moves.length)
  }

  play(): void {
    if (this.playing || this.disposed) return
    // Restart from the beginning rather than sitting on the final position.
    if (this.ply >= this.game.moves.length) this.ply = 0

    this.playing = true
    this.elapsedSinceMove = 0
    this.ticker.start((elapsedMs) => this.onTick(elapsedMs))
    this.publish()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.ticker.stop()
    this.publish()
  }

  togglePlay(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  setSpeed(speed: ReplaySpeed): void {
    if (speed === this.speed) return
    this.speed = speed
    this.publish()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.playing = false
    this.ticker.stop()
    this.changes.clear()
  }

  private onTick(elapsedMs: number): void {
    this.elapsedSinceMove += elapsedMs
    const msPerMove = BASE_MS_PER_MOVE / this.speed

    let advanced = false
    while (this.elapsedSinceMove >= msPerMove && this.ply < this.game.moves.length) {
      this.elapsedSinceMove -= msPerMove
      this.ply += 1
      advanced = true
    }

    if (this.ply >= this.game.moves.length) {
      this.pause()
      return
    }
    if (advanced) this.publish()
  }

  private publish(): void {
    this.cachedState = this.buildState()
    this.changes.emit(this.cachedState)
  }

  private buildState(): ReplayState {
    const lastMove = this.ply > 0 ? (this.game.moves[this.ply - 1] ?? null) : null
    return {
      game: this.game,
      ply: this.ply,
      totalPlies: this.game.moves.length,
      position: lastMove?.positionAfter ?? this.startPosition,
      lastMove,
      clock: this.clockModel.readingAt(this.ply),
      clockSource: this.clockModel.source,
      isPlaying: this.playing,
      speed: this.speed,
    }
  }
}
