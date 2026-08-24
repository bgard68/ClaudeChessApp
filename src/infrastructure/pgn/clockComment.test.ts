import { describe, expect, it } from 'vitest'
import { formatClockComment, parseClockComment } from './clockComment'

describe('parseClockComment', () => {
  it('reads the H:MM:SS form broadcasts use', () => {
    expect(parseClockComment('[%clk 1:59:30]')).toBe((3600 + 59 * 60 + 30) * 1000)
  })

  it('reads a fractional seconds field', () => {
    expect(parseClockComment('[%clk 0:00:12.7]')).toBe(12_700)
  })

  it('reads the MM:SS form some sources emit', () => {
    expect(parseClockComment('[%clk 05:30]')).toBe(330_000)
  })

  it('finds the annotation inside a longer comment', () => {
    expect(parseClockComment('a fine move [%clk 0:01:00] indeed')).toBe(60_000)
  })

  it('reports nothing for a comment carrying no clock', () => {
    expect(parseClockComment('a fine move')).toBeNull()
    expect(parseClockComment('[%eval 0.24]')).toBeNull()
    expect(parseClockComment('')).toBeNull()
  })
})

describe('formatClockComment', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(formatClockComment(65_000)).toBe('[%clk 0:01:05]')
  })

  it('carries hours', () => {
    expect(formatClockComment(3_600_000 + 120_000 + 3_000)).toBe('[%clk 1:02:03]')
  })

  it('floors a negative reading at zero rather than writing one', () => {
    expect(formatClockComment(-5_000)).toBe('[%clk 0:00:00]')
  })

  it('round-trips a whole-second reading', () => {
    for (const ms of [0, 1_000, 59_000, 3_599_000, 7_265_000]) {
      expect(parseClockComment(formatClockComment(ms))).toBe(ms)
    }
  })
})
