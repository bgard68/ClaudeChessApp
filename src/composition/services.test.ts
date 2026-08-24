import { describe, expect, it, vi } from 'vitest'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { SqliteGameArchive } from '@infrastructure/archive/SqliteGameArchive'
import { HttpPgnSource } from '@infrastructure/archive/PgnSource'
import { IntervalTicker } from '@infrastructure/time/IntervalTicker'
import { StockfishEngine } from '@infrastructure/engine/StockfishEngine'
import {
  ENGINE_WORKER_URL,
  FAMOUS_GAMES_PGN_URL,
  getAppServices,
  KNOCKOUT_PGN_URL,
  TITLE_MATCHES_PGN_URL,
} from './services'

// The two adapters that talk to a Worker the moment they are constructed.
// Everything else in the composition is real: what this file verifies is the
// wiring, and stubbing more than the browser edges would verify the stubs.
vi.mock('@infrastructure/sqlite/SqliteClient', () => ({ SqliteClient: vi.fn() }))
vi.mock('@infrastructure/engine/StockfishEngine', () => ({ StockfishEngine: vi.fn() }))

describe('getAppServices', () => {
  it('composes one shared service set', () => {
    const services = getAppServices()

    // The same instance every time: a second SQLite connection would lose the
    // OPFS lock and silently drop persistence.
    expect(getAppServices()).toBe(services)

    expect(services.rules).toBeInstanceOf(ChessJsRules)
    // One library behind two ports, so browsing screens cannot delete.
    expect(services.store).toBe(services.archive)
    expect(services.archive).toBeInstanceOf(SqliteGameArchive)
  })

  it('serves the three bundled collections over HTTP', () => {
    getAppServices()

    // The archive constructor took real sources; their URLs are what the
    // deploy actually publishes under /games.
    expect(FAMOUS_GAMES_PGN_URL).toBe('/games/famous-games.pgn')
    expect(TITLE_MATCHES_PGN_URL).toBe('/games/world-championship-title-matches.pgn')
    expect(KNOCKOUT_PGN_URL).toBe('/games/world-championship-knockout.pgn')
    expect(new HttpPgnSource('Famous games', FAMOUS_GAMES_PGN_URL).name).toBe('Famous games')
  })

  it('creates a fresh ticker and a fresh engine per game', () => {
    const services = getAppServices()

    const ticker = services.createTicker()
    expect(ticker).toBeInstanceOf(IntervalTicker)
    expect(ticker).not.toBe(services.createTicker())

    services.createEngine()
    expect(vi.mocked(StockfishEngine)).toHaveBeenCalledWith(ENGINE_WORKER_URL)
  })
})
