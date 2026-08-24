import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dayKey,
  loadStreak,
  NO_STREAK,
  recordSolve,
  saveStreak,
  streakOn,
  type PuzzleStreak,
} from './puzzleStreak'

const stored = (value: unknown) => {
  const data = new Map<string, string>([
    ['chess.puzzle-streak', typeof value === 'string' ? value : JSON.stringify(value)],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, text: string) => void data.set(key, text),
  })
  return data
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dayKey', () => {
  it('writes the local calendar day', () => {
    expect(dayKey(new Date(2026, 7, 4))).toBe('2026-08-04')
  })
})

describe('recordSolve', () => {
  it('starts a streak at one', () => {
    expect(recordSolve(NO_STREAK, '2026-08-24')).toEqual({
      lastSolvedDay: '2026-08-24',
      streak: 1,
    })
  })

  it('counts a solve on the following day', () => {
    const yesterday: PuzzleStreak = { lastSolvedDay: '2026-08-23', streak: 4 }
    expect(recordSolve(yesterday, '2026-08-24')).toEqual({
      lastSolvedDay: '2026-08-24',
      streak: 5,
    })
  })

  it('counts twice in one day only once', () => {
    const today: PuzzleStreak = { lastSolvedDay: '2026-08-24', streak: 3 }
    expect(recordSolve(today, '2026-08-24')).toBe(today)
  })

  it('starts over after a missed day', () => {
    const stale: PuzzleStreak = { lastSolvedDay: '2026-08-20', streak: 9 }
    expect(recordSolve(stale, '2026-08-24')).toEqual({
      lastSolvedDay: '2026-08-24',
      streak: 1,
    })
  })

  it('counts across a month boundary', () => {
    const last: PuzzleStreak = { lastSolvedDay: '2026-07-31', streak: 2 }
    expect(recordSolve(last, '2026-08-01').streak).toBe(3)
  })
})

describe('streakOn', () => {
  it('shows nothing before the first solve', () => {
    expect(streakOn(NO_STREAK, '2026-08-24')).toBe(0)
  })

  it('shows today’s streak', () => {
    expect(streakOn({ lastSolvedDay: '2026-08-24', streak: 6 }, '2026-08-24')).toBe(6)
  })

  it('lets yesterday’s streak stand until today is missed', () => {
    expect(streakOn({ lastSolvedDay: '2026-08-23', streak: 6 }, '2026-08-24')).toBe(6)
  })

  it('drops a streak once a day has been missed', () => {
    expect(streakOn({ lastSolvedDay: '2026-08-20', streak: 6 }, '2026-08-24')).toBe(0)
  })
})

describe('loadStreak', () => {
  it('reads a stored streak back', () => {
    stored({ lastSolvedDay: '2026-08-24', streak: 3 })
    expect(loadStreak()).toEqual({ lastSolvedDay: '2026-08-24', streak: 3 })
  })

  it('starts fresh when nothing is stored', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(loadStreak()).toEqual(NO_STREAK)
  })

  it('starts fresh when storage is unavailable altogether', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadStreak()).toEqual(NO_STREAK)
  })

  it('refuses a record of the wrong shape', () => {
    // Anything that is not a counter beside a day is not a streak, however
    // well-formed the JSON is.
    for (const value of [null, 5, 'text', {}, { streak: 3 }, { streak: '3', lastSolvedDay: 'x' }, { lastSolvedDay: 'x' }]) {
      stored(value)
      expect(loadStreak()).toEqual(NO_STREAK)
    }
  })

  it('starts fresh rather than throwing on unreadable JSON', () => {
    stored('{ not json')
    expect(loadStreak()).toEqual(NO_STREAK)
  })

  it('starts fresh when storage itself throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
    })
    expect(loadStreak()).toEqual(NO_STREAK)
  })
})

describe('saveStreak', () => {
  it('writes the streak back', () => {
    const data = stored(NO_STREAK)
    saveStreak({ lastSolvedDay: '2026-08-24', streak: 2 })

    expect(JSON.parse(data.get('chess.puzzle-streak')!)).toEqual({
      lastSolvedDay: '2026-08-24',
      streak: 2,
    })
  })

  it('keeps the streak for the session when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('denied')
      },
    })

    expect(() => saveStreak({ lastSolvedDay: '2026-08-24', streak: 2 })).not.toThrow()
  })

  it('does nothing where there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => saveStreak(NO_STREAK)).not.toThrow()
  })
})
