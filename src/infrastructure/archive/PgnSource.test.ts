import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpPgnSource, StaticPgnSource } from './PgnSource'

/** The slice of a fetch Response that `load()` actually touches. */
const response = (
  body: string,
  init: { ok: boolean; status: number; statusText: string },
): Response => ({ ...init, text: () => Promise.resolve(body) }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StaticPgnSource', () => {
  it('serves the text it was built with', async () => {
    const source = new StaticPgnSource('test games', '[Event "x"]\n\n1. e4 *')

    expect(source.name).toBe('test games')
    await expect(source.load()).resolves.toBe('[Event "x"]\n\n1. e4 *')
  })
})

describe('HttpPgnSource', () => {
  it('fetches its URL and returns the body', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(response('[Event "WCh"]\n\n1. d4 *', { ok: true, status: 200, statusText: 'OK' })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const source = new HttpPgnSource('championship games', '/games/wch.pgn')

    await expect(source.load()).resolves.toBe('[Event "WCh"]\n\n1. d4 *')
    expect(source.name).toBe('championship games')
    expect(fetchMock).toHaveBeenCalledWith('/games/wch.pgn')
  })

  // The message is what the archive stores as the import failure, so it has to
  // say which file failed and how — "fetch failed" helps nobody with two files.
  it('reports which URL failed, and how', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response('', { ok: false, status: 404, statusText: 'Not Found' }))),
    )

    const source = new HttpPgnSource('optional careers', '/games/missing.pgn')

    await expect(source.load()).rejects.toThrow(
      'Could not fetch /games/missing.pgn: 404 Not Found',
    )
  })
})
