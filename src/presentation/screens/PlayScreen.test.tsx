import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LiveGame } from '@application/LiveGame'
import type { GameConfiguration } from '@application/GameConfiguration'
import { suddenDeath } from '@domain/clock/TimeControl'
import { ServicesProvider } from '../ServicesContext'
import { PlayScreen, adviceFor, statusForGame, type Advice } from './PlayScreen'

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
  it('PlayScreen_GameInProgress_DrawsItsBoard', () => {
    expect(render().match(/data-square=/g)).toHaveLength(64)
  })

  describe('who is playing', () => {
    it('PlayScreen_ComputerGame_SeatsYouAtYourChosenColour', () => {
      expect(render({}, { playerColor: 'white' })).toContain('You vs Computer · Club')
      expect(render({}, { playerColor: 'black' })).toContain('Computer · Club vs You')
    })

    // Two people sharing a device are both "you", so neither seat is named
    // for a person — the colours are the only distinction that means anything.
    it('PlayScreen_PassAndPlay_NamesTheColours', () => {
      const markup = render({}, { opponent: 'human' })
      expect(markup).toContain('White vs Black')
      expect(markup).toContain('Two-player game')
    })

    it('PlayScreen_EngineVsEngine_NamesBothEngines', () => {
      const markup = render({}, { opponent: 'engines' })
      expect(markup).toContain('Stockfish (White) vs Stockfish (Black)')
      expect(markup).toContain('Stockfish match')
    })
  })

  describe('whose turn it is', () => {
    it('PlayScreen_TurnIndicator_NamesTheSideToMove', () => {
      expect(render({ awaiting: { kind: 'human', name: 'You' } })).toContain('You to move')
    })

    it('PlayScreen_BeforeEitherSideIsAsked_SaysTheGameIsStarting', () => {
      expect(render({ awaiting: null })).toContain('Starting…')
    })

    // Check is the one state that changes what a player must do next, so it
    // gets a tone of its own rather than reading as ordinary play.
    it('PlayScreen_Check_IsFlaggedDistinctlyFromOrdinaryPlay', () => {
      expect(render({ isCheck: true })).toContain('data-tone="warning"')
      expect(render({ isCheck: false })).toContain('data-tone="live"')
    })

    it('PlayScreen_GameOver_StopsAnnouncingTurns', () => {
      const markup = render({
        outcome: { status: 'decisive', winner: 'white', reason: 'checkmate' },
      })
      expect(markup).toContain('Game complete')
      expect(markup).toContain('data-tone="complete"')
      expect(markup).toContain('White won by checkmate')
    })
  })

  describe('the move number', () => {
    it('PlayScreen_MoveCounter_StartsAtOneBeforeAnythingIsPlayed', () => {
      expect(render({ history: [] })).toContain('Move 1')
    })

    // Two plies to a move: White's third move begins at ply four.
    it('PlayScreen_MoveCounter_CountsPairsOfPliesNotPlies', () => {
      const history = ['e4', 'e5', 'Nf3', 'Nc6'].map((san) => ({ san }))
      expect(render({ history })).toContain('Move 3')
    })
  })

  it('PlayScreen_MoveList_ListsTheMovesPlayedSoFar', () => {
    const history = ['e4', 'c5'].map((san) => ({ san }))
    const markup = render({ history })
    expect(markup).toContain('e4')
    expect(markup).toContain('c5')
    expect(markup).toContain('2 ply')
  })

  describe('what you can do', () => {
    it('PlayScreen_PrimaryPlayControls_StayOutsideTheCompactMenu', () => {
      const markup = render()
      expect(markup).toContain('phase46-mobile-game-head')
      expect(markup).toContain('Flip board')
      expect(markup).toContain('Hint')
      expect(markup).toContain('Undo move')
      expect(markup).toContain('Game &amp; moves')
    })

    it('PlayScreen_NothingToTakeBack_OffersNoUndo', () => {
      expect(buttonFor(render({ canUndo: false }), 'Undo')).toContain('disabled')
      expect(buttonFor(render({ canUndo: true }), 'Undo')).not.toContain('disabled')
    })

    // Saving an empty game would write a record of nothing.
    it('PlayScreen_NoMovePlayedYet_OffersNoSave', () => {
      expect(buttonFor(render({ history: [] }), 'Save game')).toContain('disabled')
      const played = render({ history: [{ san: 'e4' }] })
      expect(buttonFor(played, 'Save game')).not.toContain('disabled')
    })
  })
})

