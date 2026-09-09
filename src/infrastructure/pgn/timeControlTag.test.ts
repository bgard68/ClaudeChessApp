import { describe, expect, it } from 'vitest'
import { UNLIMITED, classical, suddenDeath } from '@domain/clock/TimeControl'
import { formatTimeControlTag, parseTimeControlTag } from './timeControlTag'

/*
 * The `TimeControl` tag decides how a replayed game's clock behaves, so a
 * misread tag shows a player a clock that never ran. The parser's stated
 * contract is "null rather than a wrong clock" — these tests hold it to that,
 * and pin the two places it is more lenient than its own documentation.
 */
describe('parseTimeControlTag', () => {
  it('parseTimeControlTag_StagedClassicalTag_ReturnsEveryStageInOrder', () => {
    const tag = '40/7200:1800'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 0 },
      ],
    })
  })

  it('parseTimeControlTag_SuddenDeathWithIncrement_ConvertsBothToMilliseconds', () => {
    const tag = '300+3'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 300_000, incrementMs: 3_000 }],
    })
  })

  it('parseTimeControlTag_ThreeStages_KeepsQuotasOnAllButTheLast', () => {
    const tag = '40/7200:20/3600:1800'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: 20, addedMs: 3_600_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 0 },
      ],
    })
  })

  /*
   * The final stage always runs to the end of the game, whatever the tag
   * claims. With only one stage that means its quota is dropped outright:
   * "40/7200" and "7200" describe the same clock once nothing follows them.
   */
  it('parseTimeControlTag_SingleStageWithQuota_DropsTheQuotaItCannotHonour', () => {
    const tag = '40/7200'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 7_200_000, incrementMs: 0 }],
    })
  })

  it('parseTimeControlTag_FractionalSeconds_RoundsToWholeMilliseconds', () => {
    const tag = '300.5+2.4'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 300_500, incrementMs: 2_400 }],
    })
  })

  it.each([
    ['the unknown marker', '?'],
    ['the unspecified marker', '-'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a word', 'soon'],
    ['a negative budget', '-5'],
    ['a negative increment', '300+-1'],
    ['a zero move quota', '0/300'],
    ['an empty leading section', ':300'],
    ['an empty trailing section', '300:'],
  ])('parseTimeControlTag_%s_ReturnsNullRatherThanAWrongClock', (_case, tag) => {
    const parsed = parseTimeControlTag(tag)

    expect(parsed).toBeNull()
  })

  it('parseTimeControlTag_UndefinedTag_ReturnsNull', () => {
    const parsed = parseTimeControlTag(undefined)

    expect(parsed).toBeNull()
  })

  /*
   * Two known deviations from the "null for anything malformed" promise in the
   * module's own doc comment. Pinned rather than fixed: both currently let real
   * archive files through, and changing them is a behaviour decision, not a
   * test one. See the analysis accompanying these tests.
   */
  it('parseTimeControlTag_ThirdPlusSegment_SilentlyIgnoresTheTrailingSegment', () => {
    const tag = '300+3+5'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 300_000, incrementMs: 3_000 }],
    })
  })

  it('parseTimeControlTag_TrailingGarbageInQuota_ParsesTheLeadingDigits', () => {
    const tag = '40abc/7200'

    const control = parseTimeControlTag(tag)

    expect(control).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 7_200_000, incrementMs: 0 }],
    })
  })
})

describe('formatTimeControlTag', () => {
  it('formatTimeControlTag_UnlimitedControl_WritesTheUnspecifiedMarker', () => {
    const tag = formatTimeControlTag(UNLIMITED)

    expect(tag).toBe('-')
  })

  // `classical` grants the increment in both stages, so both carry it here.
  it('formatTimeControlTag_ClassicalWithIncrement_WritesTheIncrementOnEveryStage', () => {
    const control = classical(40, 120, 30, 30)

    const tag = formatTimeControlTag(control)

    expect(tag).toBe('40/7200+30:1800+30')
  })

  it('formatTimeControlTag_IncrementOnFinalStageOnly_LeavesTheFirstStagePlain', () => {
    const control = {
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 30_000 },
      ],
    } as const

    const tag = formatTimeControlTag(control)

    expect(tag).toBe('40/7200:1800+30')
  })

  it('formatTimeControlTag_NoIncrement_OmitsThePlusSegment', () => {
    const control = suddenDeath(5)

    const tag = formatTimeControlTag(control)

    expect(tag).toBe('300')
  })

  it('formatTimeControlTag_SubSecondValues_RoundsToWholeSeconds', () => {
    const control = { kind: 'staged', stages: [
      { movesToComplete: null, addedMs: 300_500, incrementMs: 2_400 },
    ] } as const

    const tag = formatTimeControlTag(control)

    expect(tag).toBe('301+2')
  })
})

/*
 * A game this app saves has to reload under the control it was played with,
 * which is a property of the pair rather than of either function.
 */
describe('the parse/format pair', () => {
  it.each([
    ['a classical staged control', '40/7200:1800+30'],
    ['a blitz control', '300+3'],
    ['a control with no increment', '600'],
  ])('formatTimeControlTag_AfterParsing_%s_ReproducesTheTag', (_case, tag) => {
    const parsed = parseTimeControlTag(tag)

    const rewritten = parsed === null ? null : formatTimeControlTag(parsed)

    expect(rewritten).toBe(tag)
  })

  it('parseTimeControlTag_AfterFormattingUnlimited_ReturnsNullNotAZeroClock', () => {
    const tag = formatTimeControlTag(UNLIMITED)

    const parsed = parseTimeControlTag(tag)

    expect(parsed).toBeNull()
  })
})
