import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LiveGame } from '@application/LiveGame'
import type { GameConfiguration } from '@application/GameConfiguration'
import { suddenDeath } from '@domain/clock/TimeControl'
import { ServicesProvider } from '../ServicesContext'
import { PlayScreen } from './PlayScreen'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A real control rather than a hand-built one: the screen describes it, and
 *  an invented shape would only prove the fake matched itself. */
const RAPID = suddenDeath(10)

/*
 * The screen never calls into services while rendering — they are reached
 * only by saving and by asking for a hint, both of which need a click. So an
 * empty stand-in is enough to satisfy the context, and no database is opened.
 */
const services = {
  services: { archive: { durability: () => new Promise(() => {}) } },
  factory: {},
} as never

const configuration = (over: Partial<GameConfiguration> = {}): GameConfiguration =>
  ({
    opponent: 'computer',
    playerColor: 'white',
    difficulty: { label: 'Club' },
    timeControl: RAPID,
    ...over,
  }) as unknown as GameConfiguration

const game = (over: Record<string, unknown> = {}): LiveGame =>
  ({
    subscribe: () => () => {},
    submitMove: vi.fn(),
    undo: vi.fn(),
    resign: vi.fn(),
    agreeDraw: vi.fn(),
    state: {
      position: { fen: START, sideToMove: 'white' },
      legalMoves: [],
      history: [],
      outcome: { status: 'in_progress' },
      awaiting: { kind: 'human', name: 'You' },
      isCheck: false,
      canUndo: false,
      timeControl: RAPID,
      clock: { whiteMs: 600_000, blackMs: 600_000, running: 'white' },
      ...over,
    },
  }) as unknown as LiveGame

/**
 * The opening tag of the button carrying `label`.
 *
 * Found by walking back to the nearest `<button`, because these buttons hold
 * an icon as well as their text — a fixed lookback lands in the middle of an
 * SVG and reports whatever it finds there.
 */
const buttonFor = (markup: string, label: string): string => {
  const at = markup.indexOf(label)
  if (at < 0) throw new Error(`no "${label}" in the rendered screen`)
  const open = markup.lastIndexOf('<button', at)
  return markup.slice(open, markup.indexOf('>', open) + 1)
}

const render = (
  state: Record<string, unknown> = {},
  config: Partial<GameConfiguration> = {},
) =>
  renderToStaticMarkup(
    <ServicesProvider value={services}>
      <PlayScreen
        game={game(state)}
        configuration={configuration(config)}
        onNewGame={vi.fn()}
      />
    </ServicesProvider>,
  )

describe('PlayScreen', () => {
  it('draws the board of the game in progress', () => {
    expect(render().match(/data-square=/g)).toHaveLength(64)
  })

  describe('who is playing', () => {
    it('seats you against the computer at your chosen colour', () => {
      expect(render({}, { playerColor: 'white' })).toContain('You vs Computer · Club')
      expect(render({}, { playerColor: 'black' })).toContain('Computer · Club vs You')
    })

    // Two people sharing a device are both "you", so neither seat is named
    // for a person — the colours are the only distinction that means anything.
    it('names the colours when two people share the device', () => {
      const markup = render({}, { opponent: 'human' })
      expect(markup).toContain('White vs Black')
      expect(markup).toContain('Two-player game')
    })

    it('names both engines when the computer plays itself', () => {
      const markup = render({}, { opponent: 'engines' })
      expect(markup).toContain('Stockfish (White) vs Stockfish (Black)')
      expect(markup).toContain('Stockfish match')
    })
  })

  describe('whose turn it is', () => {
    it('names the side to move', () => {
      expect(render({ awaiting: { kind: 'human', name: 'You' } })).toContain('You to move')
    })

    it('says the game is starting before either side has been asked', () => {
      expect(render({ awaiting: null })).toContain('Starting…')
    })

    // Check is the one state that changes what a player must do next, so it
    // gets a tone of its own rather than reading as ordinary play.
    it('flags check distinctly from ordinary play', () => {
      expect(render({ isCheck: true })).toContain('data-tone="warning"')
      expect(render({ isCheck: false })).toContain('data-tone="live"')
    })

    it('stops announcing turns once the game is over', () => {
      const markup = render({
        outcome: { status: 'decisive', winner: 'white', reason: 'checkmate' },
      })
      expect(markup).toContain('Game complete')
      expect(markup).toContain('data-tone="complete"')
      expect(markup).toContain('White won by checkmate')
    })
  })

  describe('the move number', () => {
    it('starts at one before anything has been played', () => {
      expect(render({ history: [] })).toContain('Move 1')
    })

    // Two plies to a move: White's third move begins at ply four.
    it('counts pairs of plies, not plies', () => {
      const history = ['e4', 'e5', 'Nf3', 'Nc6'].map((san) => ({ san }))
      expect(render({ history })).toContain('Move 3')
    })
  })

  it('lists the moves played so far', () => {
    const history = ['e4', 'c5'].map((san) => ({ san }))
    const markup = render({ history })
    expect(markup).toContain('e4')
    expect(markup).toContain('c5')
    expect(markup).toContain('2 ply')
  })

  describe('what you can do', () => {
    it('keeps primary play controls outside the compact game menu', () => {
      const markup = render()
      expect(markup).toContain('phase46-mobile-game-head')
      expect(markup).toContain('Flip board')
      expect(markup).toContain('Hint')
      expect(markup).toContain('Undo move')
      expect(markup).toContain('Game &amp; moves')
    })

    it('offers no undo until there is something to take back', () => {
      expect(buttonFor(render({ canUndo: false }), 'Undo')).toContain('disabled')
      expect(buttonFor(render({ canUndo: true }), 'Undo')).not.toContain('disabled')
    })

    // Saving an empty game would write a record of nothing.
    it('offers no save until a move has been played', () => {
      expect(buttonFor(render({ history: [] }), 'Save game')).toContain('disabled')
      const played = render({ history: [{ san: 'e4' }] })
      expect(buttonFor(played, 'Save game')).not.toContain('disabled')
    })
  })
})
