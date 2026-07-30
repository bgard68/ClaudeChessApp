import { describe, expect, it } from 'vitest'
import { NO_STREAK, recordSolve, streakOn } from './puzzleStreak'

describe('puzzle streak', () => {
  it('grows on consecutive days and restarts after a gap', () => {
    const monday = recordSolve(NO_STREAK, '2026-07-27')
    const tuesday = recordSolve(monday, '2026-07-28')
    expect(tuesday.streak).toBe(2)

    const afterGap = recordSolve(tuesday, '2026-07-30')
    expect(afterGap.streak).toBe(1)
  })

  it('counts one solve per day however often the puzzle is solved', () => {
    const first = recordSolve(NO_STREAK, '2026-07-30')
    expect(recordSolve(first, '2026-07-30')).toBe(first)
  })

  it('crosses month ends without dropping the run', () => {
    const endOfFebruary = recordSolve(NO_STREAK, '2026-02-28')
    expect(recordSolve(endOfFebruary, '2026-03-01').streak).toBe(2)
  })

  it('shows yesterday’s run until today is missed, then nothing', () => {
    const yesterday = recordSolve(recordSolve(NO_STREAK, '2026-07-28'), '2026-07-29')
    expect(streakOn(yesterday, '2026-07-30')).toBe(2)
    expect(streakOn(yesterday, '2026-07-31')).toBe(0)
  })
})
