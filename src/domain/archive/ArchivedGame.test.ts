import { describe, expect, it } from 'vitest'
import { displayYear } from './ArchivedGame'

/*
 * PGN dates are written "1972.07.23", and a great many archived games have
 * only part of one — "1972.??.??" is ordinary, and some carry nothing at all.
 * The archive list and the replay header both show this, so it has to hold up
 * against whatever the source file contained.
 */
describe('displayYear', () => {
  it('takes the year off a full PGN date', () => {
    expect(displayYear('1972.07.23')).toBe('1972')
  })

  it('reads a date whose month and day were never recorded', () => {
    expect(displayYear('1972.??.??')).toBe('1972')
  })

  it('reads a bare year', () => {
    expect(displayYear('1972')).toBe('1972')
  })

  // "????" rather than a blank: the column keeps its shape, and an unknown
  // year is visibly unknown rather than looking like a rendering fault.
  it.each([
    ['an unknown date', '????.??.??'],
    ['nothing at all', ''],
    ['something that is not a date', 'unknown'],
    ['too few digits', '197'],
  ])('marks %s as unknown', (_why, date) => {
    expect(displayYear(date)).toBe('????')
  })

  it('does not mistake a longer number for a year', () => {
    expect(displayYear('19720723')).toBe('1972')
  })
})
