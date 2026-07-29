import { decisive, drawn, IN_PROGRESS, isOver, type DrawReason, type GameOutcome } from '@domain/chess/GameOutcome'
import type { LegalMove, MoveIntent, PlayedMove } from '@domain/chess/Move'
import { opposite, type PieceColor } from '@domain/chess/Piece'
import type { Position } from '@domain/chess/Position'
import { Clock, type ClockSnapshot } from '@domain/clock/Clock'
import type { TimeControl } from '@domain/clock/TimeControl'
import type { ChessRules } from '@domain/ports/ChessRules'
import type { Ticker } from '@domain/ports/Ticker'
import { Observable, type Unsubscribe } from './Observable'
import { isInteractive, type Opponent, type OpponentKind } from './Opponent'

export interface LiveGameDependencies {
  readonly rules: ChessRules
  readonly ticker: Ticker
}

export interface LiveGameSetup {
  readonly white: Opponent
  readonly black: Opponent
  readonly timeControl: TimeControl
}

export interface AwaitingTurn {
  readonly color: PieceColor
  readonly kind: OpponentKind
  readonly name: string
}

export interface LiveGameState {
  readonly position: Position
  readonly legalMoves: readonly LegalMove[]
  readonly history: readonly PlayedMove[]
  readonly clock: ClockSnapshot
  readonly outcome: GameOutcome
  readonly isCheck: boolean
  /** Null once the game is over. */
  readonly awaiting: AwaitingTurn | null
  readonly timeControl: TimeControl
  /** Whether there is a move to take back. */
  readonly canUndo: boolean
}

/**
 * A game being played right now.
 *
 * Owns exactly one thing: advancing a game from its starting position to a
 * result — asking whoever is on the move for a move, charging their clock, and
 * recognising when the game has ended. It has no idea whether a player is a
 * person or a program, and no idea that React exists.
 */
export class LiveGame {
  private readonly rules: ChessRules
  private readonly ticker: Ticker
  private readonly changes = new Observable<LiveGameState>()

  private position: Position
  private positionHistory: Position[]
  private playedMoves: PlayedMove[] = []
  private legalMoves: readonly LegalMove[]
  private clock: Clock
  /**
   * The clock as it stood after each move, the starting clock at index 0.
   *
   * Taking a move back has to restore the time too, and `Clock` being immutable
   * means keeping the old value costs a reference — far cheaper, and exact,
   * compared with trying to reverse an increment and a possible stage change.
   */
  private clockHistory: Clock[]
  private outcome: GameOutcome = IN_PROGRESS
  private awaiting: AwaitingTurn | null = null
  private cachedState: LiveGameState | null = null

  /** Bumped whenever the game ends or is torn down, so a move that resolves
   *  late — an engine finishing its search after a flag fall — is discarded. */
  private generation = 0
  private started = false
  private disposed = false

  constructor(
    dependencies: LiveGameDependencies,
    private readonly setup: LiveGameSetup,
  ) {
    this.rules = dependencies.rules
    this.ticker = dependencies.ticker
    this.position = this.rules.initialPosition()
    this.positionHistory = [this.position]
    this.legalMoves = this.rules.legalMoves(this.position)
    this.clock = Clock.forControl(setup.timeControl)
    this.clockHistory = [this.clock]
  }

  get state(): LiveGameState {
    if (this.cachedState === null) this.cachedState = this.buildState()
    return this.cachedState
  }

  subscribe(listener: (state: LiveGameState) => void): Unsubscribe {
    return this.changes.subscribe(listener)
  }

  start(): void {
    if (this.started || this.disposed) return
    this.started = true

    if (!this.clock.isUntimed) {
      this.ticker.start((elapsedMs) => this.onTick(elapsedMs))
    }
    void this.runTurnLoop()
  }

  /**
   * Routes a move from the UI to whoever is on the move, if they are taking
   * input. Returns `false` for an illegal move, or when it is the engine's
   * turn — both are ordinary things for a board to refuse.
   */
  submitMove(intent: MoveIntent): boolean {
    if (isOver(this.outcome) || this.disposed) return false
    const opponent = this.opponentFor(this.position.sideToMove)
    return isInteractive(opponent) ? opponent.offerMove(intent) : false
  }

  resign(color: PieceColor): void {
    if (isOver(this.outcome)) return
    this.finish(decisive(opposite(color), 'resignation'))
  }

  agreeDraw(reason: DrawReason = 'agreement'): void {
    if (isOver(this.outcome)) return
    this.finish(drawn(reason))
  }

