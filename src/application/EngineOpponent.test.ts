import { describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ClockSnapshot } from '@domain/clock/Clock'
import { EngineOpponent } from './EngineOpponent'
import type { MoveRequest } from './Opponent'
import type {
  ChessEngine,
  EngineConfiguration,
  EngineSearchRequest,
} from './ports/ChessEngine'

/*
 * The adapter is deliberately thin, so there is little to get wrong — and
 * exactly one thing that is easy to: configuring the engine lazily, once. Get
 * that wrong and the computer plays its first move at whatever strength the
 * engine happened to start at, which nobody notices until a beginner loses to
 * a full-strength opening move.
 */

class RecordingEngine implements ChessEngine {
  readonly configurations: EngineConfiguration[] = []
  readonly askedFens: string[] = []
  readonly requests: EngineSearchRequest[] = []
  /** Everything called on the engine, in order — `newGame` must precede the
   *  options, and both must precede the first search. */
  readonly calls: string[] = []
  initCalls = 0
  stopCalls = 0
  disposeCalls = 0

  constructor(private readonly moves: readonly MoveIntent[] = [{ from: 'e2', to: 'e4' }]) {}

  init(): Promise<void> {
    this.initCalls += 1
    return Promise.resolve()
  }

  newGame(): Promise<void> {
    this.calls.push('newGame')
    return Promise.resolve()
  }

  configure(configuration: EngineConfiguration): Promise<void> {
    this.calls.push('configure')
    this.configurations.push(configuration)
    return Promise.resolve()
  }

  chooseMove(request: EngineSearchRequest): Promise<MoveIntent> {
    this.calls.push('chooseMove')
    this.requests.push(request)
    this.askedFens.push(request.position.fen)
    const move = this.moves[this.askedFens.length - 1] ?? this.moves[0]!
    return Promise.resolve(move)
  }

  stop(): void {
    this.stopCalls += 1
  }

  dispose(): void {
    this.disposeCalls += 1
  }
}

/** An engine whose configure step never settles, so ordering is observable. */
class SlowToConfigureEngine extends RecordingEngine {
  private release: (() => void) | null = null

  configure(configuration: EngineConfiguration): Promise<void> {
    this.configurations.push(configuration)
    return new Promise<void>((resolve) => {
      this.release = resolve
    })
  }

  finishConfiguring(): void {
    this.release?.()
    this.release = null
  }
}

const CASUAL: EngineConfiguration = {
  strength: { kind: 'rated', elo: 1600 },
  searchLimits: { untimedMoveTimeMs: 500 },
}

const UNTIMED: ClockSnapshot = {
  whiteMs: null,
  blackMs: null,
  whiteIncrementMs: null,
  blackIncrementMs: null,
  running: null,
  flagged: null,
}

const requestAt = (fen: string, clock: ClockSnapshot = UNTIMED): MoveRequest => ({
  position: { fen } as Position,
  legalMoves: [],
  clock,
  history: { startPosition: { fen: 'start-fen' } as Position, moves: [{ from: 'e2', to: 'e4' }] },
})

