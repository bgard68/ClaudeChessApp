import { describe, expect, it } from 'vitest'
import { Clock } from './Clock'
import { classical, suddenDeath, UNLIMITED } from './TimeControl'

const MINUTE = 60_000

describe('Clock', () => {
  it('charges only the side on the move', () => {
    const clock = Clock.forControl(suddenDeath(5)).startTurn('white').advance(10_000)

    expect(clock.remainingMs('white')).toBe(5 * MINUTE - 10_000)
    expect(clock.remainingMs('black')).toBe(5 * MINUTE)
  })

  it('adds the increment when a move is completed', () => {
    const clock = Clock.forControl(suddenDeath(5, 3))
      .startTurn('white')
      .advance(10_000)
      .completeMove('white')

    expect(clock.remainingMs('white')).toBe(5 * MINUTE - 10_000 + 3_000)
  })

  it('flags a player whose time runs out, and never goes negative', () => {
    const clock = Clock.forControl(suddenDeath(1)).startTurn('white').advance(90_000)

    expect(clock.remainingMs('white')).toBe(0)
    expect(clock.flagged).toBe('white')
  })

  it('grants the next stage only once the move quota is met', () => {
    // 2 moves in 1 minute, then 2 more minutes for the rest.
    let clock = Clock.forControl(classical(2, 1, 2)).startTurn('white')

    clock = clock.advance(10_000).completeMove('white')
    expect(clock.remainingMs('white')).toBe(MINUTE - 10_000)

    clock = clock.advance(10_000).completeMove('white')
    expect(clock.remainingMs('white')).toBe(MINUTE - 20_000 + 2 * MINUTE)
  })

  it('does not revive a player who has already flagged', () => {
    const clock = Clock.forControl(suddenDeath(1, 5))
      .startTurn('white')
      .advance(90_000)
      .completeMove('white')

    expect(clock.remainingMs('white')).toBe(0)
    expect(clock.flagged).toBe('white')
  })

  it('leaves an untimed game with no readings to charge', () => {
    const clock = Clock.forControl(UNLIMITED).startTurn('white').advance(60_000)

    expect(clock.isUntimed).toBe(true)
    expect(clock.remainingMs('white')).toBeNull()
    expect(clock.flagged).toBeNull()
  })

  it('is immutable — advancing returns a new clock', () => {
    const original = Clock.forControl(suddenDeath(5)).startTurn('white')
    const advanced = original.advance(1_000)

    expect(original.remainingMs('white')).toBe(5 * MINUTE)
    expect(advanced).not.toBe(original)
  })
})
