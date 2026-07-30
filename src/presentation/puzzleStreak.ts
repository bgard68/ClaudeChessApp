/**
 * The daily-puzzle streak: how many days in a row the puzzle was solved.
 * Pure date arithmetic here, localStorage at the edges — same treatment as
 * the board theme, and for the same reason: a personal habit counter does not
 * justify the storage layer the game archive needs.
 */

export interface PuzzleStreak {
  readonly lastSolvedDay: string | null
  readonly streak: number
}

export const NO_STREAK: PuzzleStreak = { lastSolvedDay: null, streak: 0 }

/** Local calendar day as YYYY-MM-DD — the streak follows the player's clock. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function previousDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return dayKey(new Date(year!, month! - 1, day! - 1))
}

/** Solving twice in a day counts once; a missed day starts over at one. */
export function recordSolve(state: PuzzleStreak, day: string): PuzzleStreak {
  if (state.lastSolvedDay === day) return state
  const streak = state.lastSolvedDay === previousDay(day) ? state.streak + 1 : 1
  return { lastSolvedDay: day, streak }
}

/** What the pill shows: yesterday's streak still stands until today is missed. */
export function streakOn(state: PuzzleStreak, day: string): number {
  if (state.lastSolvedDay === null) return 0
  return state.lastSolvedDay === day || state.lastSolvedDay === previousDay(day)
    ? state.streak
    : 0
}

const STORAGE_KEY = 'chess.puzzle-streak'

export function loadStreak(): PuzzleStreak {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return NO_STREAK
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as PuzzleStreak).streak === 'number' &&
      typeof (parsed as PuzzleStreak).lastSolvedDay === 'string'
    ) {
      return parsed as PuzzleStreak
    }
    return NO_STREAK
  } catch {
    return NO_STREAK
  }
}

export function saveStreak(state: PuzzleStreak): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage denied: the streak lives for the session only.
  }
}
