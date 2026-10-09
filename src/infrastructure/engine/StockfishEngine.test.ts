import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Position } from '@domain/chess/Position'
import type { EngineSearchRequest } from '@application/ports/ChessEngine'
import {
  EngineUnavailable,
  SearchAbandoned,
  StockfishEngine,
  parseLongAlgebraic,
  toLongAlgebraic,
} from './StockfishEngine'

/*
 * UCI handling, without the engine.
 *
 * TESTING.md listed this class as uncovered on the grounds that it needs a real
 * browser and the engine binary. That is true of *Stockfish*, and not of the
 * protocol handling, which is the part with the ordering rules in it — and
 * ordering is where the bug was. A fake worker is enough, because what is under
 * test is which line resolves which promise.
 */

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

const position = (fen: string) => ({ fen }) as Position

/** A search for one position: no history behind it, no clock in front of it. */
const search = (fen: string): EngineSearchRequest => ({ position: position(fen) })

/**
 * Lets queued microtasks run.
 *
 * `chooseMove` awaits `init()` before it sends anything, so the `go` command
 * does not exist yet on the line after the call. Saying a line before then tests
 * nothing — the engine has not asked a question.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Records what was sent, and lets the test decide what comes back and when. */
class FakeWorker {
  static latest: FakeWorker | null = null

  readonly sent: string[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.latest = this
  }

  postMessage(command: string): void {
    this.sent.push(command)
    // A real engine always answers `isready`, and the adapter now waits for it
    // before claiming to be configured. A fake that stayed silent would hang
    // every test rather than test anything.
    if (command === 'isready') queueMicrotask(() => this.say('readyok'))
  }

  /** The worker dies — a failed wasm allocation, a parse error, a crash. */
  fail(message = 'boom'): void {
    this.onerror?.({ message })
  }

  terminate(): void {
    this.terminated = true
  }

  /** One line from the engine. */
  say(line: string): void {
    this.onmessage?.({ data: line } as MessageEvent)
  }

  /** The `go` commands issued so far, in order. */
  searches(): string[] {
    return this.sent.filter((command) => command.startsWith('go '))
  }
}

const engineAndWorker = async () => {
  vi.stubGlobal('Worker', FakeWorker)
  const engine = new StockfishEngine('/engine/stockfish.js')
  const ready = engine.init()
  FakeWorker.latest!.say('uciok')
  await ready
  return { engine, worker: FakeWorker.latest! }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.latest = null
})

