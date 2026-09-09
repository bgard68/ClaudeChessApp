import { describe, expect, it } from 'vitest'
import { formatClockComment, parseClockComment } from './clockComment'

/*
 * `[%clk]` is the only record of what a player's clock actually read. Replay
 * shows these numbers directly, so a misparse is a lie about a real game.
 */
describe('parseClockComment', () => {
  it('parseClockComment_FullHourMinuteSecond_ReturnsTotalMilliseconds', () => {
    const comment = '[%clk 1:29:35]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(5_375_000)
  })

  it('parseClockComment_TenthsOfASecond_KeepsTheFraction', () => {
    const comment = '[%clk 0:00:59.9]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(59_900)
  })

  it('parseClockComment_NoHourField_TreatsTheFieldsAsMinutesAndSeconds', () => {
    const comment = '[%clk 12:34]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(754_000)
  })

  it('parseClockComment_WrappedInMovetextBraces_StillFindsTheReading', () => {
    const comment = '{[%clk 0:05:00]}'

    const ms = parseClockComment(comment)

    expect(ms).toBe(300_000)
  })

  it('parseClockComment_PaddedWhitespace_IgnoresIt', () => {
    const comment = '[%clk  1:29:35  ]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(5_375_000)
  })

  it('parseClockComment_ZeroOnTheClock_ReturnsZeroRatherThanNull', () => {
    const comment = '[%clk 0:00:00]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(0)
  })

  it.each([
    ['prose with no annotation', 'a fine move'],
    ['an empty comment', ''],
    ['an evaluation annotation instead', '[%eval 0.24]'],
    ['an uppercase tag, which the format does not define', '[%CLK 1:00:00]'],
    ['a clock with no digits', '[%clk oops]'],
    ['an unterminated annotation', '[%clk 1:29:35'],
  ])('parseClockComment_%s_ReturnsNull', (_case, comment) => {
    const ms = parseClockComment(comment)

    expect(ms).toBeNull()
  })

  /*
   * No range validation: "1:60:00" is not a legal reading, but the parser adds
   * the fields rather than rejecting it. Pinned because a stricter parser would
   * start returning null here, and that is a decision worth making on purpose.
   */
  it('parseClockComment_MinutesBeyondSixty_AddsThemRatherThanRejecting', () => {
    const comment = '[%clk 1:60:00]'

    const ms = parseClockComment(comment)

    expect(ms).toBe(7_200_000)
  })
})

describe('formatClockComment', () => {
  it('formatClockComment_WholeHours_PadsMinutesAndSeconds', () => {
    const comment = formatClockComment(3_600_000)

    expect(comment).toBe('[%clk 1:00:00]')
  })

  it('formatClockComment_UnderOneSecond_RoundsToTheNearestSecond', () => {
    const comment = formatClockComment(500)

    expect(comment).toBe('[%clk 0:00:01]')
  })

  it('formatClockComment_JustUnderAMinute_CarriesIntoTheMinuteField', () => {
    const comment = formatClockComment(59_999)

    expect(comment).toBe('[%clk 0:01:00]')
  })

  // A flagged clock is 0:00:00, never a negative reading.
  it('formatClockComment_NegativeMilliseconds_ClampsToZero', () => {
    const comment = formatClockComment(-5_000)

    expect(comment).toBe('[%clk 0:00:00]')
  })

  it('formatClockComment_LongAdjournmentControl_DoesNotWrapTheHourField', () => {
    const comment = formatClockComment(359_999_000)

    expect(comment).toBe('[%clk 99:59:59]')
  })
})

describe('the parse/format pair', () => {
  it.each([
    ['a fresh blitz clock', 300_000],
    ['a classical clock', 7_200_000],
    ['a flagged clock', 0],
  ])('parseClockComment_AfterFormatting_%s_ReturnsTheSameReading', (_case, ms) => {
    const comment = formatClockComment(ms)

    const readBack = parseClockComment(comment)

    expect(readBack).toBe(ms)
  })

  /*
   * The pair only round-trips on whole seconds — the writer rounds, and the
   * format has no field for what it dropped. Worth stating outright, because
   * clocks recorded from live play carry milliseconds.
   */
  it('parseClockComment_AfterFormattingSubSecondTime_ReturnsTheRoundedSecond', () => {
    const comment = formatClockComment(59_400)

    const readBack = parseClockComment(comment)

    expect(readBack).toBe(59_000)
  })
})
