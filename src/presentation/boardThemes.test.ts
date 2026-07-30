import { describe, expect, it } from 'vitest'
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
})
