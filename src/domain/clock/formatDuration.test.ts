import { describe, expect, it } from 'vitest'
import { formatDuration } from './formatDuration'

/*
 * This is on screen every second of every game, so a fault here is both the
 * most visible kind and the easiest to stop noticing.
 */
describe('formatDuration', () => {
  it('writes minutes and seconds with a padded second', () => {
    expect(formatDuration(600_000)).toBe('10:00')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_599_000)).toBe('59:59')
  })

  // An hour is where the reading needs a third field, and the minutes start
  // padding so the columns stay put.
  it('adds hours once there is an hour to show', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(7_265_000)).toBe('2:01:05')
  })

  /*
   * Under a minute the display switches to tenths. This is the convention
   * players expect when a flag is close: "12" and "12.9" are the same second
   * but not the same amount of trouble.
   */
  it('switches to tenths under a minute', () => {
    expect(formatDuration(59_999)).toBe('59.9')
    expect(formatDuration(12_300)).toBe('12.3')
    expect(formatDuration(900)).toBe('0.9')
  })

  it('changes shape exactly at the minute', () => {
    expect(formatDuration(60_000)).toBe('1:00')
    expect(formatDuration(59_900)).toBe('59.9')
  })

  // Tenths are floored, never rounded up: a clock must not read 13.0 while
  // there is still 12.98 seconds left to move.
  it('rounds tenths down, so the reading is never flattering', () => {
    expect(formatDuration(12_990)).toBe('12.9')
    expect(formatDuration(12_000)).toBe('12.0')
  })

  it('shows a flagged clock as zero rather than counting past it', () => {
    expect(formatDuration(0)).toBe('0.0')
    expect(formatDuration(-5_000)).toBe('0.0')
  })

  // An untimed game has no reading to give, and zero would mean flag fall.
  it('marks an untimed game as endless', () => {
    expect(formatDuration(null)).toBe('∞')
  })
})
