import { describe, expect, it } from 'vitest'
import { IN_PROGRESS, decisive, drawn, isOver, toResultTag } from './GameOutcome'

describe('isOver', () => {
  it('is false only while the game is still being played', () => {
    expect(isOver(IN_PROGRESS)).toBe(false)
    expect(isOver(decisive('white', 'checkmate'))).toBe(true)
    expect(isOver(drawn('stalemate'))).toBe(true)
  })

  // A game abandoned without a recorded reason is still over. The reason is
  // missing information, not an unfinished game.
  it('counts a win with no recorded reason as over', () => {
    expect(isOver(decisive('black', 'unknown'))).toBe(true)
  })
})

/*
 * The PGN result tag. This is what gets written into an exported file and
 * read back on import, so a wrong tag is a game that comes home changed.
 */
describe('toResultTag', () => {
  it('writes a win from the winner, not from who moved last', () => {
    expect(toResultTag(decisive('white', 'checkmate'))).toBe('1-0')
    expect(toResultTag(decisive('black', 'checkmate'))).toBe('0-1')
  })

  it('writes every draw the same way, whatever caused it', () => {
    for (const reason of [
      'stalemate',
      'insufficient_material',
      'threefold_repetition',
      'fifty_move_rule',
      'agreement',
    ] as const) {
      expect(toResultTag(drawn(reason))).toBe('1/2-1/2')
    }
  })

  // "*" is PGN's own marker for a game without a result, which is exactly
  // what an unfinished game is. Writing "1/2-1/2" instead would record a
  // draw that was never agreed.
  it('marks an unfinished game as having no result', () => {
    expect(toResultTag(IN_PROGRESS)).toBe('*')
  })

  // The reason never reaches the tag: PGN has nowhere to put it.
  it('writes the same tag however the win was reached', () => {
    const tags = (['checkmate', 'timeout', 'resignation', 'unknown'] as const).map((reason) =>
      toResultTag(decisive('white', reason)),
    )
    expect(new Set(tags)).toEqual(new Set(['1-0']))
  })
})

describe('the constructors', () => {
  it('build outcomes that carry their reason', () => {
    expect(decisive('white', 'resignation')).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'resignation',
    })
    expect(drawn('agreement')).toEqual({ status: 'draw', reason: 'agreement' })
  })

  it('has no winner on a draw and no reason before the end', () => {
    expect(drawn('stalemate')).not.toHaveProperty('winner')
    expect(IN_PROGRESS).not.toHaveProperty('reason')
  })
})
