import { describe, expect, it } from 'vitest'
import { NO_STREAK, recordSolve, streakOn } from './puzzleStreak'

describe('puzzle streak', () => {
  it('recordSolve_ConsecutiveDaysThenAGap_GrowsThenRestarts', () => {
    const monday = recordSolve(NO_STREAK, '2026-07-27')
    const tuesday = recordSolve(monday, '2026-07-28')
    expect(tuesday.streak).toBe(2)

    const afterGap = recordSolve(tuesday, '2026-07-30')
    expect(afterGap.streak).toBe(1)
  })

  it('recordSolve_SameDayRepeatedly_CountsOneSolvePerDay', () => {
    const first = recordSolve(NO_STREAK, '2026-07-30')
    expect(recordSolve(first, '2026-07-30')).toBe(first)
  })

  it('recordSolve_AcrossAMonthEnd_KeepsTheRun', () => {
    const endOfFebruary = recordSolve(NO_STREAK, '2026-02-28')
    expect(recordSolve(endOfFebruary, '2026-03-01').streak).toBe(2)
  })

  it('currentStreak_MissedToday_ShowsYesterdaysRunThenNothing', () => {
    const yesterday = recordSolve(recordSolve(NO_STREAK, '2026-07-28'), '2026-07-29')
    expect(streakOn(yesterday, '2026-07-30')).toBe(2)
    expect(streakOn(yesterday, '2026-07-31')).toBe(0)
  })
})
