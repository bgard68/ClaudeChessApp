import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ClockSnapshot } from '@domain/clock/Clock'

export type OpponentKind = 'human' | 'engine'

export interface MoveRequest {
  readonly position: Position
  readonly legalMoves: readonly LegalMove[]
  readonly clock: ClockSnapshot
}

/**
 * Whoever is to move.
 *
 * This is the abstraction the whole design turns on. Because a person at the
 * keyboard and a search engine satisfy the same contract, `LiveGame` runs one
 * turn loop instead of a branch per game mode — and a networked opponent can be
 * added later as a third implementation without touching the loop.
 */
export interface Opponent {
  readonly kind: OpponentKind
  readonly name: string
  /** Resolves with the chosen move; rejects if the request is abandoned. */
  requestMove(request: MoveRequest): Promise<MoveIntent>
  /** Abandons any request in flight. */
  cancel(): void
  dispose(): void
}

/**
 * An opponent whose moves arrive from outside the turn loop — today, a person
 * using the board.
 *
 * Declared as an interface rather than having `LiveGame` reach for
 * `instanceof HumanOpponent`, so the loop keeps depending on contracts instead
 * of concrete classes.
 */
export interface InteractiveOpponent extends Opponent {
  readonly isAwaitingMove: boolean
  /** Returns `false` if the move is illegal or none is being awaited. */
  offerMove(intent: MoveIntent): boolean
}

export function isInteractive(opponent: Opponent): opponent is InteractiveOpponent {
  return typeof (opponent as InteractiveOpponent).offerMove === 'function'
}

export class MoveRequestAbandoned extends Error {
  constructor() {
    super('Move request abandoned')
    this.name = 'MoveRequestAbandoned'
  }
}
