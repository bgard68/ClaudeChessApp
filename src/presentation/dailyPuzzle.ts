import type { GeneratedPuzzle } from '@application/puzzle/DailyPuzzle'

/**
 * One generated puzzle per calendar day per device.
 *
 * Generation runs the engine for a dozen seconds, so the result is kept for
 * the rest of the day. The in-flight promise is shared too: StrictMode's
 * double-mounted effect — or an impatient back-and-forth — must join the
 * running generation, not start a second engine.
 */

export interface StoredDailyPuzzle extends GeneratedPuzzle {
  readonly day: string
}

const STORAGE_KEY = 'chess.daily-puzzle'

let inFlight: { day: string; promise: Promise<StoredDailyPuzzle> } | null = null

export function todaysPuzzle(
  day: string,
  generate: () => Promise<GeneratedPuzzle>,
): Promise<StoredDailyPuzzle> {
  const stored = readStored()
  if (stored !== null && stored.day === day) return Promise.resolve(stored)
  if (inFlight !== null && inFlight.day === day) return inFlight.promise

  const promise = generate()
    .then((puzzle) => {
      const record: StoredDailyPuzzle = { ...puzzle, day }
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(record))
      } catch {
        // Storage denied: the module-level promise still serves the session.
      }
      return record
    })
    .finally(() => {
      inFlight = null
    })

  inFlight = { day, promise }
  return promise
}

function readStored(): StoredDailyPuzzle | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as StoredDailyPuzzle
    return typeof record.day === 'string' &&
      typeof record.fen === 'string' &&
      typeof record.mateIn === 'number' &&
      typeof record.mateOnMove === 'number'
      ? record
      : null
  } catch {
    return null
  }
}
