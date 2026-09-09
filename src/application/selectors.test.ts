import { describe, expect, it } from 'vitest'
import type { LegalMove } from '@domain/chess/Move'
import { toSquare } from '@domain/chess/Square'
import {
  destinationsFrom,
  movesFrom,
  promotionChoices,
  toMovePairs,
} from './selectors'

const move = (from: string, to: string, over: Partial<LegalMove> = {}): LegalMove =>
  ({
    from: toSquare(from),
    to: toSquare(to),
    isPromotion: false,
    ...over,
  }) as LegalMove

/** The four pieces a pawn on e7 can become on e8, as the rules list them. */
const PROMOTIONS: readonly LegalMove[] = (['queen', 'rook', 'bishop', 'knight'] as const).map(
  (promotion) => move('e7', 'e8', { isPromotion: true, promotion }),
)

const OPENING: readonly LegalMove[] = [
  move('e2', 'e3'),
  move('e2', 'e4'),
  move('g1', 'f3'),
  move('g1', 'h3'),
]

describe('movesFrom', () => {
  it('movesFromSquare_SquareWithMoves_KeepsOnlyMovesLeavingIt', () => {
    expect(movesFrom(OPENING, toSquare('e2'))).toHaveLength(2)
    expect(movesFrom(OPENING, toSquare('g1'))).toHaveLength(2)
  })

  // A square with no piece, or a piece with nowhere to go, are the same
  // answer to the board: nothing to highlight.
  it('movesFromSquare_SquareWithNoMoves_FindsNothing', () => {
    expect(movesFrom(OPENING, toSquare('a1'))).toEqual([])
    expect(movesFrom([], toSquare('e2'))).toEqual([])
  })
})

describe('destinationsFrom', () => {
  it('destinationSquares_PieceWithMoves_ListsWhereItCanGo', () => {
    expect(destinationsFrom(OPENING, toSquare('e2'))).toEqual(['e3', 'e4'])
  })

  /*
   * A promotion is four legal moves to the same square. The board draws a dot
   * per destination, so without collapsing them it would stack four dots on
   * e8 — and any transparency in the marker would show it.
   */
  it('destinationSquares_SeveralMovesToOneSquare_NamesTheSquareOnce', () => {
    expect(destinationsFrom(PROMOTIONS, toSquare('e7'))).toEqual(['e8'])
  })
})

describe('promotionChoices', () => {
  it('promotionChoices_PromotingMove_OffersWhatTheRulesAllow', () => {
    expect(promotionChoices(PROMOTIONS, toSquare('e7'), toSquare('e8'))).toEqual([
      'queen',
      'rook',
      'bishop',
      'knight',
    ])
  })

  /*
   * An empty list is how the board knows not to ask. Returning the pieces for
   * an ordinary move would open the dialog on every pawn push.
   */
  it('promotionChoices_NonPromotionMove_OffersNothing', () => {
    expect(promotionChoices(OPENING, toSquare('e2'), toSquare('e4'))).toEqual([])
  })

  it('promotionChoices_IllegalMove_OffersNothing', () => {
    expect(promotionChoices(PROMOTIONS, toSquare('e7'), toSquare('d8'))).toEqual([])
  })

  // Two pawns can promote on the same rank; only the one being moved counts.
  it('promotionChoices_DifferentSquare_DoesNotMixUpPromotions', () => {
    const both = [...PROMOTIONS, move('d7', 'd8', { isPromotion: true, promotion: 'queen' })]
    expect(promotionChoices(both, toSquare('d7'), toSquare('d8'))).toEqual(['queen'])
  })
})

describe('toMovePairs', () => {
  it('moveRows_PairedHalfMoves_NumbersEachPairOnce', () => {
    expect(toMovePairs(['e4', 'e5', 'Nf3', 'Nc6'])).toEqual([
      { moveNumber: 1, white: 'e4', black: 'e5' },
      { moveNumber: 2, white: 'Nf3', black: 'Nc6' },
    ])
  })

  // A game ending on White's move still needs the row, or the last move has
  // nowhere to be shown.
  it('moveRows_WhiteMoveWithoutReply_LeavesBlackNull', () => {
    expect(toMovePairs(['e4'])).toEqual([{ moveNumber: 1, white: 'e4', black: null }])
  })

  it('moveRows_BeforeTheFirstMove_HasNoRows', () => {
    expect(toMovePairs([])).toEqual([])
  })

  it('moveRows_LongGame_KeepsNumberingThroughout', () => {
    const forty = Array.from({ length: 80 }, (_, index) => `m${index}`)
    const pairs = toMovePairs(forty)
    expect(pairs).toHaveLength(40)
    expect(pairs.at(-1)?.moveNumber).toBe(40)
  })
})
