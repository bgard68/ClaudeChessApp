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
  it('ReplayScreen_Title_NamesBothPlayersAndHowItEnded', () => {
    const markup = render()
    expect(markup).toContain('Fischer vs Spassky')
    expect(markup).toContain('World Championship')
    expect(markup).toContain('Round 6')
    expect(markup).toContain('1972')
    expect(markup).toContain('White won by resignation')
  })

  // PGN uses "-" and "?" where a round was not recorded. Printing "Round -"
  // under an event name reads as data when it is the absence of data.
  it.each(['-', '?', ''])('ReplayScreen_UnrecordedRound_%s_IsOmitted', (round) => {
    expect(render()).toContain('Round')
    expect(render({ game: game({ round }) })).not.toContain('Round ')
  })

  describe('where in the game you are', () => {
    it('ReplayScreen_PlyZero_SaysStartingPosition', () => {
      expect(render({ ply: 0 })).toContain('Starting position')
    })

    // Ply counts half-moves; the move number people read is the pair.
    it('ReplayScreen_PlayBegun_CountsInMoves', () => {
      expect(render({ ply: 3 })).toContain('Move 2')
    })

    it('ReplayScreen_Progress_IsReportedAsAPercentageOfTheGame', () => {
      expect(render({ ply: 3, totalPlies: 4 })).toContain('75% complete')
    })

    it('ReplayScreen_GameWithNoMoves_SurvivesWithoutDividingByZero', () => {
      const markup = render({ ply: 0, totalPlies: 0 })
      expect(markup).toContain('0% complete')
      expect(markup).not.toContain('NaN')
    })
  })

  describe('the transport', () => {
    it('ReplayScreen_Transport_OffersPlayWhilePausedAndPauseWhilePlaying', () => {
      expect(render({ isPlaying: false })).toContain('aria-label="Play replay"')
      expect(render({ isPlaying: true })).toContain('aria-label="Pause replay"')
    })

    it.each(['First position', 'Previous move', 'Next move', 'Final position'])(
      'ReplayScreen_%sControl_HasALabelAScreenReaderCanAnnounce',
      (label) => {
        const markup = render()

        expect(markup).toContain(`aria-label="${label}"`)
      },
    )

    it('ReplayScreen_Scrubber_CoversTheWholeGameAndNoFurther', () => {
      const markup = render({ ply: 2, totalPlies: 3 })
      expect(markup).toContain('max="3"')
      expect(markup).toContain('value="2"')
    })

    it('ReplayScreen_SpeedButtons_MarkExactlyOneAsChosen', () => {
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
    it('ReplayScreen_RecordedClock_IsLabelledRecorded', () => {
      const markup = render({}, 'recorded')
      expect(markup).toContain('Recorded')
      expect(markup).toContain('as recorded in the source PGN')
      expect(markup).not.toContain('Simulated clock')
    })

    it('ReplayScreen_SimulatedClock_AdmitsItIsInventedAndFromWhat', () => {
      const markup = render({}, 'simulated')
      expect(markup).toContain('Estimated')
      expect(markup).toContain('Simulated clock')
      expect(markup).toContain('never recorded with move times')
      expect(markup).toContain('a standard control')
    })
  })

  it('ReplayScreen_MoveList_MarksWhereTheBoardStands', () => {
    const markup = render({ ply: 2 })
    expect(markup).toContain('Nf3')
    expect(markup).toContain('3 ply')
    expect(markup.match(/move-list__cell--current/g)).toHaveLength(1)
  })

  it('ReplayScreen_Board_DrawsThePositionTheSessionShows', () => {
    // A board with no squares is the failure this screen used to have.
    expect(render().match(/data-square=/g)).toHaveLength(64)
  })
})
