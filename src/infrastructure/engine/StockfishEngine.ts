import type { MoveIntent } from '@domain/chess/Move'
import { toSquare } from '@domain/chess/Square'
import {
  EngineUnavailable,
  SearchAbandoned,
  type ChessEngine,
  type EngineConfiguration,
  type EngineSearchLimits,
  type EngineSearchRequest,
} from '@application/ports/ChessEngine'
import { promotionPieceFromSymbol, SYMBOL_BY_PROMOTION_PIECE } from '../chess/pieceMapping'
import type { PieceSymbol } from 'chess.js'

export { EngineUnavailable, SearchAbandoned }

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const BEST_MOVE_PATTERN = /^bestmove\s+(\S+)/

/**
 * The engine's own resources, stated rather than inherited.
 *
 * `Threads 1` says out loud what this build already is — the `single` build,
 * which has no thread support, because the threaded ones need COOP/COEP headers
 * this app does not set. Setting it means a future swap to a threaded build
 * cannot quietly start spawning threads the page cannot support.
 *
 * `Hash 16` is Stockfish's own default, pinned deliberately rather than
 * inherited: `engines` mode runs two searches at once and the hint adviser can
 * make a third, so the figure that matters is three times this one, on whichever
 * device has the least memory to spare.
 */
const ENGINE_THREADS = 1
const ENGINE_HASH_MB = 16

/**
 * Speaks UCI to a Stockfish web worker.
 *
 * This class exists so that UCI — a line-oriented, stringly-typed, stateful
 * protocol — stops at the edge of the system. The application asks for a move
 * and gets a move; nothing above this file knows what `go movetime 500` means.
 *
 * The engine runs in a worker because search is CPU-bound: on the main thread
 * it would freeze the board for the duration of every move it thinks about.
 */
export class StockfishEngine implements ChessEngine {
  private worker: Worker | null = null
  private initialisation: Promise<void> | null = null
  private uciHandshake: Deferred<void> | null = null
  /**
   * `isready` round trips still awaiting their `readyok`, oldest first.
   *
   * A queue rather than a single slot because `readyok` carries no indication of
   * which `isready` it answers, so the only safe reading is first in, first out
   * — which is exactly what the protocol guarantees.
   */
  private pendingReady: Deferred<void>[] = []
  private search: Deferred<MoveIntent> | null = null
  /**
   * How many `bestmove` lines the engine still owes for searches nobody wants.
   *
   * UCI emits exactly one `bestmove` per `go`, and `stop` does not cancel that
   * — it hurries it. So an abandoned search still has an answer in flight, and
   * without counting them the next search adopts it: `handleLine` would find
   * whatever is in `this.search` and resolve it with a move chosen for the
   * previous position.
   *
   * That is reachable from the board. Undo while the computer is thinking and
   * the turn loop starts a fresh search; the abandoned one then answers first.
   * The move is either played against a position it was never computed for, or
   * rejected as illegal — and `LiveGame` treats an engine proposing an illegal
   * move as a malfunction and forfeits the game on its behalf. Losing the game
   * you were trying to take a move back in is a poor reward for using undo.
   */
  private owedBestMoves = 0
  private configuration: EngineConfiguration | null = null
  /**
   * Why the engine is gone, once it is.
   *
   * Terminal rather than retried, and the same reason is handed to every later
   * caller: an errored `Worker` cannot be restarted, only replaced, and this
   * object owns exactly one for its lifetime.
   */
  private failure: Error | null = null
  private disposed = false