describe('StockfishEngine', () => {
  it('stockfishEngine_UciHandshake_ResolvesOnUciok', async () => {
    const { worker } = await engineAndWorker()
    expect(worker.sent[0]).toBe('uci')
  })

  it('stockfishEngine_BestMove_ResolvesTheSearchThatAskedForIt', async () => {
    const { engine, worker } = await engineAndWorker()

    const move = engine.chooseMove(search(START))
    await tick()
    worker.say('bestmove e2e4')

    await expect(move).resolves.toMatchObject({ from: 'e2', to: 'e4' })
  })

  /*
   * The bug, and the reason this file exists.
   *
   * `stop` does not cancel a UCI search — it hurries it. One `go` yields exactly
   * one `bestmove` whether or not anybody still wants it, so an abandoned search
   * has an answer in flight. Nothing distinguished it from the next search's
   * answer, so the next search adopted it: a move chosen for the position before
   * the undo, applied to the position after.
   *
   * The consequence was worse than a bad suggestion. `LiveGame` validates the
   * move, and treats an engine proposing an illegal one as a malfunction — it
   * forfeits the game on the engine's behalf. Taking a move back while the
   * computer was thinking could therefore lose the game outright.
   */
  it('stockfishEngine_AbandonedSearchAnswersLate_DoesNotResolveTheNextOne', async () => {
    const { engine, worker } = await engineAndWorker()

    const abandoned = engine.chooseMove(search(START))
    abandoned.catch(() => {}) // Rejected below; asserted separately.
    await tick()

    // Undo, in effect: the turn loop gives up on that search and starts another.
    const wanted = engine.chooseMove(search(AFTER_E4))
    await tick()
    expect(worker.searches()).toHaveLength(2)

    // The first search answers now, for a position nobody is looking at.
    worker.say('bestmove d2d4')

    let settled = false
    void wanted.then(
      () => (settled = true),
      () => (settled = true),
    )
    await Promise.resolve()
    expect(settled).toBe(false)

    // The real answer arrives, and is the one that is taken.
    worker.say('bestmove e7e5')
    await expect(wanted).resolves.toMatchObject({ from: 'e7', to: 'e5' })
  })

  it('stockfishEngine_SupersededSearch_RejectsAsAbandoned', async () => {
    const { engine, worker } = await engineAndWorker()

    const abandoned = engine.chooseMove(search(START))
    // Attached before the tick, not after: the rejection happens the moment the
    // second search supersedes this one, and a rejection with no handler yet
    // registered is reported as unhandled even though the assertion below
    // catches it. Suite noise that could mask a real one.
    const settled = expect(abandoned).rejects.toBeInstanceOf(SearchAbandoned)
    await tick()

    const wanted = engine.chooseMove(search(AFTER_E4))
    await tick()

    await settled

    worker.say('bestmove d2d4') // owed by the abandoned search
    worker.say('bestmove e7e5')
    await expect(wanted).resolves.toMatchObject({ from: 'e7', to: 'e5' })
  })

  /*
   * The counting must not over-count. A search that answered before anyone
   * stopped it owes nothing, so a later `stop` must not consume the *next*
   * answer — which would hang the search that was actually wanted.
   */
  it('stockfishEngine_StopAfterAnAnswerArrived_DoesNotSwallowTheNextOne', async () => {
    const { engine, worker } = await engineAndWorker()

    const first = engine.chooseMove(search(START))
    await tick()
    worker.say('bestmove e2e4')
    await expect(first).resolves.toMatchObject({ from: 'e2', to: 'e4' })

    engine.stop() // Nothing in flight: must be a no-op.

    const second = engine.chooseMove(search(AFTER_E4))
    await tick()
    worker.say('bestmove e7e5')
    await expect(second).resolves.toMatchObject({ from: 'e7', to: 'e5' })
  })

  it('stockfishEngine_RatedStrength_SendsBothLimitAndElo', async () => {
    const { engine, worker } = await engineAndWorker()

    await engine.configure({
      strength: { kind: 'rated', elo: 1320.4 },
      searchLimits: { untimedMoveTimeMs: 150, maxDepth: 2 },
    })

    expect(worker.sent).toContain('setoption name UCI_LimitStrength value true')
    expect(worker.sent).toContain('setoption name UCI_Elo value 1320')
  })

  // Full strength after a rated game means the limit must be turned off, not
  // merely left unset — the engine keeps whatever it was told last.
  it('stockfishEngine_FullStrength_TurnsTheLimitOffExplicitly', async () => {
    const { engine, worker } = await engineAndWorker()

    await engine.configure({ strength: { kind: 'full' }, searchLimits: { untimedMoveTimeMs: 1_000 } })

    expect(worker.sent).toContain('setoption name UCI_LimitStrength value false')
  })

  it('stockfishEngine_SearchLimits_ReachTheGoCommand', async () => {
    const { engine, worker } = await engineAndWorker()
    await engine.configure({
      strength: { kind: 'full' },
      searchLimits: { untimedMoveTimeMs: 900, maxDepth: 12 },
    })

    void engine.chooseMove(search(START)).catch(() => {})
    await tick()

    expect(worker.searches()[0]).toBe('go movetime 900 depth 12')
  })

  it('stockfishEngine_NoLegalMove_RejectsRatherThanResolvingNothing', async () => {
    const { engine, worker } = await engineAndWorker()

    const move = engine.chooseMove(search(START))
    await tick()
    worker.say('bestmove (none)')

    await expect(move).rejects.toThrow(/no move/i)
  })

  it('stockfishEngine_Disposed_TerminatesTheWorkerAndRefusesToRestart', async () => {
    const { engine, worker } = await engineAndWorker()

    engine.dispose()

    expect(worker.terminated).toBe(true)
    await expect(engine.init()).rejects.toThrow(/disposed/i)
  })

  /*
   * The boot sequence a GUI owes the engine: introduce, state the resources,
   * and wait to be told they have been read. `init` resolving on `uciok` alone
   * meant ready was asserted one round trip before it was true.
   */
  it('stockfishEngine_Boot_StatesItsResourcesAndWaitsToBeToldTheyAreRead', async () => {
    const { worker } = await engineAndWorker()

    expect(worker.sent).toEqual([
      'uci',
      'setoption name Threads value 1',
      'setoption name Hash value 16',
      'isready',
    ])
  })

  it('stockfishEngine_NewGame_ClearsTheLastGameAndSynchronises', async () => {
    const { engine, worker } = await engineAndWorker()

    await engine.newGame()

    expect(worker.sent.slice(-2)).toEqual(['ucinewgame', 'isready'])
  })

  /*
   * Difficulty is only set once the engine says it has read the options. A `go`
   * sent between the `setoption` and the `readyok` searches at whatever
   * strength was in force before — the setting silently skipping a move.
   */
  it('stockfishEngine_Configure_DoesNotResolveBeforeTheEngineAcknowledges', async () => {
    const { engine, worker } = await engineAndWorker()
    worker.sent.length = 0

    await engine.configure({ strength: { kind: 'full' }, searchLimits: { untimedMoveTimeMs: 900 } })

    expect(worker.sent).toEqual(['setoption name UCI_LimitStrength value false', 'isready'])
  })

  /*
   * A fixed `movetime` ignores the clock it is playing against: two seconds a
   * move forfeits a one-minute game around move thirty however good the moves
   * are. Handed the clock, the engine budgets for itself and does not flag.
   */
  it('stockfishEngine_TimedGame_SendsTheClockRatherThanAFixedMoveTime', async () => {
    const { engine, worker } = await engineAndWorker()
    await engine.configure({
      strength: { kind: 'full' },
      searchLimits: { untimedMoveTimeMs: 2_000 },
    })

    void engine
      .chooseMove({
        position: position(START),
        timeBudget: { whiteMs: 41_500.6, blackMs: 38_000, whiteIncrementMs: 1_000, blackIncrementMs: 1_000 },
      })
      .catch(() => {})
    await tick()

    expect(worker.searches()[0]).toBe('go wtime 41501 btime 38000 winc 1000 binc 1000')
  })

  // The depth cap is the difficulty's own, and holds whichever limit is in use.
  it('stockfishEngine_TimedGameAtACappedLevel_KeepsTheDepthCeiling', async () => {
    const { engine, worker } = await engineAndWorker()
    await engine.configure({
      strength: { kind: 'rated', elo: 1320 },
      searchLimits: { untimedMoveTimeMs: 300, maxDepth: 2 },
    })

    void engine
      .chooseMove({
        position: position(START),
        timeBudget: { whiteMs: 60_000, blackMs: 60_000, whiteIncrementMs: 0, blackIncrementMs: 0 },
      })
      .catch(() => {})
    await tick()

    expect(worker.searches()[0]).toBe('go wtime 60000 btime 60000 winc 0 binc 0 depth 2')
  })

  /*
   * A bare FEN carries no repetition history, so an engine given one cannot see
   * that it is about to repeat a position for the third time — it draws a game
   * it was winning, and the app scores that draw correctly because the rules
   * were handed the history the engine was not.
   */
  it('stockfishEngine_GameInProgress_SendsTheMovesSoTheEngineCanSeeRepetitions', async () => {
    const { engine, worker } = await engineAndWorker()

    void engine
      .chooseMove({
        position: position(AFTER_E4),
        history: {
          startPosition: position(START),
          moves: [
            { from: 'e2', to: 'e4' },
            { from: 'e7', to: 'e5' },
            { from: 'b7', to: 'b8', promotion: 'knight' },
          ],
        },
      })
      .catch(() => {})
    await tick()

    expect(worker.sent).toContain(`position fen ${START} moves e2e4 e7e5 b7b8n`)
  })

  /*
   * The defect this pair covers.
   *
   * `onerror` rejected the handshake and nothing else, which caught a worker
   * that never started and missed one that stopped: after `uciok` the handshake
   * is already settled, and rejecting a settled promise does nothing. The search
   * in flight stayed pending for the life of the page, so a crashed engine
   * presented as a board that was still thinking — with no error and nothing to
   * retry, which is the worst symptom available.
   */
  it('stockfishEngine_WorkerDiesMidSearch_RejectsTheSearchRatherThanHanging', async () => {
    const { engine, worker } = await engineAndWorker()

    const move = engine.chooseMove(search(START))
    const settled = expect(move).rejects.toBeInstanceOf(EngineUnavailable)
    await tick()

    worker.fail('out of memory')

    await settled
  })

  it('stockfishEngine_WorkerDied_FailsEverySearchAfterIt', async () => {
    const { engine, worker } = await engineAndWorker()
    worker.fail()

    await expect(engine.init()).rejects.toBeInstanceOf(EngineUnavailable)
    await expect(engine.chooseMove(search(START))).rejects.toThrow(/stopped responding/i)
    await expect(engine.newGame()).rejects.toThrow(/stopped responding/i)
  })

  /*
   * A newline would not corrupt one UCI command — it would append a second. The
   * guard closes the class of fault rather than the instance, which matters
   * because the archive's sort column was also "typed, therefore safe" until it
   * was not.
   */
  it('stockfishEngine_PositionCarryingANewline_IsRefused', async () => {
    const { engine } = await engineAndWorker()

    await expect(
      engine.chooseMove(search(`${START}\nquit`)),
    ).rejects.toThrow(/line break/i)
  })
})

