import type { PieceSymbol } from 'chess.js'
import type { PieceType, PromotionPiece } from '@domain/chess/Piece'

/**
 * The translation layer between chess.js's single letters and the domain's
 * words. Keeping it in one file means the rest of the codebase never has to
 * remember that 'n' means knight.
 */

export const PIECE_TYPE_BY_SYMBOL: Readonly<Record<PieceSymbol, PieceType>> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

export const SYMBOL_BY_PROMOTION_PIECE: Readonly<Record<PromotionPiece, PieceSymbol>> = {
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
}

export function promotionPieceFromSymbol(
  symbol: PieceSymbol | undefined,
): PromotionPiece | undefined {
  if (symbol === undefined) return undefined
  const piece = PIECE_TYPE_BY_SYMBOL[symbol]
  return piece === 'pawn' || piece === 'king' ? undefined : piece
}
