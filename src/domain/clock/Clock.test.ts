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

  it('flags whichever side runs out', () => {
    const white = Clock.forControl(suddenDeath(1)).startTurn('white').advance(61_000)
    expect(white.flagged).toBe('white')

    const black = Clock.forControl(suddenDeath(1)).startTurn('black').advance(61_000)
    expect(black.flagged).toBe('black')
  })

  it('stops charging a side that has already flagged', () => {
    const flagged = Clock.forControl(suddenDeath(1)).startTurn('white').advance(61_000)

    // There is nothing left to take; the same value must come back, so a
    // late tick cannot manufacture a second state change after the flag.
    expect(flagged.advance(1_000)).toBe(flagged)
  })

  it('grants no completion bonus to a side that has flagged', () => {
    const flagged = Clock.forControl(suddenDeath(1, 3)).startTurn('white').advance(61_000)

    expect(flagged.completeMove('white')).toBe(flagged)
  })

  it('starts at zero under a staged control that declares no stages', () => {
    // Constructible through the type, even though no preset produces it: the
    // clock has to answer something rather than crash.
    const empty = Clock.forControl({ kind: 'staged', stages: [] })

    expect(empty.snapshot().whiteMs).toBe(0)
    expect(empty.completeMove('white')).toBe(empty)
  })

  it('stays in the final stage once the quota of a last staged control is met', () => {
    const oneStage = Clock.forControl({
      kind: 'staged',
      stages: [{ movesToComplete: 1, addedMs: 60_000, incrementMs: 1_000 }],
    })

    const after = oneStage.startTurn('white').completeMove('white')

    // The quota is met but no next stage exists; only the increment lands.
    expect(after.remainingMs('white')).toBe(61_000)
    const again = after.completeMove('white')
    expect(again.remainingMs('white')).toBe(62_000)
  })

  it('answers no stage for an unlimited control, should it ever be asked', () => {
    // Every public path returns before consulting stages on an untimed clock,
    // so the narrowing inside stageAt is exercised here directly rather than
    // left as the one line no test can reach.
    const untimed = Clock.forControl(UNLIMITED) as unknown as {
      stageAt(index: number): unknown
    }

    expect(untimed.stageAt(0)).toBeUndefined()
  })
})
