import { describe, expect, it } from 'vitest'
import { IN_PROGRESS, decisive, drawn, isOver, toResultTag } from './GameOutcome'

describe('isOver', () => {
  it('isOver_EachStatus_IsFalseOnlyWhileStillBeingPlayed', () => {
    expect(isOver(IN_PROGRESS)).toBe(false)
    expect(isOver(decisive('white', 'checkmate'))).toBe(true)
    expect(isOver(drawn('stalemate'))).toBe(true)
  })

  // A game abandoned without a recorded reason is still over. The reason is
  // missing information, not an unfinished game.
  it('isOver_WinWithNoRecordedReason_CountsAsOver', () => {
    expect(isOver(decisive('black', 'unknown'))).toBe(true)
  })
})

/*
 * The PGN result tag. This is what gets written into an exported file and
 * read back on import, so a wrong tag is a game that comes home changed.
 */
describe('toResultTag', () => {
  it('toResultTag_DecisiveOutcome_WritesTheWinnerNotWhoMovedLast', () => {
    expect(toResultTag(decisive('white', 'checkmate'))).toBe('1-0')
    expect(toResultTag(decisive('black', 'checkmate'))).toBe('0-1')
  })

  it.each([
    'stalemate',
    'insufficient_material',
    'threefold_repetition',
    'fifty_move_rule',
    'agreement',
  ] as const)('toResultTag_DrawBy%s_WritesTheSameTagAsAnyOtherDraw', (reason) => {
    expect(toResultTag(drawn(reason))).toBe('1/2-1/2')
  })

  // "*" is PGN's own marker for a game without a result, which is exactly
  // what an unfinished game is. Writing "1/2-1/2" instead would record a
  // draw that was never agreed.
  it('toResultTag_UnfinishedGame_MarksItAsHavingNoResult', () => {
    expect(toResultTag(IN_PROGRESS)).toBe('*')
  })

  // The reason never reaches the tag: PGN has nowhere to put it.
  it('toResultTag_EveryDecisiveReason_WritesTheSameTag', () => {
    const tags = (['checkmate', 'timeout', 'resignation', 'unknown'] as const).map((reason) =>
      toResultTag(decisive('white', reason)),
    )
    expect(new Set(tags)).toEqual(new Set(['1-0']))
  })
})

describe('the constructors', () => {
  it('constructors_DecisiveAndDrawn_BuildOutcomesCarryingTheirReason', () => {
    expect(decisive('white', 'resignation')).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'resignation',
    })
    expect(drawn('agreement')).toEqual({ status: 'draw', reason: 'agreement' })
  })

  it('constructors_DrawAndInProgress_OmitWinnerAndReasonRespectively', () => {
    expect(drawn('stalemate')).not.toHaveProperty('winner')
    expect(IN_PROGRESS).not.toHaveProperty('reason')
  })
})
