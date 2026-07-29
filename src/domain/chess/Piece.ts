export type PieceColor = 'white' | 'black'

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

/** The four pieces a pawn may become. Excluding pawn/king at the type level
 *  removes the need to validate promotion choices at runtime. */
export type PromotionPiece = Exclude<PieceType, 'pawn' | 'king'>

export const PROMOTION_PIECES: readonly PromotionPiece[] = [
  'queen',
  'rook',
  'bishop',
  'knight',
]

export function opposite(color: PieceColor): PieceColor {
  return color === 'white' ? 'black' : 'white'
}
