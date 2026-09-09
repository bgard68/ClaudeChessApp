import { describe, expect, it } from 'vitest'
import { Clock } from './Clock'
import { classical, suddenDeath, UNLIMITED } from './TimeControl'

const MINUTE = 60_000

describe('Clock', () => {
  it('advance_WhiteOnTheMove_ChargesOnlyWhite', () => {
    const clock = Clock.forControl(suddenDeath(5)).startTurn('white').advance(10_000)

    expect(clock.remainingMs('white')).toBe(5 * MINUTE - 10_000)
    expect(clock.remainingMs('black')).toBe(5 * MINUTE)
  })

  it('completeMove_WithIncrement_AddsTheIncrement', () => {
    const clock = Clock.forControl(suddenDeath(5, 3))
      .startTurn('white')
      .advance(10_000)
      .completeMove('white')

    expect(clock.remainingMs('white')).toBe(5 * MINUTE - 10_000 + 3_000)
  })

  it('advance_TimeRunsOut_FlagsThePlayerAndNeverGoesNegative', () => {
    const clock = Clock.forControl(suddenDeath(1)).startTurn('white').advance(90_000)

    expect(clock.remainingMs('white')).toBe(0)
    expect(clock.flagged).toBe('white')
  })

  it('completeMove_MoveQuotaMet_GrantsTheNextStageOnlyThen', () => {
    // 2 moves in 1 minute, then 2 more minutes for the rest.
    let clock = Clock.forControl(classical(2, 1, 2)).startTurn('white')

    clock = clock.advance(10_000).completeMove('white')
    expect(clock.remainingMs('white')).toBe(MINUTE - 10_000)

    clock = clock.advance(10_000).completeMove('white')
    expect(clock.remainingMs('white')).toBe(MINUTE - 20_000 + 2 * MINUTE)
  })

  it('advance_AlreadyFlagged_DoesNotReviveThePlayer', () => {
    const clock = Clock.forControl(suddenDeath(1, 5))
      .startTurn('white')
      .advance(90_000)
      .completeMove('white')

    expect(clock.remainingMs('white')).toBe(0)
    expect(clock.flagged).toBe('white')
  })

  it('forControl_UntimedGame_LeavesNoReadingsToCharge', () => {
    const clock = Clock.forControl(UNLIMITED).startTurn('white').advance(60_000)

    expect(clock.isUntimed).toBe(true)
    expect(clock.remainingMs('white')).toBeNull()
    expect(clock.flagged).toBeNull()
  })

  it('advance_AnyTick_ReturnsANewClockLeavingTheOldOne', () => {
    const original = Clock.forControl(suddenDeath(5)).startTurn('white')
    const advanced = original.advance(1_000)

    expect(original.remainingMs('white')).toBe(5 * MINUTE)
    expect(advanced).not.toBe(original)
  })
})

/*
 * Added by the mutation audit: the zero-tick guard had no witness, so relaxing
 * `<= 0` to `< 0` passed. The guard is identity — a tick that moved no time
 * returns the same clock, so nothing downstream re-renders for nothing.
 */
describe('Clock zero and negative ticks', () => {
  it('advance_ZeroElapsed_ReturnsTheSameClockInstance', () => {
    const clock = Clock.forControl(suddenDeath(5)).startTurn('white')

    const after = clock.advance(0)

    expect(after).toBe(clock)
  })

  it('advance_NegativeElapsed_ReturnsTheSameClockInstance', () => {
    const clock = Clock.forControl(suddenDeath(5)).startTurn('white')

    const after = clock.advance(-50)

    expect(after).toBe(clock)
  })
})