/*
 * A hint, and whether it is about the position on the board.
 *
 * These replace an `isAdvising` boolean beside a nullable hint, where the
 * position a hint belonged to was not recorded at all — so a hint had to be
 * cleared by an effect watching the FEN, which committed one frame first with
 * the old arrow drawn over the new position. The same gap had no way to say
 * that an answer had arrived too late to use, so the Hint button simply went
 * quiet and produced nothing.
 *
 * All of it is decided here, in a function, because the unit suite renders a
 * single static commit and cannot drive a worker search.
 */
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('adviceFor', () => {
  const ready: Advice = {
    kind: 'ready',
    fen: START,
    from: 'g1' as never,
    to: 'f3' as never,
    san: 'Nf3',
  }

  it('hintAdvice_AnswerAboutThePositionOnTheBoard_IsOffered', () => {
    expect(adviceFor(ready, START)).toBe(ready)
  })

  /*
   * The arrow must not survive the move that answered it.
   *
   * This is the one that was visible: the board drew the previous position's
   * suggestion over the new position for a frame, because clearing it was an
   * effect and effects run after the commit.
   */
  it('hintAdvice_AnswerAboutAPositionAlreadyPlayedOutOf_IsNotAdviceAtAll', () => {
    expect(adviceFor(ready, AFTER_E4)).toEqual({ kind: 'none' })
  })

  // Otherwise the Hint button stays disabled for the rest of the game: the
  // search it is waiting on is about a position nobody is looking at.
  it('hintAdvice_SearchLeftBehindByAMove_StopsCountingAsThinking', () => {
    const thinking: Advice = { kind: 'thinking', fen: START }

    expect(adviceFor(thinking, START)).toBe(thinking)
    expect(adviceFor(thinking, AFTER_E4)).toEqual({ kind: 'none' })
  })

  it('hintAdvice_NoHintAsked_StaysThatWay', () => {
    expect(adviceFor({ kind: 'none' }, START)).toEqual({ kind: 'none' })
  })
})

describe('statusForGame', () => {
  const status = (advice: Advice, over: Record<string, unknown> = {}) =>
    statusForGame({
      gameOver: false,
      engineFailure: null,
      advice,
      isCheck: false,
      awaitingKind: 'human',
      awaitingName: 'You',
      ...over,
    })

  /*
   * Above check, and above whose turn it is: both of those describe a game that
   * can continue. A dead worker left the board claiming the computer was still
   * thinking for as long as the page stayed open — no error, nothing to retry.
   */
  it('playStatus_EngineGone_SaysSoRatherThanThatItIsThinking', () => {
    const shown = status(
      { kind: 'none' },
      { engineFailure: 'The engine stopped responding: out of memory', awaitingKind: 'engine' },
    )

    expect(shown.label).toContain('stopped responding')
    expect(shown.tone).toBe('warning')
  })

  // The engine being gone outranks a check nobody can answer.
  it('playStatus_EngineGoneWhileInCheck_StillLeadsWithTheEngine', () => {
    expect(status({ kind: 'none' }, { engineFailure: 'gone', isCheck: true }).label).toContain(
      'stopped responding',
    )
  })

  it('playStatus_SearchRunning_SaysTheEngineIsWorking', () => {
    expect(status({ kind: 'thinking', fen: START }).label).toContain('finding a useful idea')
  })

  it('playStatus_HintReady_NamesTheMove', () => {
    expect(
      status({ kind: 'ready', fen: START, from: 'g1' as never, to: 'f3' as never, san: 'Nf3' })
        .label,
    ).toBe('Suggested move: Nf3')
  })

  /*
   * The case that previously had no words.
   *
   * Asking for a hint and then moving dropped the answer silently: the button
   * stopped saying "Thinking…", no arrow appeared, and nothing accounted for
   * it. A request that cannot be answered has to say so.
   */
  it('playStatus_AnswerArrivedTooLate_SaysSoRatherThanNothing', () => {
    const label = status({ kind: 'stale', fen: START }).label
    expect(label).toContain('position changed')
    expect(label).toContain('Ask again')
  })

  it('playStatus_HintUnavailable_SaysSo', () => {
    expect(status({ kind: 'failed', fen: START }).label).toContain('unavailable')
  })

  // The game being over, and being in check, both outrank advice about it.
  it('playStatus_GameOverOrInCheck_OutranksAnyHint', () => {
    const advice: Advice = { kind: 'thinking', fen: START }
    expect(status(advice, { gameOver: true }).label).toContain('complete')
    expect(status(advice, { isCheck: true }).label).toContain('Check')
  })
})
