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

export const STORAGE_KEY = 'chess.daily-puzzle'

let inFlight: { day: string; promise: Promise<StoredDailyPuzzle> } | null = null

/**
 * `isUsable` is asked whether a *stored* puzzle can still be played, because
 * the structural checks below cannot tell: a FEN is a string whatever it
 * contains, and loading a bad one throws. Serving it anyway is unrecoverable —
 * the screen fails, and Try again reads the same entry straight back. An
 * unusable record is dropped so the day regenerates instead.
 */
export function todaysPuzzle(
  day: string,
  generate: () => Promise<GeneratedPuzzle>,
  isUsable: (puzzle: StoredDailyPuzzle) => boolean = () => true,
): Promise<StoredDailyPuzzle> {
  const stored = readStored()
  if (stored !== null && stored.day === day) {
    if (isUsable(stored)) return Promise.resolve(stored)
    discardStored()
  }
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

function discardStored(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Storage denied: nothing was readable to discard either.
  }
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
