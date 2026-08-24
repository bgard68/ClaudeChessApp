import { describe, expect, it } from 'vitest'
import { classical, suddenDeath, UNLIMITED } from '@domain/clock/TimeControl'
import { formatTimeControlTag, parseTimeControlTag } from './timeControlTag'

describe('parseTimeControlTag', () => {
  it('reads a plain budget', () => {
    expect(parseTimeControlTag('1800')).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 1_800_000, incrementMs: 0 }],
    })
  })

  it('reads a budget with an increment', () => {
    expect(parseTimeControlTag('300+3')).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 300_000, incrementMs: 3_000 }],
    })
  })

  it('reads the classical two-stage form', () => {
    expect(parseTimeControlTag('40/7200:1800')).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 0 },
      ],
    })
  })

  it('runs the final stage to the end of the game whatever the tag claims', () => {
    // "20/600:20/600" declares a quota on the last stage too; there is no
    // stage after it to move into, so the quota is dropped.
    const control = parseTimeControlTag('20/600:20/600')

    expect(control).toMatchObject({
      stages: [{ movesToComplete: 20 }, { movesToComplete: null }],
    })
  })

  it('reports an honest absence rather than a wrong clock', () => {
    expect(parseTimeControlTag(undefined)).toBeNull()
    expect(parseTimeControlTag('')).toBeNull()
    expect(parseTimeControlTag('   ')).toBeNull()
    expect(parseTimeControlTag('?')).toBeNull()
    expect(parseTimeControlTag('-')).toBeNull()
  })

  it('refuses anything malformed', () => {
    expect(parseTimeControlTag('abc')).toBeNull()
    expect(parseTimeControlTag('-60')).toBeNull()
    expect(parseTimeControlTag('600+abc')).toBeNull()
    expect(parseTimeControlTag('600+-5')).toBeNull()
    expect(parseTimeControlTag('0/600')).toBeNull()
    expect(parseTimeControlTag('-5/600')).toBeNull()
    expect(parseTimeControlTag('abc/600')).toBeNull()
    // One bad stage rejects the whole tag: half a control is not a control.
    expect(parseTimeControlTag('40/7200:nonsense')).toBeNull()
  })

  it('rounds a fractional budget to whole milliseconds', () => {
    expect(parseTimeControlTag('0.5+0.5')).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 500, incrementMs: 500 }],
    })
  })
})

describe('formatTimeControlTag', () => {
  it('writes the unspecified marker for an untimed game', () => {
    expect(formatTimeControlTag(UNLIMITED)).toBe('-')
  })

  it('writes a plain budget, and one with an increment', () => {
    expect(formatTimeControlTag(suddenDeath(30))).toBe('1800')
    expect(formatTimeControlTag(suddenDeath(5, 3))).toBe('300+3')
  })

  it('writes both stages of a classical control', () => {
    // Forty moves in two hours, then an hour for the rest.
    expect(formatTimeControlTag(classical(40, 120, 60))).toBe('40/7200:3600')
  })

  it('round-trips every shape it can write', () => {
    for (const control of [suddenDeath(3), suddenDeath(15, 10), classical(40, 120, 60, 30)]) {
      expect(parseTimeControlTag(formatTimeControlTag(control))).toEqual(control)
    }
  })
})
