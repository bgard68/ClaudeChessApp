import { describe, expect, it } from 'vitest'
import type { Position } from '@domain/chess/Position'
import type { ChessRules } from '@domain/ports/ChessRules'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { mateStartingMove, matingMoves, solvesMateWithin, toughestDefence } from './mate'

const rules = new ChessJsRules()

/** The ladder: 1.Rb7 boxes the king in, 2.Ra8# ends it. Forced throughout. */
const LADDER = '7k/8/R7/1R6/8/8/8/1K6 w - - 0 1'

describe('forced-mate reasoning', () => {
  it('matingMoves_LadderStart_FindsNoImmediateMate', () => {
    expect(matingMoves(rules, rules.positionFromFen(LADDER))).toHaveLength(0)
  })

  it('solvesMateWithin_ForcingMoveWithTwoAllowed_Accepts', () => {
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b7' }, 2)).toBe(true)
  })

  it('solvesMateWithin_MoveLettingTheKingSlip_Rejects', () => {
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b6' }, 2)).toBe(false)
  })

  it('solvesMateWithin_ForcingMoveWithOnlyOneAllowed_Rejects', () => {
    // Rb7 wins, but not this instant — a mate-in-1 claim would be false.
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b7' }, 1)).toBe(false)
  })

  // Qg6 leaves the black king with no legal move and no check: a draw, not a
  // win. The empty reply list is the trap — `replies.every(...)` over nothing
  // is vacuously true, so dropping the emptiness guard would score a stalemate
  // as a solved mate and hand the player a drawn puzzle marked correct.
  const STALEMATE_TRAP = '7k/8/8/8/8/8/6Q1/K7 w - - 0 1'

  it('solvesMateWithin_StalematingMove_RefusesItAsASolution', () => {
    const position = rules.positionFromFen(STALEMATE_TRAP)
    expect(solvesMateWithin(rules, position, { from: 'g2', to: 'g6' }, 2)).toBe(false)
    expect(solvesMateWithin(rules, position, { from: 'g2', to: 'g6' }, 1)).toBe(false)
  })

  it('matingMoves_StalematingMove_IsNotCountedAsImmediateMate', () => {
    const position = rules.positionFromFen(STALEMATE_TRAP)
    expect(
      matingMoves(rules, position).some((move) => move.from === 'g2' && move.to === 'g6'),
    ).toBe(false)
  })

  it('mateStartingMove_FullLadder_ForcesDefendsAndMates', () => {
    const start = rules.positionFromFen(LADDER)

    const first = mateStartingMove(rules, start, 2)
    expect(first).not.toBeNull()
    const afterFirst = rules.play(start, first!)!.position

    const defence = toughestDefence(rules, afterFirst)
    expect(defence).not.toBeNull()
    const afterDefence = rules.play(afterFirst, defence!)!.position

    const finisher = mateStartingMove(rules, afterDefence, 1)
    expect(finisher).not.toBeNull()
    const end = rules.play(afterDefence, finisher!)!.position
    expect(rules.outcome(end, [end])).toMatchObject({ reason: 'checkmate' })
  })
})

/*
 * Added by the mutation audit. Two gaps: an illegal answer was never offered,
 * and nothing separated "the game ended" from "the game ended in mate" — with
 * the real rules engine a decisive board is always mate, so the distinction
 * needs a stub that answers decisive-for-another-reason.
 */
describe('solvesMateWithin rejections', () => {
  it('solvesMateWithin_IllegalIntent_ReturnsFalseRatherThanCrediting', () => {
    const position = rules.positionFromFen(LADDER)

    // a6 to a8 skips a rank the rook cannot skip: not a legal move here.
    const solved = solvesMateWithin(rules, position, { from: 'b1', to: 'b8' }, 1)

    expect(solved).toBe(false)
  })

  it('solvesMateWithin_DecisiveButNotCheckmate_DoesNotCountItAsMate', () => {
    const position = { fen: 'start' } as Position
    const next = { fen: 'after' } as Position
    /** Ends decisively — but by resignation, which is not a mate. */
    const endedRules = {
      play: () => ({ position: next, move: {} }),
      legalMoves: () => [],
      outcome: () => ({ status: 'decisive', winner: 'white', reason: 'resignation' }),
    } as unknown as ChessRules

    const solved = solvesMateWithin(endedRules, position, { from: 'e2', to: 'e4' }, 1)

    expect(solved).toBe(false)
  })
})
