import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Position } from '@domain/chess/Position'
import { SearchAbandoned, StockfishEngine, parseLongAlgebraic } from './StockfishEngine'

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
  terminated = false

  constructor() {
    FakeWorker.latest = this
  }

  postMessage(command: string): void {
    this.sent.push(command)
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

    const move = engine.chooseMove(position(START))
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

    const abandoned = engine.chooseMove(position(START))
    abandoned.catch(() => {}) // Rejected below; asserted separately.
    await tick()

    // Undo, in effect: the turn loop gives up on that search and starts another.
    const wanted = engine.chooseMove(position(AFTER_E4))
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

    const abandoned = engine.chooseMove(position(START))
    // Attached before the tick, not after: the rejection happens the moment the
    // second search supersedes this one, and a rejection with no handler yet
    // registered is reported as unhandled even though the assertion below
    // catches it. Suite noise that could mask a real one.
    const settled = expect(abandoned).rejects.toBeInstanceOf(SearchAbandoned)
    await tick()

    const wanted = engine.chooseMove(position(AFTER_E4))
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

    const first = engine.chooseMove(position(START))
    await tick()
    worker.say('bestmove e2e4')
    await expect(first).resolves.toMatchObject({ from: 'e2', to: 'e4' })

    engine.stop() // Nothing in flight: must be a no-op.

    const second = engine.chooseMove(position(AFTER_E4))
    await tick()
    worker.say('bestmove e7e5')
    await expect(second).resolves.toMatchObject({ from: 'e7', to: 'e5' })
  })

  it('stockfishEngine_RatedStrength_SendsBothLimitAndElo', async () => {
    const { engine, worker } = await engineAndWorker()

    await engine.configure({
      strength: { kind: 'rated', elo: 1320.4 },
      searchLimits: { moveTimeMs: 150, maxDepth: 2 },
    })

    expect(worker.sent).toContain('setoption name UCI_LimitStrength value true')
    expect(worker.sent).toContain('setoption name UCI_Elo value 1320')
  })

  // Full strength after a rated game means the limit must be turned off, not
  // merely left unset — the engine keeps whatever it was told last.
  it('stockfishEngine_FullStrength_TurnsTheLimitOffExplicitly', async () => {
    const { engine, worker } = await engineAndWorker()

    await engine.configure({ strength: { kind: 'full' }, searchLimits: { moveTimeMs: 1_000 } })

    expect(worker.sent).toContain('setoption name UCI_LimitStrength value false')
  })

  it('stockfishEngine_SearchLimits_ReachTheGoCommand', async () => {
    const { engine, worker } = await engineAndWorker()
    await engine.configure({
      strength: { kind: 'full' },
      searchLimits: { moveTimeMs: 900, maxDepth: 12 },
    })

    void engine.chooseMove(position(START)).catch(() => {})
    await tick()

    expect(worker.searches()[0]).toBe('go movetime 900 depth 12')
  })

  it('stockfishEngine_NoLegalMove_RejectsRatherThanResolvingNothing', async () => {
    const { engine, worker } = await engineAndWorker()

    const move = engine.chooseMove(position(START))
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
   * A newline would not corrupt one UCI command — it would append a second. The
   * guard closes the class of fault rather than the instance, which matters
   * because the archive's sort column was also "typed, therefore safe" until it
   * was not.
   */
  it('stockfishEngine_PositionCarryingANewline_IsRefused', async () => {
    const { engine } = await engineAndWorker()

    await expect(
      engine.chooseMove(position(`${START}\nquit`)),
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
