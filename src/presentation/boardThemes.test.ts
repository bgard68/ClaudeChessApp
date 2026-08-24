import { describe, expect, it, vi } from 'vitest'
import { boardThemeById, currentBoardTheme, rememberBoardTheme } from './boardThemes'

describe('board themes', () => {
  it('falls back to the default for a missing or unknown id', () => {
    // A stored id from a removed theme must not strand the board.
    expect(boardThemeById(null).id).toBe('green')
    expect(boardThemeById('no-such-theme').id).toBe('green')
  })

  it('answers with the chosen theme once one is remembered', () => {
    // Runs without localStorage (node environment): the in-module cache is
    // what keeps the choice alive when storage is unavailable.
    rememberBoardTheme('walnut')
    expect(currentBoardTheme().id).toBe('walnut')

    rememberBoardTheme('green')
    expect(currentBoardTheme().id).toBe('green')
  })

  it('reads the remembered id back out of storage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })

    rememberBoardTheme('walnut')
    expect([...store.values()]).toEqual(['walnut'])

    vi.unstubAllGlobals()
  })

  it('falls back to the default when reading storage throws', async () => {
    // Private browsing throws on getItem rather than returning null. The
    // module caches its answer, so this needs a fresh copy of it.
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
    })

    const fresh = await import('./boardThemes')
    expect(fresh.currentBoardTheme().id).toBe('green')

    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('keeps the choice for the session when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })

    // Private browsing throws on both ends; the board must still change.
    rememberBoardTheme('walnut')
    expect(currentBoardTheme().id).toBe('walnut')

    vi.unstubAllGlobals()
  })
})
