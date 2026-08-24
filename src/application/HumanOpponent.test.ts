import { describe, expect, it } from 'vitest'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { MoveRequestAbandoned } from './Opponent'
import { HumanOpponent } from './HumanOpponent'

const rules = new ChessJsRules()

/** A lone pawn one step from promotion, so every legal move is a promotion. */
const PROMOTION_FEN = 'k7/7P/8/8/8/8/8/K7 w - - 0 1'

function requestAt(player: HumanOpponent, fen: string) {
  const position = rules.positionFromFen(fen)
  const promise = player.requestMove({
    position,
    legalMoves: rules.legalMoves(position),
    clock: { whiteMs: null, blackMs: null, running: null, flagged: null },
  })
  // A rejection is an expected outcome for an abandoned request, not a leak.
  promise.catch(() => {})
  return promise
}

describe('HumanOpponent', () => {
  it('refuses a move when none is being awaited', () => {
    expect(new HumanOpponent().offerMove({ from: 'e2', to: 'e4' })).toBe(false)
  })

  it('reports whether it is on the move', async () => {
    const player = new HumanOpponent()
    expect(player.isAwaitingMove).toBe(false)

    const request = requestAt(player, PROMOTION_FEN)
    expect(player.isAwaitingMove).toBe(true)

    player.offerMove({ from: 'h7', to: 'h8', promotion: 'queen' })
    expect(player.isAwaitingMove).toBe(false)
    await expect(request).resolves.toMatchObject({ promotion: 'queen' })
  })

  it('holds a promotion until the piece is named', async () => {
    const player = new HumanOpponent()
    const request = requestAt(player, PROMOTION_FEN)

    // Four legal candidates share this from/to; without the piece the move is
    // still ambiguous and the board must keep asking.
    expect(player.offerMove({ from: 'h7', to: 'h8' })).toBe(false)
    expect(player.isAwaitingMove).toBe(true)

    expect(player.offerMove({ from: 'h7', to: 'h8', promotion: 'knight' })).toBe(true)
    await expect(request).resolves.toEqual({ from: 'h7', to: 'h8', promotion: 'knight' })
  })

  it('abandons the pending request when cancelled', async () => {
    const player = new HumanOpponent()
    const request = requestAt(player, PROMOTION_FEN)

    player.cancel()

    await expect(request).rejects.toBeInstanceOf(MoveRequestAbandoned)
    expect(player.isAwaitingMove).toBe(false)
  })

  it('uses the default seat name when none is given', () => {
    expect(new HumanOpponent().name).toBe('Player')
  })
})
