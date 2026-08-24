import { describe, expect, it } from 'vitest'
import { promotionPieceFromSymbol } from './pieceMapping'

describe('promotionPieceFromSymbol', () => {
  it('translates the four promotion letters', () => {
    expect(promotionPieceFromSymbol('q')).toBe('queen')
    expect(promotionPieceFromSymbol('r')).toBe('rook')
    expect(promotionPieceFromSymbol('b')).toBe('bishop')
    expect(promotionPieceFromSymbol('n')).toBe('knight')
  })

  it('reports no promotion when chess.js sent none', () => {
    expect(promotionPieceFromSymbol(undefined)).toBeUndefined()
  })

  it('refuses the two letters that are not promotion pieces', () => {
    // A move can never promote to a pawn or a king; a symbol claiming so is
    // answered with "no promotion" rather than an impossible piece.
    expect(promotionPieceFromSymbol('p')).toBeUndefined()
    expect(promotionPieceFromSymbol('k')).toBeUndefined()
  })
})