  /**
   * Takes back the last move — and the engine's reply with it, so the board
   * comes back to a person rather than to a machine mid-search.
   *
   * Allowed after the game has ended, because losing one is exactly when a
   * player reaches for this; the outcome is cleared and play resumes.
   */
  undo(): boolean {
    if (this.disposed || this.playedMoves.length === 0) return false

    // Abandons whatever was in flight. A search that resolves anyway is
    // discarded by the generation check in the turn loop.
    this.generation += 1
    this.setup.white.cancel()
    this.setup.black.cancel()

    // Two plies at the very most — the move and the reply it drew. Looping
    // until a person is on the move instead would unwind an entire game in
    // which neither side is interactive.
    this.takeBackOnePly()
    if (this.playedMoves.length > 0 && !this.isInteractiveTurn()) this.takeBackOnePly()

    this.outcome = IN_PROGRESS
    this.awaiting = null
    this.legalMoves = this.rules.legalMoves(this.position)

    // Restarted from scratch: the ticker was stopped if the game had ended,
    // and this also drops the part-spent turn rather than charging it twice.
    this.ticker.stop()
    if (!this.clock.isUntimed) this.ticker.start((elapsedMs) => this.onTick(elapsedMs))

    this.publish()
    void this.runTurnLoop()
    return true
  }

  private takeBackOnePly(): void {
    this.playedMoves.pop()
    this.positionHistory.pop()
    this.clockHistory.pop()
    this.position = this.positionHistory.at(-1)!
    this.clock = this.clockHistory.at(-1)!
  }

  private isInteractiveTurn(): boolean {
    return isInteractive(this.opponentFor(this.position.sideToMove))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.ticker.stop()
    this.setup.white.dispose()
    this.setup.black.dispose()
    this.changes.clear()
  }

  private async runTurnLoop(): Promise<void> {
    while (!isOver(this.outcome) && !this.disposed) {
      const generation = this.generation
      const color = this.position.sideToMove
      const opponent = this.opponentFor(color)

      this.awaiting = { color, kind: opponent.kind, name: opponent.name }
      this.clock = this.clock.startTurn(color)
      this.publish()

      let intent: MoveIntent
      try {
        intent = await opponent.requestMove({
          position: this.position,
          legalMoves: this.legalMoves,
          clock: this.clock.snapshot(),
        })
      } catch {
        return // Request abandoned: the game ended, restarted, or was disposed.
      }

      if (generation !== this.generation || this.disposed || isOver(this.outcome)) return

      if (!this.applyMove(intent)) {
        // Unreachable for a human, whose moves are validated before they resolve.
        // An engine proposing an illegal move has malfunctioned, and forfeits.
        this.finish(decisive(opposite(color), 'resignation'))
        return
      }
    }
  }

  private applyMove(intent: MoveIntent): boolean {
    const result = this.rules.play(this.position, intent)
    if (result === null) return false

    const positionBefore = this.position
    const mover = positionBefore.sideToMove

    this.position = result.position
    this.positionHistory.push(result.position)

    // Charged first, so the reading stored with the move is the one the player
    // actually had left after making it — increment included.
    this.clock = this.clock.completeMove(mover)
    this.clockHistory.push(this.clock)

    this.playedMoves.push({
      ...result.move,
      ply: this.playedMoves.length + 1,
      color: mover,
      positionBefore,
      positionAfter: result.position,
      clockAfterMs: this.clock.remainingMs(mover),
    })

    this.legalMoves = this.rules.legalMoves(this.position)

    const outcome = this.rules.outcome(this.position, this.positionHistory)
    if (isOver(outcome)) {
      this.finish(outcome)
    } else {
      this.publish()
    }
    return true
  }

  private onTick(elapsedMs: number): void {
    const advanced = this.clock.advance(elapsedMs)
    if (advanced === this.clock) return
    this.clock = advanced

    const flagged = this.clock.flagged
    if (flagged !== null) {
      // Note: FIDE 6.9 draws the game if the other side cannot possibly mate.
      // That refinement is not implemented; a flag fall always loses here.
      this.finish(decisive(opposite(flagged), 'timeout'))
      return
    }
    this.publish()
  }

  private finish(outcome: GameOutcome): void {
    this.outcome = outcome
    this.generation += 1
    this.awaiting = null
    this.clock = this.clock.pause()
    this.ticker.stop()
    this.setup.white.cancel()
    this.setup.black.cancel()
    this.publish()
  }

  private opponentFor(color: PieceColor): Opponent {
    return color === 'white' ? this.setup.white : this.setup.black
  }

  private publish(): void {
    this.cachedState = this.buildState()
    this.changes.emit(this.cachedState)
  }

  private buildState(): LiveGameState {
    return {
      position: this.position,
      legalMoves: this.legalMoves,
      history: this.playedMoves,
      clock: this.clock.snapshot(),
      outcome: this.outcome,
      isCheck: this.rules.isCheck(this.position),
      awaiting: this.awaiting,
      timeControl: this.setup.timeControl,
      canUndo: this.playedMoves.length > 0 && !this.disposed,
    }
  }
}
