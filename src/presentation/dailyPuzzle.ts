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

/** How far through the self-play game the generator has got. */
export type ProgressListener = (ply: number) => void

export const STORAGE_KEY = 'chess.daily-puzzle'

/**
 * The generation running now, if there is one.
 *
 * Progress is fanned out from here rather than wired straight to the caller
 * that happened to start it, because the two have different lifetimes. A
 * second caller *joins* the promise — the whole point of this cache — but used
 * to join it without any way to hear progress, since the running generator was
 * reporting to the first caller's callback and that caller was gone. The
 * symptom: the screen sat on "Warming up…" for the entire twelve seconds,
 * every time in development, where StrictMode makes the second caller the only
 * one that matters, and in production for anyone who left the screen and came
 * back.
 *
 * `lastPly` is replayed to a joiner on arrival, because the next ply can be a
 * second or more away and starting from nothing is the same bug in miniature.
 */
interface Generation {
  readonly day: string
  readonly promise: Promise<StoredDailyPuzzle>
  readonly listeners: Set<ProgressListener>
  /** Mutable, and shared with the reporter that advances it. */
  readonly progress: { lastPly: number }
}

let inFlight: Generation | null = null

/**
 * `isUsable` is asked whether a *stored* puzzle can still be played, because
 * the structural checks below cannot tell: a FEN is a string whatever it
 * contains, and loading a bad one throws. Serving it anyway is unrecoverable —
 * the screen fails, and Try again reads the same entry straight back. An
 * unusable record is dropped so the day regenerates instead.
 */
export function todaysPuzzle(
  day: string,
  generate: (onProgress: ProgressListener) => Promise<GeneratedPuzzle>,
  isUsable: (puzzle: StoredDailyPuzzle) => boolean = () => true,
  onProgress: ProgressListener = () => {},
): Promise<StoredDailyPuzzle> {
  const stored = readStored()
  if (stored !== null && stored.day === day) {
    if (isUsable(stored)) return Promise.resolve(stored)
    discardStored()
  }

  if (inFlight !== null && inFlight.day === day) {
    const joined = inFlight
    joined.listeners.add(onProgress)
    if (joined.progress.lastPly > 0) onProgress(joined.progress.lastPly)
    return joined.promise
  }

  const listeners = new Set<ProgressListener>([onProgress])
  // Its own object so the reporter below can advance it before `inFlight`,
  // which shares it, has been assigned.
  const progress = { lastPly: 0 }

  const promise = generate((ply) => {
    progress.lastPly = ply
    for (const listener of listeners) listener(ply)
  })
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
      // Releases the listeners' closures. There is deliberately no unsubscribe
      // API: a listener that outlives its screen is already harmless — the
      // screen ignores anything arriving after its own cleanup — and the set is
      // emptied here within seconds either way. A subscription protocol to
      // shorten that would be ceremony, not safety.
      listeners.clear()
    })

  inFlight = { day, promise, listeners, progress }
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
