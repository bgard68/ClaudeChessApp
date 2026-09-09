import { describe, expect, it } from 'vitest'
import { FILES, RANKS, isSquare, toSquare } from './Square'

describe('isSquare', () => {
  it('toSquare_EverySquareOnTheBoard_Accepts', () => {
    const all = FILES.flatMap((file) => RANKS.map((rank) => `${file}${rank}`))
    expect(all).toHaveLength(64)
    expect(all.every(isSquare)).toBe(true)
  })

  it.each(['i1', 'a9', 'a0', 'A1', '1a', 'e', '', 'e44', ' e4', 'e4 '])(
    'toSquare_%s_Rejects',
    (value) => {
      expect(isSquare(value)).toBe(false)
    },
  )
})

/*
 * The parse boundary between the outside world and the domain: UI events, PGN
 * text and engine output all arrive as loose strings, and this is where they
 * stop being loose. Throwing beats returning null — a bad square is a bug in
 * the caller, not a value to carry onwards.
 */
describe('toSquare', () => {
  it('toSquare_ValidSquare_ReturnsTheSquareItWasGiven', () => {
    expect(toSquare('e4')).toBe('e4')
    expect(toSquare('a1')).toBe('a1')
    expect(toSquare('h8')).toBe('h8')
  })

  it('toSquare_InvalidValue_NamesTheOffendingValueWhenRefusing', () => {
    expect(() => toSquare('j9')).toThrow('"j9" is not an algebraic square name')
  })

  // Upper case is the common way this arrives wrong, and it is not silently
  // corrected: a caller sending "E4" has a bug worth surfacing.
  it('toSquare_UpperCase_DoesNotQuietlyAccept', () => {
    expect(() => toSquare('E4')).toThrow()
  })
})
