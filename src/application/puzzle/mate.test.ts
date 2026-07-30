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
