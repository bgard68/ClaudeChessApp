import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedPuzzle } from '@application/puzzle/DailyPuzzle'
import { STORAGE_KEY, todaysPuzzle, type ProgressListener } from './dailyPuzzle'

const DAY = '2026-07-31'

/** Mate in one, and a position that really loads. */
const GOOD: GeneratedPuzzle = {
  fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
  mateIn: 1,
  mateOnMove: 30,
}

/** Anything chess.js refuses is unusable, however well-formed the record is. */
const loadable = (puzzle: GeneratedPuzzle) => puzzle.fen.split(' ').length === 6

class FakeStorage {
  private data = new Map<string, string>()
  getItem = (key: string) => this.data.get(key) ?? null
  setItem = (key: string, value: string) => void this.data.set(key, value)
  removeItem = (key: string) => void this.data.delete(key)
  seed = (value: unknown) => this.data.set(STORAGE_KEY, JSON.stringify(value))
  raw = () => this.data.get(STORAGE_KEY)
}

let storage: FakeStorage

beforeEach(() => {
  storage = new FakeStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('todaysPuzzle', () => {
  it('dailyPuzzleFor_SameDayTwice_GeneratesOnceAndServesTheStoredCopy', async () => {
    const generate = vi.fn(() => Promise.resolve(GOOD))

    const first = await todaysPuzzle(DAY, generate, loadable)
    const second = await todaysPuzzle(DAY, generate, loadable)

    expect(first.fen).toBe(GOOD.fen)
    expect(second.fen).toBe(GOOD.fen)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('dailyPuzzleFor_ConcurrentCallers_ShareOneGeneration', async () => {
    let release: (puzzle: GeneratedPuzzle) => void = () => {}
    const generate = vi.fn(
      () => new Promise<GeneratedPuzzle>((resolve) => (release = resolve)),
    )

    const both = Promise.all([
      todaysPuzzle(DAY, generate, loadable),
      todaysPuzzle(DAY, generate, loadable),
    ])
    release(GOOD)
    await both

    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('dailyPuzzleFor_NewDay_Regenerates', async () => {
    const generate = vi.fn(() => Promise.resolve(GOOD))

    await todaysPuzzle(DAY, generate, loadable)
    await todaysPuzzle('2026-08-01', generate, loadable)

    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('dailyPuzzleFor_StoredPositionUnloadable_DiscardsIt', async () => {
    // A record that passes every structural check and still cannot be played:
    // the shape is right, the FEN is not. Reached by a tampered or
    // half-written entry, or by any future change to what a puzzle records.
    storage.seed({ day: DAY, fen: 'not-a-fen', mateIn: 1, mateOnMove: 4 })
    const generate = vi.fn(() => Promise.resolve(GOOD))

    const puzzle = await todaysPuzzle(DAY, generate, loadable)

    // Without this, the unusable record is served forever: the screen throws
    // loading it, and Try again reads the very same entry back.
    expect(puzzle.fen).toBe(GOOD.fen)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(storage.raw()).toContain(GOOD.fen)
  })

  it('dailyPuzzleFor_StorageRefusesReadsAndWrites_Survives', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    const generate = vi.fn(() => Promise.resolve(GOOD))

    await expect(todaysPuzzle(DAY, generate, loadable)).resolves.toMatchObject({
      fen: GOOD.fen,
      day: DAY,
    })
  })
})

/*
 * Progress belongs to the generation, not to whoever happened to start it.
 *
 * The bug: a second caller joined the running generation — which is the whole
 * point of sharing it — but joined without any way to hear progress, because
 * the generator was reporting into the first caller's callback and that caller
 * was already gone. StrictMode makes the joiner the *only* live caller in
 * development, so the puzzle screen sat on "Warming up…" for the full twelve
 * seconds every single time, and did the same in production for anyone who
 * left the screen and came back while it was still composing.
 *
 * Neither of these can be written against the screen: the unit suite renders
 * one static commit and never runs an effect, which is exactly why the bug
 * lived in the gap. They are written against the module that owns the
 * generation instead, which is where the decision actually is.
 */
describe('todaysPuzzle progress', () => {
  /** Hands back the generator's reporter, and a way to finish the game. */
  const pausedGeneration = () => {
    let report: ProgressListener = () => {}
    let finish: (puzzle: GeneratedPuzzle) => void = () => {}
    const generate = vi.fn((onProgress: ProgressListener) => {
      report = onProgress
      return new Promise<GeneratedPuzzle>((resolve) => {
        finish = resolve
      })
    })
    return {
      generate,
      report: (ply: number) => report(ply),
      finish: () => finish(GOOD),
    }
  }

  it('dailyPuzzleFor_CallerThatJoinedTheGeneration_HearsProgressAsWell', async () => {
    const { generate, report, finish } = pausedGeneration()
    const starter: number[] = []
    const joiner: number[] = []

    const first = todaysPuzzle(DAY, generate, loadable, (ply) => starter.push(ply))
    const second = todaysPuzzle(DAY, generate, loadable, (ply) => joiner.push(ply))
    report(12)
    finish()
    await Promise.all([first, second])

    expect(generate).toHaveBeenCalledTimes(1)
    expect(starter).toContain(12)
    expect(joiner).toContain(12)
  })

  // The next ply can be a second or more away. A joiner left on nothing until
  // then is the same bug in miniature, and it is the one anyone would see.
  it('dailyPuzzleFor_JoiningPartWayThrough_IsCaughtUpImmediately', async () => {
    const { generate, report, finish } = pausedGeneration()
    const joiner: number[] = []

    const first = todaysPuzzle(DAY, generate, loadable)
    report(30)
    const second = todaysPuzzle(DAY, generate, loadable, (ply) => joiner.push(ply))

    expect(joiner).toEqual([30])

    finish()
    await Promise.all([first, second])
  })

  // Nothing has happened yet, so there is nothing to replay — and reporting a
  // ply of zero would read as "move 0" on the screen.
  it('dailyPuzzleFor_JoiningBeforeTheFirstPly_IsToldNothing', async () => {
    const { generate, finish } = pausedGeneration()
    const joiner: number[] = []

    const first = todaysPuzzle(DAY, generate, loadable)
    const second = todaysPuzzle(DAY, generate, loadable, (ply) => joiner.push(ply))

    expect(joiner).toEqual([])

    finish()
    await Promise.all([first, second])
  })

  it('dailyPuzzleFor_GenerationFinished_StopsHoldingItsListeners', async () => {
    const { generate, report, finish } = pausedGeneration()
    const heard: number[] = []

    const only = todaysPuzzle(DAY, generate, loadable, (ply) => heard.push(ply))
    report(4)
    finish()
    await only

    // Released with the generation: a listener belongs to one composition, and
    // the screen that registered it may be long gone.
    report(5)
    expect(heard).toEqual([4])
  })
})
