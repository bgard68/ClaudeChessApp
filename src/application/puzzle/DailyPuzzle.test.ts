import { describe, expect, it } from 'vitest'
import { dailySeed } from './DailyPuzzle'

describe('dailySeed', () => {
  it('gives the whole local day one seed', () => {
    const morning = new Date(2026, 7, 24, 0, 1)
    const night = new Date(2026, 7, 24, 23, 59)

    expect(dailySeed(morning)).toBe(dailySeed(night))
  })

  it('turns over at the local midnight', () => {
    const today = new Date(2026, 7, 24, 12, 0)
    const tomorrow = new Date(2026, 7, 25, 12, 0)

    expect(dailySeed(tomorrow)).toBe(dailySeed(today) + 1)
  })

  it('counts days since the epoch', () => {
    const day = new Date(2026, 7, 24)

    expect(dailySeed(day)).toBe(Math.floor(Date.UTC(2026, 7, 24) / 86_400_000))
  })
})