  constructor(private readonly workerUrl: string) {}

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new EngineUnavailable('Engine disposed'))
    if (this.failure !== null) return Promise.reject(this.failure)
    this.initialisation ??= this.startWorker()
    return this.initialisation
  }

  async newGame(): Promise<void> {
    await this.ready()
    // Clears the hash and the repetition table. Without it a search is informed
    // by a position from a game that is over — a strength artefact in play, and
    // in the puzzle generator the reason the same seed is a different search.
    this.send('ucinewgame')
    await this.sync()
  }

  async configure(configuration: EngineConfiguration): Promise<void> {
    await this.ready()
    this.configuration = configuration

    // UCI_Elo is only consulted while UCI_LimitStrength is on, and the engine
    // keeps whatever was set last, so both are always sent — turning the limit
    // off explicitly is what makes `full` mean full after a rated game.
    const strength = configuration.strength
    if (strength.kind === 'rated') {
      this.send('setoption name UCI_LimitStrength value true')
      this.send(`setoption name UCI_Elo value ${Math.round(strength.elo)}`)
    } else {
      this.send('setoption name UCI_LimitStrength value false')
    }

    // An option is set once the engine says it has read it. A `go` sent in
    // between searches at the strength in force before this call, which is a
    // difficulty setting silently not applying to one move.
    await this.sync()
  }

  async chooseMove(request: EngineSearchRequest): Promise<MoveIntent> {
    await this.ready()

    const limits = this.configuration?.searchLimits ?? { untimedMoveTimeMs: 1_000 }
    const position = positionCommand(request)
    const go = goCommand(request, limits)

    // Built and checked before anything is sent or recorded, so a refused
    // command cannot leave a search registered that will never be made.
    assertSingleLine(position)
    assertSingleLine(go)

    // Only one search may be in flight; a new request supersedes the old.
    this.stop()

    const search = deferred<MoveIntent>()
    this.search = search

    this.send(position)
    this.send(go)

    return search.promise
  }

  stop(): void {
    const search = this.search
    if (search === null) return

    /*
     * Counted here and nowhere else, and the placement is the correctness
     * argument: reaching this line means a `go` is outstanding whose `bestmove`
     * has not been consumed, because a consumed one leaves `this.search` null
     * and returns above. So the count only ever rises when an answer really is
     * still owed, and can never strand the next search waiting for a line that
     * is not coming.
     */
    this.search = null
    this.owedBestMoves += 1
    this.send('stop')
    search.reject(new SearchAbandoned('Search abandoned'))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.abandonWaiters(new EngineUnavailable('Engine disposed'))
    this.worker?.terminate()
    this.worker = null
  }

  private async startWorker(): Promise<void> {
    const handshake = deferred<void>()
    this.uciHandshake = handshake

    try {
      // A classic worker, not a module worker: the Stockfish build is an
      // Emscripten bundle that locates its .wasm file relative to itself.
      const worker = new Worker(this.workerUrl)
      worker.onmessage = (event: MessageEvent) => this.handleLine(String(event.data))
      /*
       * A worker can die at any point, not only while starting.
       *
       * This used to reject the handshake and nothing else, which covered a
       * worker that never started and missed one that stopped — because after
       * `uciok` the handshake is already settled, and rejecting a settled
       * promise does nothing at all. The search in flight then stayed pending
       * for the life of the page. A `movetime` is only a promise to answer, and
       * a dead engine does not keep it: the turn loop waited forever and the
       * board said "thinking" until the page was reloaded.
       */
      worker.onerror = (event: ErrorEvent) =>
        this.fail(
          new EngineUnavailable(
            `The engine stopped responding: ${event.message || `could not start ${this.workerUrl}`}`,
          ),
        )
      worker.onmessageerror = () =>
        this.fail(new EngineUnavailable('The engine sent a message that could not be read'))
      this.worker = worker
      this.send('uci')
    } catch (error) {
      this.fail(
        new EngineUnavailable(
          `Could not start engine: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    }

    await handshake.promise

    // The rest of the GUI's side of the boot sequence: state the engine's
    // resources, then wait to be told they have been read. `init` resolving now
    // means ready, rather than merely "has introduced itself".
    this.send(`setoption name Threads value ${ENGINE_THREADS}`)
    this.send(`setoption name Hash value ${ENGINE_HASH_MB}`)
    await this.sync()
  }

  /**
   * `init`, plus the checks that only hold *after* awaiting it.
   *
   * Every caller queues behind the same initialisation, and the worker can die
   * while they wait. Re-checking here is what stops a call that started before
   * the failure from sending into a terminated worker and waiting for an answer.
   */
  private async ready(): Promise<void> {
    await this.init()
    if (this.disposed) throw new EngineUnavailable('Engine disposed')
    if (this.failure !== null) throw this.failure
  }

  /** One `isready`/`readyok` round trip — UCI's only barrier. */
  private sync(): Promise<void> {
    const ready = deferred<void>()
    this.pendingReady.push(ready)
    this.send('isready')
    return ready.promise
  }

  /**
   * Fails everything in flight, and everything after it.
   *
   * The same shape `SqliteClient` reached, for the same reason: a hang is the
   * worst available symptom, because it presents as work still in progress and
   * offers nothing to retry. Rejecting turns it into a message.
   */
  private fail(error: Error): void {
    this.failure ??= error
    const search = this.search
    this.search = null
    this.abandonWaiters(this.failure)
    search?.reject(this.failure)
  }

  /** Rejects the handshake and every pending `isready` with one reason. */
  private abandonWaiters(reason: Error): void {
    const handshake = this.uciHandshake
    const waiting = this.pendingReady
    this.uciHandshake = null
    this.pendingReady = []
    handshake?.reject(reason)
    for (const waiter of waiting) waiter.reject(reason)
  }

  private handleLine(line: string): void {
    // Stockfish answers an option it does not recognise with a line and then
    // carries on at whatever strength it was already at. Silently ignoring that
    // is how a difficulty setting comes to mean nothing, so it is surfaced.
    if (line.startsWith('No such option')) {
      console.warn(`Engine rejected an option: ${line}`)
      return
    }

    if (line.startsWith('uciok')) {
      this.uciHandshake?.resolve()
      this.uciHandshake = null
      return
    }

    if (line.startsWith('readyok')) {
      this.pendingReady.shift()?.resolve()
      return
    }

    const bestMove = BEST_MOVE_PATTERN.exec(line)
    if (bestMove === null) return

    // An answer to a question already withdrawn. Discarded before it can be
    // mistaken for an answer to the current one.
    if (this.owedBestMoves > 0) {
      this.owedBestMoves -= 1
      return
    }

    const search = this.search
    if (search === null) return
    this.search = null

    const intent = parseLongAlgebraic(bestMove[1] ?? '')
    if (intent === null) {
      // "bestmove (none)" means the engine sees no legal move — a position it
      // should never have been handed.
      search.reject(new EngineUnavailable(`Engine returned no move: "${line}"`))
      return
    }
    search.resolve(intent)
  }

  /**
   * Sends one UCI command.
   *
   * UCI is newline-delimited, so a value carrying a newline does not corrupt a
   * command — it appends another one. Every value interpolated here is typed or
   * engine-generated today, which is exactly what was true of the archive's sort
   * column before it turned out not to be. Refusing the character closes the
   * class rather than the instance.
   */
  private send(command: string): void {
    assertSingleLine(command)
    this.worker?.postMessage(command)
  }
}

function assertSingleLine(command: string): void {
  if (/[\r\n]/.test(command)) {
    throw new Error('Refusing to send a UCI command containing a line break')
  }
}

/**
 * The `position` command for one search.
 *
 * The move list is not decoration. A bare FEN carries no repetition history, so
 * an engine handed one cannot see that it is about to repeat a position for the
 * third time — it will walk into a draw from a winning position, a draw this app
 * then scores correctly, because `ChessJsRules` is given the history the engine
 * was not. The same limitation is documented there; it now has the same fix on
 * both sides of the wall.
 */
export function positionCommand(request: EngineSearchRequest): string {
  const history = request.history
  if (history === undefined || history.moves.length === 0) {
    return `position fen ${history?.startPosition.fen ?? request.position.fen}`
  }
  const moves = history.moves.map(toLongAlgebraic).join(' ')
  return `position fen ${history.startPosition.fen} moves ${moves}`
}

/**
 * The `go` command for one search.
 *
 * Given a clock, the engine is told what both sides have left and budgets its
 * own thinking. That is the only arrangement in which it does not flag itself: a
 * fixed `movetime` of two seconds forfeits a one-minute game around move thirty
 * however good the moves are, and spends two seconds a move in a ninety-minute
 * game that was asking for the engine's best.
 *
 * `movetime` is still what an untimed position gets, because there is no budget
 * to divide. The two are mutually exclusive on purpose — Stockfish reads
 * `movetime` as a fixed allowance and would ignore a clock sent beside it.
 *
 * `depth` rides along either way: it is the difficulty's own cap, and the engine
 * stops at whichever limit it reaches first.
 */
export function goCommand(request: EngineSearchRequest, limits: EngineSearchLimits): string {
  const depth = limits.maxDepth === undefined ? '' : ` depth ${limits.maxDepth}`
  const budget = request.timeBudget
  if (budget === undefined) return `go movetime ${limits.untimedMoveTimeMs}${depth}`

  const ms = (value: number) => Math.max(0, Math.round(value))
  return (
    `go wtime ${ms(budget.whiteMs)} btime ${ms(budget.blackMs)}` +
    ` winc ${ms(budget.whiteIncrementMs)} binc ${ms(budget.blackIncrementMs)}${depth}`
  )
}

/** Converts UCI's "e2e4" / "e7e8q" into a move intent. */
export function parseLongAlgebraic(token: string): MoveIntent | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) return null

  const promotion = token.length === 5 ? token[4] : undefined
  return {
    from: toSquare(token.slice(0, 2)),
    to: toSquare(token.slice(2, 4)),
    promotion: promotionPieceFromSymbol(promotion as PieceSymbol | undefined),
  }
}

/** The inverse: "e7e8q" from a move intent, for a `position ... moves` list. */
export function toLongAlgebraic(move: MoveIntent): string {
  const promotion = move.promotion === undefined ? '' : SYMBOL_BY_PROMOTION_PIECE[move.promotion]
  return `${move.from}${move.to}${promotion}`
}
