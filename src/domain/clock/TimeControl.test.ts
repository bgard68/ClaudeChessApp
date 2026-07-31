import { describe, expect, it } from 'vitest'
import {
  MS_PER_MINUTE,
  TIME_CONTROL_PRESETS,
  UNLIMITED,
  classical,
  describeTimeControl,
  suddenDeath,
  totalBudgetMs,
} from './TimeControl'

describe('suddenDeath', () => {
  it('grants the whole budget in one stage that never ends', () => {
    const control = suddenDeath(10)
    expect(control).toMatchObject({ kind: 'staged' })
    if (control.kind !== 'staged') throw new Error('unreachable')

    expect(control.stages).toHaveLength(1)
    expect(control.stages[0]).toEqual({
      movesToComplete: null,
      addedMs: 10 * MS_PER_MINUTE,
      incrementMs: 0,
    })
  })

  it('takes an increment in seconds', () => {
    const control = suddenDeath(3, 2)
    if (control.kind !== 'staged') throw new Error('unreachable')
    expect(control.stages[0]?.incrementMs).toBe(2_000)
  })
})

describe('classical', () => {
  // A move quota first, then a smaller budget for however long the game runs.
  it('grants a quota stage and then an open one', () => {
    const control = classical(40, 120, 60)
    if (control.kind !== 'staged') throw new Error('unreachable')

    expect(control.stages).toHaveLength(2)
    expect(control.stages[0]?.movesToComplete).toBe(40)
    expect(control.stages[0]?.addedMs).toBe(120 * MS_PER_MINUTE)
    // The second stage has no quota: it runs to the end of the game.
    expect(control.stages[1]?.movesToComplete).toBeNull()
    expect(control.stages[1]?.addedMs).toBe(60 * MS_PER_MINUTE)
  })

  it('applies one increment to both stages', () => {
    const control = classical(40, 90, 30, 30)
    if (control.kind !== 'staged') throw new Error('unreachable')
    expect(control.stages.map((stage) => stage.incrementMs)).toEqual([30_000, 30_000])
  })
})

describe('totalBudgetMs', () => {
  it('adds every stage together', () => {
    expect(totalBudgetMs(suddenDeath(10))).toBe(600_000)
    expect(totalBudgetMs(classical(40, 120, 60))).toBe(180 * MS_PER_MINUTE)
  })

  /*
   * Null rather than zero or Infinity: an untimed game has no budget to size
   * a simulated replay clock against, and zero would read as flag fall.
   */
  it('has no total for an untimed game', () => {
    expect(totalBudgetMs(UNLIMITED)).toBeNull()
  })

  // The increment is not counted: it is earned per move, so the total is what
  // a player starts with, not what they might accumulate.
  it('counts only the time granted up front', () => {
    expect(totalBudgetMs(suddenDeath(5, 3))).toBe(300_000)
  })
})

/*
 * Derived rather than stored, so a control can never disagree with its label.
 * This string appears on the play screen, the replay panel, and every clock.
 */
describe('describeTimeControl', () => {
  it('names an untimed game', () => {
    expect(describeTimeControl(UNLIMITED)).toBe('No clock')
  })

  it('describes a plain control by its minutes', () => {
    expect(describeTimeControl(suddenDeath(10))).toBe('10 min')
  })

  // An increment of zero is not worth saying; anything else is.
  it('mentions an increment only when there is one', () => {
    expect(describeTimeControl(suddenDeath(3, 2))).toBe('3 min + 2s')
    expect(describeTimeControl(suddenDeath(3, 0))).toBe('3 min')
  })

  it('spells out a staged control in the order it is played', () => {
    expect(describeTimeControl(classical(40, 120, 60))).toBe(
      '40 moves / 120 min, then 60 min',
    )
  })

  it('carries the increment into every stage it describes', () => {
    expect(describeTimeControl(classical(40, 90, 30, 30))).toBe(
      '40 moves / 90 min + 30s, then 30 min + 30s',
    )
  })
})

describe('TIME_CONTROL_PRESETS', () => {
  // The label is what a player picks by, and a label that disagrees with the
  // control it selects is the one bug this table can have.
  it('labels every preset consistently with the control it holds', () => {
    for (const preset of TIME_CONTROL_PRESETS) {
      if (preset.control.kind === 'unlimited') {
        expect(preset.label).toBe('No clock')
        continue
      }
      const [stage] = preset.control.stages
      const minutes = (stage?.addedMs ?? 0) / MS_PER_MINUTE
      const increment = (stage?.incrementMs ?? 0) / 1_000
      // Labels read "10 min" with no increment and "3 | 2" with one.
      expect(preset.label).toBe(increment > 0 ? `${minutes} | ${increment}` : `${minutes} min`)
    }
  })

  it('gives every preset a distinct id', () => {
    const ids = TIME_CONTROL_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The setup screen defaults to this one, and looks it up by id.
  it('offers the rapid default the setup screen asks for', () => {
    expect(TIME_CONTROL_PRESETS.some((preset) => preset.id === '10+0')).toBe(true)
  })
})
