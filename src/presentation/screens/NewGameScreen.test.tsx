import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NewGameScreen, summarise } from './NewGameScreen'

const markup = () => renderToStaticMarkup(<NewGameScreen onStart={vi.fn()} />)

describe('summarise', () => {
  it('names the seat, the opponent and the clock', () => {
    expect(summarise('computer', 'white', 'Club', '10+0')).toBe(
      'You play White · Computer · Club · 10+0',
    )
  })

  it('says which side you took when you took Black', () => {
    expect(summarise('computer', 'black', 'Club', '10+0')).toContain('You play Black')
  })

  // Choosing at random means the seat is genuinely not known yet, so the
  // summary must not name one.
  it('names no colour when the seat is drawn at random', () => {
    const line = summarise('computer', 'random', 'Club', '10+0')
    expect(line).toContain('Colour drawn at random')
    expect(line).not.toContain('You play')
  })

  it('describes a game on one device without a difficulty', () => {
    const line = summarise('human', 'white', 'Club', '5+3')
    expect(line).toBe('You play White · Two players, one device · 5+3')
    expect(line).not.toContain('Club')
  })

  // Nobody has a seat when both sides are the engine, so the sentence drops
  // the seat rather than claiming one.
  it('drops the seat entirely when the engine plays itself', () => {
    const line = summarise('engines', 'white', 'Grandmaster', '3+2')
    expect(line).toBe('Stockfish vs Stockfish · Grandmaster · 3+2')
    expect(line).not.toContain('You play')
  })
})

describe('NewGameScreen', () => {
  it('introduces what the screen is for', () => {
    expect(markup()).toContain('Choose your match')
  })

  it('previews the board you are about to play on', () => {
    expect(markup().match(/data-square=/g)).toHaveLength(64)
    expect(markup()).toContain('White perspective')
  })

  // The setup screen is where the licence attribution lives, and it is the
  // first screen every visitor sees.
  it('carries the credits panel', () => {
    expect(markup()).toContain('Credits and licences')
  })

  /*
   * The settings live in a portal into the shell's right rail, which only
   * exists after the shell's first paint. This render is that first paint,
   * so the panel is legitimately absent — what matters is that the screen
   * renders anyway instead of throwing on a null portal target.
   */
  it('renders before the rail it portals into exists', () => {
    expect(() => markup()).not.toThrow()
    expect(markup()).not.toContain('aria-label="Game settings"')
  })
})
