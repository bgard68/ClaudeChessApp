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

/*
 * Asserted whole rather than field by field. The narrowing `if (kind !==
 * 'staged') throw` these needed to reach `.stages` is gone with it, and so is
 * the gap it left: a control that grew a third stage, or an unexpected extra
 * field, satisfied every individual check while being the wrong control.
 */
describe('suddenDeath', () => {
  it('suddenDeath_MinutesOnly_GrantsOneStageThatNeverEnds', () => {
    const control = suddenDeath(10)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 10 * MS_PER_MINUTE, incrementMs: 0 }],
    })
  })

  it('suddenDeath_WithIncrement_TakesTheIncrementInSeconds', () => {
    const control = suddenDeath(3, 2)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 3 * MS_PER_MINUTE, incrementMs: 2_000 }],
    })
  })
})

describe('classical', () => {
  // A move quota first, then a smaller budget for however long the game runs.
  it('classical_QuotaAndRemainder_GrantsAQuotaStageThenAnOpenOne', () => {
    const control = classical(40, 120, 60)

    expect(control).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 120 * MS_PER_MINUTE, incrementMs: 0 },
        // The second stage has no quota: it runs to the end of the game.
        { movesToComplete: null, addedMs: 60 * MS_PER_MINUTE, incrementMs: 0 },
      ],
    })
  })

  it('classical_OneIncrement_AppliesItToBothStages', () => {
    const control = classical(40, 90, 30, 30)

    expect(control).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 90 * MS_PER_MINUTE, incrementMs: 30_000 },
        { movesToComplete: null, addedMs: 30 * MS_PER_MINUTE, incrementMs: 30_000 },
      ],
    })
  })
})

describe('totalBudgetMs', () => {
  it('totalBudgetMs_StagedControl_AddsEveryStageTogether', () => {
    expect(totalBudgetMs(suddenDeath(10))).toBe(600_000)
    expect(totalBudgetMs(classical(40, 120, 60))).toBe(180 * MS_PER_MINUTE)
  })

  /*
   * Null rather than zero or Infinity: an untimed game has no budget to size
   * a simulated replay clock against, and zero would read as flag fall.
   */
  it('totalBudgetMs_UntimedGame_HasNoTotal', () => {
    expect(totalBudgetMs(UNLIMITED)).toBeNull()
  })

  // The increment is not counted: it is earned per move, so the total is what
  // a player starts with, not what they might accumulate.
  it('totalBudgetMs_WithIncrements_CountsOnlyTheUpFrontTime', () => {
    expect(totalBudgetMs(suddenDeath(5, 3))).toBe(300_000)
  })
})

/*
 * Derived rather than stored, so a control can never disagree with its label.
 * This string appears on the play screen, the replay panel, and every clock.
 */
describe('describeTimeControl', () => {
  it('describeTimeControl_Untimed_NamesIt', () => {
    expect(describeTimeControl(UNLIMITED)).toBe('No clock')
  })

  it('describeTimeControl_PlainControl_DescribesByMinutes', () => {
    expect(describeTimeControl(suddenDeath(10))).toBe('10 min')
  })

  // An increment of zero is not worth saying; anything else is.
  it('describeTimeControl_Increment_IsMentionedOnlyWhenPresent', () => {
    expect(describeTimeControl(suddenDeath(3, 2))).toBe('3 min + 2s')
    expect(describeTimeControl(suddenDeath(3, 0))).toBe('3 min')
  })

  it('describeTimeControl_StagedControl_SpellsItOutInPlayOrder', () => {
    expect(describeTimeControl(classical(40, 120, 60))).toBe(
      '40 moves / 120 min, then 60 min',
    )
  })

  it('describeTimeControl_IncrementInEveryStage_CarriesItIntoEach', () => {
    expect(describeTimeControl(classical(40, 90, 30, 30))).toBe(
      '40 moves / 90 min + 30s, then 30 min + 30s',
    )
  })
})

describe('TIME_CONTROL_PRESETS', () => {
  // The label is what a player picks by, and a label that disagrees with the
  // control it selects is the one bug this table can have.
  /*
   * Spelled out as a table rather than recomputed from the control inside a
   * loop. Deriving the expected label from the same data it is checked against
   * only proves the derivation is self-consistent; these are the strings a
   * player actually reads, so they are written down.
   */
  it.each([
    ['unlimited', 'No clock'],
    ['1+0', '1 min'],
    ['2+1', '2 | 1'],
    ['3+0', '3 min'],
    ['3+2', '3 | 2'],
    ['5+3', '5 | 3'],
    ['10+0', '10 min'],
    ['15+10', '15 | 10'],
    ['30+0', '30 min'],
    ['90+30', '90 | 30'],
  ])('TIME_CONTROL_PRESETS_%s_IsLabelled%s', (id, label) => {
    const preset = TIME_CONTROL_PRESETS.find((candidate) => candidate.id === id)

    expect(preset?.label).toBe(label)
  })

  // The table above is only as good as its coverage of the list.
  it('TIME_CONTROL_PRESETS_FullList_NamesEveryPresetOffered', () => {
    expect(TIME_CONTROL_PRESETS.map((preset) => preset.id)).toEqual([
      'unlimited',
      '1+0',
      '2+1',
      '3+0',
      '3+2',
      '5+3',
      '10+0',
      '15+10',
      '30+0',
      '90+30',
    ])
  })

  it.each([
    ['1+0', 1 * MS_PER_MINUTE, 0],
    ['3+2', 3 * MS_PER_MINUTE, 2_000],
    ['90+30', 90 * MS_PER_MINUTE, 30_000],
  ])('TIME_CONTROL_PRESETS_%s_GrantsTheBudgetItsLabelPromises', (id, addedMs, incrementMs) => {
    const preset = TIME_CONTROL_PRESETS.find((candidate) => candidate.id === id)

    expect(preset?.control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs, incrementMs }],
    })
  })

  it('TIME_CONTROL_PRESETS_AllPresets_HaveDistinctIds', () => {
    const ids = TIME_CONTROL_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The setup screen defaults to this one, and looks it up by id.
  it('TIME_CONTROL_PRESETS_RapidDefault_ExistsForTheSetupScreen', () => {
    expect(TIME_CONTROL_PRESETS.some((preset) => preset.id === '10+0')).toBe(true)
  })
})

/*
 * Added by the mutation audit: every existing case used whole minutes, so
 * demoting the label's rounding to truncation passed.
 */
describe('describeTimeControl rounding', () => {
  it('describeTimeControl_NinetySecondStage_RoundsToTwoMinutesNotOne', () => {
    const control = {
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 90_000, incrementMs: 0 }],
    } as const

    const label = describeTimeControl(control)

    expect(label).toBe('2 min')
  })
})
