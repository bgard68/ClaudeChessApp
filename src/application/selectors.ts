import type { LegalMove } from '@domain/chess/Move'
import type { PromotionPiece } from '@domain/chess/Piece'
import type { Square } from '@domain/chess/Square'

/**
 * Pure reads over a legal-move list, shared by the board, the move list, and
 * the promotion dialog so none of them re-derives the rules for itself.
 */

export function movesFrom(
  legalMoves: readonly LegalMove[],
  from: Square,
): readonly LegalMove[] {
  return legalMoves.filter((move) => move.from === from)
}

export function destinationsFrom(
  legalMoves: readonly LegalMove[],
  from: Square,
): readonly Square[] {
  return [...new Set(movesFrom(legalMoves, from).map((move) => move.to))]
}

/**
 * The promotion pieces available for a move, or an empty list when the move is
 * not a promotion. The board uses this to decide whether to ask before playing.
 */
export function promotionChoices(
  legalMoves: readonly LegalMove[],
  from: Square,
  to: Square,
): readonly PromotionPiece[] {
  return legalMoves
    .filter((move) => move.from === from && move.to === to && move.isPromotion)
    .map((move) => move.promotion)
    .filter((piece): piece is PromotionPiece => piece !== undefined)
}

export interface MovePair {
  readonly moveNumber: number
  readonly white: string | null
  readonly black: string | null
}

/** Groups half-moves into the numbered rows a move list displays. */
export function toMovePairs(sanMoves: readonly string[]): readonly MovePair[] {
  const pairs: MovePair[] = []
  for (let index = 0; index < sanMoves.length; index += 2) {
    pairs.push({
      moveNumber: index / 2 + 1,
      white: sanMoves[index] ?? null,
      black: sanMoves[index + 1] ?? null,
    })
  }
  return pairs
}
