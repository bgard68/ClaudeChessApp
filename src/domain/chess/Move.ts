import type { PieceColor, PieceType, PromotionPiece } from './Piece'
import type { Square } from './Square'
import type { Position } from './Position'

/** What a player asks to do. The smallest input the rules need to validate. */
export interface MoveIntent {
  readonly from: Square
  readonly to: Square
  readonly promotion?: PromotionPiece
}

/** A move the rules have confirmed is legal in some position. */
export interface LegalMove extends MoveIntent {
  readonly san: string
  readonly piece: PieceType
  readonly isCapture: boolean
  readonly isPromotion: boolean
}

/** A move that has actually been played, with the positions it bridges. */
export interface PlayedMove extends LegalMove {
  /** 1-based half-move number: White's first move is ply 1. */
  readonly ply: number
  readonly color: PieceColor
  readonly positionBefore: Position
  readonly positionAfter: Position
  /**
   * The mover's remaining time once the move was finished, or `null` in an
   * untimed game. Recorded so a saved game can carry genuine `[%clk]` times —
   * the thing historical games never had.
   */
  readonly clockAfterMs: number | null
}

export function sameIntent(a: MoveIntent, b: MoveIntent): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion
}

/** Ply 1 and 2 are both move 1; ply 3 and 4 are move 2. */
export function moveNumberForPly(ply: number): number {
  return Math.floor((ply - 1) / 2) + 1
}
