import { describe, expect, it } from 'vitest'
import { displayYear, placeOrNull } from './ArchivedGame'

/*
 * PGN dates are written "1972.07.23", and a great many archived games have
 * only part of one — "1972.??.??" is ordinary, and some carry nothing at all.
 * The archive list and the replay header both show this, so it has to hold up
 * against whatever the source file contained.
 */
describe('displayYear', () => {
  it('displayYear_FullPgnDate_TakesTheYearOff', () => {
    expect(displayYear('1972.07.23')).toBe('1972')
  })

  it('displayYear_MonthAndDayUnknown_StillReadsTheYear', () => {
    expect(displayYear('1972.??.??')).toBe('1972')
  })

  it('displayYear_BareYear_ReadsIt', () => {
    expect(displayYear('1972')).toBe('1972')
  })

  // "????" rather than a blank: the column keeps its shape, and an unknown
  // year is visibly unknown rather than looking like a rendering fault.
  it.each([
    ['an unknown date', '????.??.??'],
    ['nothing at all', ''],
    ['something that is not a date', 'unknown'],
    ['too few digits', '197'],
  ])('displayYear_%s_MarksItUnknown', (_why, date) => {
    expect(displayYear(date)).toBe('????')
  })

  it('displayYear_LongerNumber_IsNotMistakenForAYear', () => {
    expect(displayYear('19720723')).toBe('1972')
  })
})

/*
 * Added by the mutation audit: nothing exercised placeOrNull directly, so
 * inverting its null test or returning undefined passed the suite.
 */
describe('placeOrNull', () => {
  it('placeOrNull_RealPlaceName_ReturnsItUnchanged', () => {
    const place = placeOrNull('Reykjavik ISL')

    expect(place).toBe('Reykjavik ISL')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['the unknown marker', '?'],
  ])('placeOrNull_%s_ReturnsNullExactly', (_case, value) => {
    const place = placeOrNull(value)

    expect(place).toBeNull()
  })
})
