import { describe, expect, it } from 'vitest'
import { Position } from '@domain/chess/Position'
import { ChessJsRules } from './ChessJsRules'

const rules = new ChessJsRules()

describe('ChessJsRules', () => {
  it('legalMoves_StartingPosition_GeneratesAllTwenty', () => {
    expect(rules.legalMoves(rules.initialPosition())).toHaveLength(20)
  })

  it('play_LegalMove_ReturnsANewPositionLeavingTheOriginal', () => {
    const before = rules.initialPosition()
    const result = rules.play(before, { from: 'e2', to: 'e4' })

    expect(result?.move.san).toBe('e4')
    expect(result?.position.sideToMove).toBe('black')
    expect(before.sideToMove).toBe('white')
    expect(before.fen).toBe(Position.initial().fen)
  })

  it('play_IllegalMove_ReturnsNullRatherThanThrowing', () => {
    expect(rules.play(rules.initialPosition(), { from: 'e2', to: 'e5' })).toBeNull()
  })

  it('outcome_Checkmate_IsRecognisedWithTheWinnerNamed', () => {
    const mated = rules.positionFromFen(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    )
    expect(rules.outcome(mated, [mated])).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
  })

  it('outcome_Stalemate_IsRecognised', () => {
    const stalemate = rules.positionFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(rules.outcome(stalemate, [stalemate])).toEqual({
      status: 'draw',
      reason: 'stalemate',
    })
  })

  it('outcome_InsufficientMaterial_IsRecognised', () => {
    const bareKings = rules.positionFromFen('7k/8/6K1/8/8/8/8/8 w - - 0 1')
    expect(rules.outcome(bareKings, [bareKings])).toEqual({
      status: 'draw',
      reason: 'insufficient_material',
    })
  })

  it('outcome_HalfmoveClockAtLimit_DrawsByTheFiftyMoveRule', () => {
    const stale = rules.positionFromFen('4k3/8/4q3/8/8/4Q3/8/4K3 w - - 100 80')
    expect(rules.outcome(stale, [stale])).toEqual({
      status: 'draw',
      reason: 'fifty_move_rule',
    })
  })

  it('outcome_PositionSeenThreeTimes_DrawsByRepetition', () => {
    const position = rules.initialPosition()
    const history = [position, position, position]

    expect(rules.outcome(position, history)).toEqual({
      status: 'draw',
      reason: 'threefold_repetition',
    })
  })

  it('legalMoves_PromotingPawn_MarksPromotionsAndTranslatesThePiece', () => {
    const promoting = rules.positionFromFen('8/P6k/8/8/8/8/8/7K w - - 0 1')
    const moves = rules.legalMovesFrom(promoting, 'a7')

    expect(moves.every((move) => move.isPromotion)).toBe(true)
    expect(new Set(moves.map((move) => move.promotion))).toEqual(
      new Set(['queen', 'rook', 'bishop', 'knight']),
    )
  })
})

/*
 * Added by the mutation audit: no test played a promotion through the rules,
 * so inverting the promotion-symbol mapping — which makes every promotion an
 * illegal move — passed the suite.
 */
describe('playing a promotion', () => {
  const PAWN_ON_SEVENTH = '8/1P6/8/k5K1/8/8/8/8 w - - 0 1'

  it('play_PromotionToQueen_ProducesTheQueeningMove', () => {
    const position = rules.positionFromFen(PAWN_ON_SEVENTH)

    const played = rules.play(position, { from: 'b7', to: 'b8', promotion: 'queen' })

    expect(played?.move.san).toBe('b8=Q')
    expect(played?.move.promotion).toBe('queen')
    expect(played?.position.fen).toContain('1Q6')
  })

  it('play_UnderpromotionToKnight_HonoursTheChoiceRatherThanQueening', () => {
    const position = rules.positionFromFen(PAWN_ON_SEVENTH)

    const played = rules.play(position, { from: 'b7', to: 'b8', promotion: 'knight' })

    expect(played?.move.san).toBe('b8=N')
    expect(played?.move.promotion).toBe('knight')
  })
})
