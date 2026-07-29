import type { GameArchive } from '@application/ports/GameArchive'
import type { GameStore } from '@application/ports/GameStore'
import type { ChessEngine } from '@application/ports/ChessEngine'
import type { ChessRules } from '@domain/ports/ChessRules'
import type { Ticker } from '@domain/ports/Ticker'
import { SqliteGameArchive } from '@infrastructure/archive/SqliteGameArchive'
import { HttpPgnSource } from '@infrastructure/archive/PgnSource'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { StockfishEngine } from '@infrastructure/engine/StockfishEngine'
import { SqliteClient } from '@infrastructure/sqlite/SqliteClient'
import { IntervalTicker } from '@infrastructure/time/IntervalTicker'

/** Where the bundled game collections are served from. */
export const FAMOUS_GAMES_PGN_URL = '/games/famous-games.pgn'
export const TITLE_MATCHES_PGN_URL = '/games/world-championship-title-matches.pgn'
export const KNOCKOUT_PGN_URL = '/games/world-championship-knockout.pgn'

/** Engine worker path, populated by scripts/copy-engine.mjs. */
export const ENGINE_WORKER_URL = '/engine/stockfish.js'

const CLOCK_TICK_MS = 100

export interface AppServices {
  readonly rules: ChessRules
  readonly archive: GameArchive
  readonly store: GameStore
  createTicker(): Ticker
  createEngine(): ChessEngine
}

/**
 * The composition root: the one module that names concrete implementations.
 *
 * Every other file above the infrastructure layer refers to ports only, so
 * swapping the rules library, the engine, or the game source is a change here
 * and nowhere else.
 *
 * Tickers and engines are created per game rather than shared — each game owns
 * its own clock and its own search process, and disposing one must not silently
 * break the next.
 */
let shared: AppServices | null = null

/**
 * The one set of services this page uses.
 *
 * Deliberately module-level rather than created inside a React hook. OPFS
 * grants its exclusive file handles to a single connection, so a second client
 * — which a double-invoked `useMemo` will happily construct in StrictMode —
 * loses the lock, silently falls back to an in-memory database, and takes the
 * user's imported games with it.
 */
export function getAppServices(): AppServices {
  shared ??= createAppServices()
  return shared
}

function createAppServices(): AppServices {
  // Exactly one client: OPFS grants its exclusive access handles to a single
  // connection, so a second would silently lose persistence.
  // Three files that do not overlap, so nothing is stored twice even before the
  // database's own duplicate check gets involved.
  const library = new SqliteGameArchive(new SqliteClient(), [
    { kind: 'famous', source: new HttpPgnSource('Famous games', FAMOUS_GAMES_PGN_URL) },
    {
      kind: 'championship',
      source: new HttpPgnSource('World Championship matches', TITLE_MATCHES_PGN_URL),
    },
    {
      kind: 'championship',
      source: new HttpPgnSource('FIDE knockout championships', KNOCKOUT_PGN_URL),
    },
  ])

  return {
    rules: new ChessJsRules(),
    // One object, exposed through two narrow ports: browsing screens get no
    // ability to delete.
    archive: library,
    store: library,
    createTicker: () => new IntervalTicker(CLOCK_TICK_MS),
    createEngine: () => new StockfishEngine(ENGINE_WORKER_URL),
  }
}