describe('EngineOpponent.requestMove', () => {
  it('requestMove_FirstCall_ConfiguresTheEngineBeforeAskingForAMove', async () => {
    const engine = new SlowToConfigureEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    void opponent.requestMove(requestAt('first-fen'))
    await Promise.resolve()

    expect(engine.configurations).toEqual([CASUAL])
    expect(engine.askedFens).toEqual([])
  })

  it('requestMove_FirstCall_ReturnsTheMoveTheEngineChose', async () => {
    const engine = new RecordingEngine([{ from: 'd2', to: 'd4' }])
    const opponent = new EngineOpponent(engine, CASUAL)

    const move = await opponent.requestMove(requestAt('first-fen'))

    expect(move).toEqual({ from: 'd2', to: 'd4' })
    expect(engine.askedFens).toEqual(['first-fen'])
  })

  it('requestMove_ThreeCalls_ConfiguresOnceAndSearchesEveryTime', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(requestAt('fen-1'))
    await opponent.requestMove(requestAt('fen-2'))
    await opponent.requestMove(requestAt('fen-3'))

    expect(engine.configurations).toEqual([CASUAL])
    expect(engine.askedFens).toEqual(['fen-1', 'fen-2', 'fen-3'])
  })

  it('requestMove_AnyCall_PassesThePositionItWasGivenRatherThanACachedOne', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(requestAt('position-a'))
    await opponent.requestMove(requestAt('position-b'))

    expect(engine.askedFens).toEqual(['position-a', 'position-b'])
  })

  /*
   * `ucinewgame` first, then the options, then the search.
   *
   * Order is the whole content of this test: an engine told to start a new game
   * *after* being configured keeps the previous game's tables and loses the
   * options it was just given to the reset.
   */
  it('requestMove_FirstCall_StartsANewGameBeforeConfiguringAndSearching', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(requestAt('first-fen'))

    expect(engine.calls).toEqual(['newGame', 'configure', 'chooseMove'])
  })

  it('requestMove_AnyCall_ForwardsTheHistorySoTheEngineCanSeeRepetitions', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(requestAt('any-fen'))

    expect(engine.requests[0]?.history).toEqual({
      startPosition: { fen: 'start-fen' },
      moves: [{ from: 'e2', to: 'e4' }],
    })
  })

  /*
   * A fixed thinking time ignores the clock it is playing against, which is how
   * the engine came to forfeit one-minute games on time at the stronger levels
   * however well it was playing. The budget is what lets it manage itself.
   */
  it('requestMove_TimedGame_HandsTheEngineBothClocksAndTheIncrement', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(
      requestAt('any-fen', {
        whiteMs: 41_000,
        blackMs: 38_500,
        whiteIncrementMs: 1_000,
        blackIncrementMs: 1_000,
        running: 'white',
        flagged: null,
      }),
    )

    expect(engine.requests[0]?.timeBudget).toEqual({
      whiteMs: 41_000,
      blackMs: 38_500,
      whiteIncrementMs: 1_000,
      blackIncrementMs: 1_000,
    })
  })

  // No clock, no budget to divide: the configured thinking time is the limit.
  it('requestMove_UntimedGame_SendsNoTimeBudgetAtAll', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(requestAt('any-fen'))

    expect(engine.requests[0]?.timeBudget).toBeUndefined()
  })

  /*
   * A side already at zero has nothing to budget. Told it has no time, the
   * engine answers with a move chosen at no depth — a worse way to lose the
   * game than playing on at the configured time and flagging anyway.
   */
  it('requestMove_ASideHasFlagged_FallsBackToTheConfiguredThinkingTime', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    await opponent.requestMove(
      requestAt('any-fen', {
        whiteMs: 0,
        blackMs: 12_000,
        whiteIncrementMs: 0,
        blackIncrementMs: 0,
        running: 'white',
        flagged: 'white',
      }),
    )

    expect(engine.requests[0]?.timeBudget).toBeUndefined()
  })

  // Construction must stay inert: the factory builds both seats up front, and
  // an engine configured then would be configured for a game not yet started.
  it('constructor_BeforeAnyRequest_TouchesTheEngineNotAtAll', () => {
    const engine = new RecordingEngine()

    const opponent = new EngineOpponent(engine, CASUAL)

    expect(opponent.kind).toBe('engine')
    expect(engine.configurations).toEqual([])
    expect(engine.askedFens).toEqual([])
    expect(engine.calls).toEqual([])
    expect(engine.initCalls).toBe(0)
  })
})

describe('EngineOpponent lifecycle', () => {
  it('cancel_MidSearch_StopsTheEngineWithoutDisposingIt', () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    opponent.cancel()

    expect(engine.stopCalls).toBe(1)
    expect(engine.disposeCalls).toBe(0)
  })

  it('dispose_AtTheEndOfAGame_TearsTheEngineDownWithoutStoppingItFirst', () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)

    opponent.dispose()

    expect(engine.disposeCalls).toBe(1)
    expect(engine.stopCalls).toBe(0)
  })

  /*
   * A cancelled first request leaves the engine configured, and the seat is
   * reused for the rest of the game — so the next request must search without
   * paying to configure again.
   */
  it('requestMove_AfterACancelledFirstRequest_DoesNotReconfigure', async () => {
    const engine = new RecordingEngine()
    const opponent = new EngineOpponent(engine, CASUAL)
    await opponent.requestMove(requestAt('fen-1'))

    opponent.cancel()
    await opponent.requestMove(requestAt('fen-2'))

    expect(engine.configurations).toEqual([CASUAL])
  })

  it('constructor_NoNameGiven_NamesTheSeatComputer', () => {
    const opponent = new EngineOpponent(new RecordingEngine(), CASUAL)

    expect(opponent.name).toBe('Computer')
  })

  it('constructor_NameGiven_UsesItForTheSeat', () => {
    const opponent = new EngineOpponent(new RecordingEngine(), CASUAL, 'Stockfish (White)')

    expect(opponent.name).toBe('Stockfish (White)')
  })
})
