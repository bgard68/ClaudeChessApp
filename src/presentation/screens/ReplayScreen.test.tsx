import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ReplaySession, ReplayState } from '@application/replay/ReplaySession'
import type { ArchivedGame } from '@domain/archive/ArchivedGame'
import { ReplayScreen } from './ReplayScreen'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/*
 * The screen reads a handful of fields off a session that is otherwise a large
 * class with a ticker and a clock model inside it. Casting a literal is the
 * cheaper fake: building a real session here would test the session, which has
 * its own tests, instead of the screen.
 */
const game = (over: Partial<ArchivedGame> = {}): ArchivedGame =>
  ({
    white: 'Fischer',
    black: 'Spassky',
    event: 'World Championship',
    round: '6',
    date: '1972.07.23',
    outcome: { status: 'decisive', winner: 'white', reason: 'resignation' },
    moves: [
      { san: 'c4', color: 'white' },
      { san: 'e6', color: 'black' },
      { san: 'Nf3', color: 'white' },
    ],
    ...over,
  }) as unknown as ArchivedGame

const session = (
  state: Partial<ReplayState> = {},
  source: 'recorded' | 'simulated' = 'recorded',
): ReplaySession =>
  ({
    subscribe: () => () => {},
    clockModelInfo: { source, assumedControl: null },
    first: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    last: vi.fn(),
    goTo: vi.fn(),
    togglePlay: vi.fn(),
    setSpeed: vi.fn(),
    state: {
      game: game(),
      ply: 0,
      totalPlies: 3,
      position: { fen: START },
      lastMove: null,
      clock: { whiteMs: 3_600_000, blackMs: 3_600_000, source },
      clockSource: source,
      isPlaying: false,
      speed: 1,
      ...state,
    },
  }) as unknown as ReplaySession

const render = (...args: Parameters<typeof session>) =>
  renderToStaticMarkup(<ReplayScreen session={session(...args)} />)

describe('ReplayScreen', () => {
  it('titles the game with both players and how it ended', () => {
    const markup = render()
    expect(markup).toContain('Fischer vs Spassky')
    expect(markup).toContain('World Championship')
    expect(markup).toContain('Round 6')
    expect(markup).toContain('1972')
    expect(markup).toContain('White won by resignation')
  })

  // PGN uses "-" and "?" where a round was not recorded. Printing "Round -"
  // under an event name reads as data when it is the absence of data.
  it.each(['-', '?', ''])('omits an unrecorded round (%s)', (round) => {
    expect(render()).toContain('Round')
    expect(render({ game: game({ round }) })).not.toContain('Round ')
  })

  describe('where in the game you are', () => {
    it('says starting position before the first move', () => {
      expect(render({ ply: 0 })).toContain('Starting position')
    })

    // Ply counts half-moves; the move number people read is the pair.
    it('counts in moves once play has begun', () => {
      expect(render({ ply: 3 })).toContain('Move 2')
    })

    it('reports progress as a percentage of the whole game', () => {
      expect(render({ ply: 3, totalPlies: 4 })).toContain('75% complete')
    })

    it('survives a game with no moves rather than dividing by zero', () => {
      const markup = render({ ply: 0, totalPlies: 0 })
      expect(markup).toContain('0% complete')
      expect(markup).not.toContain('NaN')
    })
  })

  describe('the transport', () => {
    it('offers play while paused and pause while playing', () => {
      expect(render({ isPlaying: false })).toContain('aria-label="Play replay"')
      expect(render({ isPlaying: true })).toContain('aria-label="Pause replay"')
    })

    it('gives every step control a label a screen reader can announce', () => {
      const markup = render()
      for (const label of [
        'First position',
        'Previous move',
        'Next move',
        'Final position',
      ]) {
        expect(markup).toContain(`aria-label="${label}"`)
      }
    })

    it('scrubs across the whole game and no further', () => {
      const markup = render({ ply: 2, totalPlies: 3 })
      expect(markup).toContain('max="3"')
      expect(markup).toContain('value="2"')
    })

    it('marks exactly one speed as chosen', () => {
      const markup = render({ speed: 2 })
      expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
      const chosen = markup.slice(0, markup.indexOf('aria-pressed="true"'))
      // 0.5× and 1× come before 2× in the list, so both precede the chosen one.
      expect(chosen).toContain('0.5')
      expect(chosen).toContain('1')
    })
  })

  /*
   * Almost no historical game was recorded with move times, so the clock
   * beside one is usually a simulation. Saying which is not decoration: a
   * plausible-looking reading presented without comment is indistinguishable
   * from a record that does not exist.
   */
  describe('saying where the clock came from', () => {
    it('labels a recorded clock as recorded', () => {
      const markup = render({}, 'recorded')
      expect(markup).toContain('Recorded')
      expect(markup).toContain('as recorded in the source PGN')
      expect(markup).not.toContain('Simulated clock')
    })

    it('admits a simulated clock is invented, and from what', () => {
      const markup = render({}, 'simulated')
      expect(markup).toContain('Estimated')
      expect(markup).toContain('Simulated clock')
      expect(markup).toContain('never recorded with move times')
      expect(markup).toContain('a standard control')
    })
  })

  it('lists the moves and marks where the board stands', () => {
    const markup = render({ ply: 2 })
    expect(markup).toContain('Nf3')
    expect(markup).toContain('3 ply')
    expect(markup.match(/move-list__cell--current/g)).toHaveLength(1)
  })

  it('draws the position the session is showing', () => {
    // A board with no squares is the failure this screen used to have.
    expect(render().match(/data-square=/g)).toHaveLength(64)
  })
})
