import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import { toSquare } from '@domain/chess/Square'
import type { ChessEngine, EngineConfiguration } from '@application/ports/ChessEngine'
import { promotionPieceFromSymbol } from '../chess/pieceMapping'
import type { PieceSymbol } from 'chess.js'

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

export class EngineUnavailable extends Error {}
export class SearchAbandoned extends Error {}

const BEST_MOVE_PATTERN = /^bestmove\s+(\S+)/

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
  private search: Deferred<MoveIntent> | null = null
  private configuration: EngineConfiguration | null = null
  private disposed = false

  constructor(private readonly workerUrl: string) {}

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new EngineUnavailable('Engine disposed'))
    this.initialisation ??= this.startWorker()
    return this.initialisation
  }

  async configure(configuration: EngineConfiguration): Promise<void> {
    await this.init()
    this.configuration = configuration
    this.send(`setoption name Skill Level value ${configuration.skillLevel}`)
  }

  async chooseMove(position: Position): Promise<MoveIntent> {
    await this.init()

    // Only one search may be in flight; a new request supersedes the old.
    this.stop()

    const search = deferred<MoveIntent>()
    this.search = search

    const limits = this.configuration?.searchLimits ?? { moveTimeMs: 1_000 }
    const depthClause = limits.maxDepth === undefined ? '' : ` depth ${limits.maxDepth}`

    this.send(`position fen ${position.fen}`)
    this.send(`go movetime ${limits.moveTimeMs}${depthClause}`)

    return search.promise
  }

  stop(): void {
    const search = this.search
    if (search === null) return

    this.search = null
    this.send('stop')
    search.reject(new SearchAbandoned('Search abandoned'))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.uciHandshake?.reject(new EngineUnavailable('Engine disposed'))
    this.uciHandshake = null
    this.worker?.terminate()
    this.worker = null
  }

  private startWorker(): Promise<void> {
    const handshake = deferred<void>()
    this.uciHandshake = handshake

    try {
      // A classic worker, not a module worker: the Stockfish build is an
      // Emscripten bundle that locates its .wasm file relative to itself.
      const worker = new Worker(this.workerUrl)
      worker.onmessage = (event: MessageEvent) => this.handleLine(String(event.data))
      worker.onerror = () => {
        handshake.reject(new EngineUnavailable(`Could not start engine at ${this.workerUrl}`))
      }
      this.worker = worker
      this.send('uci')
    } catch (error) {
      handshake.reject(
        new EngineUnavailable(
          `Could not start engine: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
    }

    return handshake.promise
  }

  private handleLine(line: string): void {
    if (line.startsWith('uciok')) {
      this.uciHandshake?.resolve()
      this.uciHandshake = null
      return
    }

    const bestMove = BEST_MOVE_PATTERN.exec(line)
    if (bestMove === null) return

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
    if (/[\r\n]/.test(command)) {
      throw new Error('Refusing to send a UCI command containing a line break')
    }
    this.worker?.postMessage(command)
  }
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
