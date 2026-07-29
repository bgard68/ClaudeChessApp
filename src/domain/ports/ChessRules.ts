import type { GameOutcome } from '../chess/GameOutcome'
import type { LegalMove, MoveIntent } from '../chess/Move'
import type { Position } from '../chess/Position'
import type { Square } from '../chess/Square'

export interface MoveResult {
  readonly move: LegalMove
  readonly position: Position
}

/**
 * Everything the application needs to know about the laws of chess.
 *
 * Declared here, in the innermost layer, and implemented outward: the rules
 * library depends on this interface rather than the other way round. Beyond
 * swappability, the port exists to convert a mutable stateful engine into
 * position-in / position-out calls that callers cannot corrupt.
 */
export interface ChessRules {
  initialPosition(): Position
  positionFromFen(fen: string): Position

  legalMoves(position: Position): readonly LegalMove[]
  legalMovesFrom(position: Position, from: Square): readonly LegalMove[]

  /** Returns `null` when the intent is not legal in this position. */
  play(position: Position, intent: MoveIntent): MoveResult | null

  isCheck(position: Position): boolean

  /**
   * History is supplied by the caller because threefold repetition cannot be
   * judged from a single position, and a position value deliberately carries no
   * memory of how it was reached.
   */
  outcome(position: Position, history: readonly Position[]): GameOutcome
}
