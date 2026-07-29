import { describe, expect, it } from 'vitest'
import { Position } from '@domain/chess/Position'
import { ChessJsRules } from './ChessJsRules'

const rules = new ChessJsRules()

describe('ChessJsRules', () => {
  it('generates the twenty legal opening moves', () => {
    expect(rules.legalMoves(rules.initialPosition())).toHaveLength(20)
  })

  it('returns a new position and leaves the original untouched', () => {
    const before = rules.initialPosition()
    const result = rules.play(before, { from: 'e2', to: 'e4' })

    expect(result?.move.san).toBe('e4')
    expect(result?.position.sideToMove).toBe('black')
    expect(before.sideToMove).toBe('white')
    expect(before.fen).toBe(Position.initial().fen)
  })

  it('reports an illegal move as null rather than throwing', () => {
    expect(rules.play(rules.initialPosition(), { from: 'e2', to: 'e5' })).toBeNull()
  })

  it('recognises checkmate and names the winner', () => {
    const mated = rules.positionFromFen(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    )
    expect(rules.outcome(mated, [mated])).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
  })

  it('recognises stalemate', () => {
    const stalemate = rules.positionFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(rules.outcome(stalemate, [stalemate])).toEqual({
      status: 'draw',
      reason: 'stalemate',
    })
  })

  it('recognises insufficient material', () => {
    const bareKings = rules.positionFromFen('7k/8/6K1/8/8/8/8/8 w - - 0 1')
    expect(rules.outcome(bareKings, [bareKings])).toEqual({
      status: 'draw',
      reason: 'insufficient_material',
    })
  })

  it('draws by the fifty-move rule from the halfmove clock', () => {
    const stale = rules.positionFromFen('4k3/8/4q3/8/8/4Q3/8/4K3 w - - 100 80')
    expect(rules.outcome(stale, [stale])).toEqual({
      status: 'draw',
      reason: 'fifty_move_rule',
    })
  })

  it('draws by repetition once a position has appeared three times', () => {
    const position = rules.initialPosition()
    const history = [position, position, position]

    expect(rules.outcome(position, history)).toEqual({
      status: 'draw',
      reason: 'threefold_repetition',
    })
  })

  it('marks promotions and translates the promoted piece', () => {
    const promoting = rules.positionFromFen('8/P6k/8/8/8/8/8/7K w - - 0 1')
    const moves = rules.legalMovesFrom(promoting, 'a7')

    expect(moves.every((move) => move.isPromotion)).toBe(true)
    expect(new Set(moves.map((move) => move.promotion))).toEqual(
      new Set(['queen', 'rook', 'bishop', 'knight']),
    )
  })
})