describe('parseLongAlgebraic', () => {
  it('parseLongAlgebraic_PlainMove_ReadsBothSquares', () => {
    expect(parseLongAlgebraic('e2e4')).toMatchObject({ from: 'e2', to: 'e4' })
  })

  it('parseLongAlgebraic_Promotion_ReadsThePiece', () => {
    expect(parseLongAlgebraic('e7e8q')).toMatchObject({
      from: 'e7',
      to: 'e8',
      promotion: 'queen',
    })
  })

  // The move list sent with `position` is written by this function, so a
  // promotion it spelt wrongly would be a legal move the engine never made.
  it('toLongAlgebraic_RoundTrip_MatchesWhatTheParserReads', () => {
    expect(toLongAlgebraic({ from: 'e2', to: 'e4' })).toBe('e2e4')
    expect(toLongAlgebraic({ from: 'e7', to: 'e8', promotion: 'knight' })).toBe('e7e8n')
    expect(parseLongAlgebraic(toLongAlgebraic({ from: 'b7', to: 'b8', promotion: 'rook' })))
      .toMatchObject({ from: 'b7', to: 'b8', promotion: 'rook' })
  })

  // "(none)", "0000", and anything else the protocol might emit must not be
  // mistaken for a move — which is what the null is for.
  it('parseLongAlgebraic_NotAMove_IsNull', () => {
    expect(parseLongAlgebraic('(none)')).toBeNull()
    expect(parseLongAlgebraic('0000')).toBeNull()
    expect(parseLongAlgebraic('e2e9')).toBeNull()
    expect(parseLongAlgebraic('e2e4k')).toBeNull()
    expect(parseLongAlgebraic('')).toBeNull()
  })
})
