import { describe, expect, it } from 'vitest'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { mateStartingMove, matingMoves, solvesMateWithin, toughestDefence } from './mate'

const rules = new ChessJsRules()

/** The ladder: 1.Rb7 boxes the king in, 2.Ra8# ends it. Forced throughout. */
const LADDER = '7k/8/R7/1R6/8/8/8/1K6 w - - 0 1'

describe('forced-mate reasoning', () => {
  it('finds no immediate mate in the ladder start', () => {
    expect(matingMoves(rules, rules.positionFromFen(LADDER))).toHaveLength(0)
  })

  it('accepts the move that forces mate in two', () => {
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b7' }, 2)).toBe(true)
  })

  it('rejects a move that lets the king slip', () => {
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b6' }, 2)).toBe(false)
  })

  it('rejects the forcing move when only one move is allowed', () => {
    // Rb7 wins, but not this instant — a mate-in-1 claim would be false.
    const position = rules.positionFromFen(LADDER)
    expect(solvesMateWithin(rules, position, { from: 'b5', to: 'b7' }, 1)).toBe(false)
  })

  // Qg6 leaves the black king with no legal move and no check: a draw, not a
  // win. The empty reply list is the trap — `replies.every(...)` over nothing
  // is vacuously true, so dropping the emptiness guard would score a stalemate
  // as a solved mate and hand the player a drawn puzzle marked correct.
  const STALEMATE_TRAP = '7k/8/8/8/8/8/6Q1/K7 w - - 0 1'

  it('refuses a stalemating move as a mate solution', () => {
    const position = rules.positionFromFen(STALEMATE_TRAP)
    expect(solvesMateWithin(rules, position, { from: 'g2', to: 'g6' }, 2)).toBe(false)
    expect(solvesMateWithin(rules, position, { from: 'g2', to: 'g6' }, 1)).toBe(false)
  })

  it('does not count a stalemating move as an immediate mate', () => {
    const position = rules.positionFromFen(STALEMATE_TRAP)
    expect(
      matingMoves(rules, position).some((move) => move.from === 'g2' && move.to === 'g6'),
    ).toBe(false)
  })

  it('walks the full ladder: force, defend, mate', () => {
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
