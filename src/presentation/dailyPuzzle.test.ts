import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedPuzzle } from '@application/puzzle/DailyPuzzle'
import { STORAGE_KEY, todaysPuzzle } from './dailyPuzzle'

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
  it('generates once and serves the stored copy afterwards', async () => {
    const generate = vi.fn(() => Promise.resolve(GOOD))

    const first = await todaysPuzzle(DAY, generate, loadable)
    const second = await todaysPuzzle(DAY, generate, loadable)

    expect(first.fen).toBe(GOOD.fen)
    expect(second.fen).toBe(GOOD.fen)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('shares one generation between concurrent callers', async () => {
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

  it('regenerates when a new day arrives', async () => {
    const generate = vi.fn(() => Promise.resolve(GOOD))

    await todaysPuzzle(DAY, generate, loadable)
    await todaysPuzzle('2026-08-01', generate, loadable)

    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('discards a stored puzzle whose position cannot be loaded', async () => {
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

  it('survives storage that refuses to be read or written', async () => {
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
