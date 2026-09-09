import { describe, expect, it } from 'vitest'
import { PROMOTION_PIECES } from '@domain/chess/Piece'
import {
  PIECE_TYPE_BY_SYMBOL,
  SYMBOL_BY_PROMOTION_PIECE,
  promotionPieceFromSymbol,
} from './pieceMapping'

/*
 * The single place chess.js's letters meet the domain's words. A wrong entry
 * here is not a crash — it is a knight quietly recorded as a bishop, in the
 * archive, permanently.
 */

describe('PIECE_TYPE_BY_SYMBOL', () => {
  it('PIECE_TYPE_BY_SYMBOL_EverySymbol_MapsToItsOwnPiece', () => {
    expect(PIECE_TYPE_BY_SYMBOL).toEqual({
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    })
  })

  // 'n' for knight and 'b' for bishop are the pair most easily transposed.
  it('PIECE_TYPE_BY_SYMBOL_KnightAndBishop_AreNotTransposed', () => {
    expect(PIECE_TYPE_BY_SYMBOL.n).toBe('knight')
    expect(PIECE_TYPE_BY_SYMBOL.b).toBe('bishop')
  })
})

describe('SYMBOL_BY_PROMOTION_PIECE', () => {
  it('SYMBOL_BY_PROMOTION_PIECE_EveryPromotionPiece_MapsToItsLetter', () => {
    expect(SYMBOL_BY_PROMOTION_PIECE).toEqual({
      queen: 'q',
      rook: 'r',
      bishop: 'b',
      knight: 'n',
    })
  })

  it('SYMBOL_BY_PROMOTION_PIECE_TheDomainsPromotionList_IsCoveredExactly', () => {
    expect(Object.keys(SYMBOL_BY_PROMOTION_PIECE).sort()).toEqual([...PROMOTION_PIECES].sort())
  })

  it.each([
    ['queen', 'q'],
    ['rook', 'r'],
    ['bishop', 'b'],
    ['knight', 'n'],
  ] as const)(
    'SYMBOL_BY_PROMOTION_PIECE_%s_RoundTripsBackToItself',
    (piece, symbol) => {
      const readBack = promotionPieceFromSymbol(symbol)

      expect(readBack).toBe(piece)
    },
  )
})

/*
 * Promotion is the one place the mapping is not total: a pawn cannot become a
 * pawn or a king, and the type system rules both out, so the runtime answer for
 * either has to be "no promotion" rather than a piece the caller cannot use.
 */
describe('promotionPieceFromSymbol', () => {
  it('promotionPieceFromSymbol_QueenSymbol_ReturnsTheQueen', () => {
    const piece = promotionPieceFromSymbol('q')

    expect(piece).toBe('queen')
  })

  it('promotionPieceFromSymbol_PawnSymbol_ReturnsUndefinedBecauseAPawnCannotPromoteToOne', () => {
    const piece = promotionPieceFromSymbol('p')

    expect(piece).toBeUndefined()
  })

  it('promotionPieceFromSymbol_KingSymbol_ReturnsUndefined', () => {
    const piece = promotionPieceFromSymbol('k')

    expect(piece).toBeUndefined()
  })

  // The ordinary case: chess.js omits the field on every non-promoting move.
  it('promotionPieceFromSymbol_NoSymbol_ReturnsUndefined', () => {
    const piece = promotionPieceFromSymbol(undefined)

    expect(piece).toBeUndefined()
  })
})
