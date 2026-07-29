import type { ArchivedGame } from '@domain/archive/ArchivedGame'
import type {
  ArchivePage,
  ArchiveQuery,
  GameArchive,
  ImportProgress,
  LibraryDurability,
} from '@application/ports/GameArchive'
import type { GameStore, RecordedGame } from '@application/ports/GameStore'
import { parseArchivedGame } from '../pgn/parseArchivedGame'
import { splitPgnGames } from '../pgn/splitPgnGames'
import { writePgn } from '../pgn/writePgn'
import { LIBRARY_VERSION, SCHEMA_STATEMENTS, SCHEMA_VERSION } from '../sqlite/schema'
import type { SqliteClient } from '../sqlite/SqliteClient'
import type { SqlStatement } from '../sqlite/protocol'
import { insertStatement, SUMMARY_COLUMNS, toSummary, type GameSource } from './gameRow'
import type { PgnSource } from './PgnSource'

/** A PGN file shipped with the app, and what kind of games it holds. */
export interface BundledCollection {
  readonly kind: GameSource
  readonly source: PgnSource
}

const DEFAULT_PAGE_SIZE = 50

/** Games per transaction when importing. Small enough to keep the worker
 *  responsive and report progress; large enough that the overhead is trivial. */
const IMPORT_CHUNK = 500

/**
 * The game library, backed by SQLite.
 *
 * Implements both ports: reading for the archive browser, writing for saved
 * games. They stay separate interfaces so a screen that only browses cannot
 * be handed the ability to delete.
 *
 * The championship games are imported exactly once — on the first visit that
 * finds the table empty. Every visit after reads from the database, so the PGN
 * is never parsed again.
 */
export class SqliteGameArchive implements GameArchive, GameStore {
  private readonly parsed = new Map<string, ArchivedGame>()
  private initialisation: Promise<void> | null = null
  private importFailure: string | null = null

  constructor(
    private readonly client: SqliteClient,
    private readonly bundled: readonly BundledCollection[],
  ) {}

  /** Sources that could not be read, so the UI can explain an empty library. */
  get failures(): readonly string[] {
    return this.importFailure === null ? [] : [this.importFailure]
  }

  async durability(): Promise<LibraryDurability> {
    await this.ready()
    const storage = this.client.storage
    return storage.kind === 'persistent'
      ? { kind: 'durable' }
      : {
          kind: 'temporary',
          reason: storage.reason === 'another-tab' ? 'another-tab' : 'no-storage',
        }
  }

  async list(query: ArchiveQuery = {}): Promise<ArchivePage> {
    await this.ready()

    const search = query.search?.trim().toLowerCase() ?? ''
    const where = search === '' ? '' : 'WHERE search_text LIKE ?'
    const filter = search === '' ? [] : [`%${search}%`]

    const total = await this.client.selectOne<{ n: number }>(
      `SELECT count(*) AS n FROM game ${where}`,
      filter,
    )

    const limit = Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE)
    const offset = Math.max(0, query.offset ?? 0)

    // When searching, games where the term names a *player* come first.
    // Otherwise a tournament like "Bobby Fischer Memorial" buries every game
    // actually played by someone of that name.
    const relevance =
      search === ''
        ? ''
        : `CASE WHEN lower(white_name || ' ' || black_name) LIKE ? THEN 0 ELSE 1 END,`
    const relevanceBinding = search === '' ? [] : [`%${search}%`]

    const rows = await this.client.select(
      `SELECT ${SUMMARY_COLUMNS} FROM game ${where}
       -- Your own games first, then the celebrated ones, then the championship
       -- archive in chronological order.
       ORDER BY ${relevance}
                CASE source WHEN 'played' THEN 0 WHEN 'famous' THEN 1 ELSE 2 END,
                recorded_at DESC, played_on, round
       LIMIT ? OFFSET ?`,
      [...filter, ...relevanceBinding, limit, offset],
    )

    return { games: rows.map(toSummary), total: Number(total?.n ?? 0) }
  }

  async load(id: string): Promise<ArchivedGame> {
    await this.ready()

    const cached = this.parsed.get(id)
    if (cached !== undefined) return cached

    const row = await this.client.selectOne<{ pgn: string }>(
      'SELECT pgn FROM game WHERE id = ?',
      [id],
    )
    if (row === null) throw new Error(`No archived game with id "${id}"`)

    const game = parseArchivedGame(String(row.pgn), id)
    if (game === null) throw new Error(`Game "${id}" could not be read from its PGN`)

    this.parsed.set(id, game)
    return game
  }

  async importPgn(
    pgnText: string,
    _sourceName: string,
    onProgress?: ImportProgress,
  ): Promise<number> {
    await this.ready()

    const games = splitPgnGames(pgnText)
    const before = await this.countGames()

    // Chunked, because the optional collections run to tens of thousands of
    // games: one transaction that size holds the worker for minutes and gives
    // the user nothing to look at.
    for (let index = 0; index < games.length; index += IMPORT_CHUNK) {
      const chunk = games.slice(index, index + IMPORT_CHUNK)
      await this.client.execBatch(chunk.map((game) => insertStatement(game, 'imported')))
      onProgress?.(Math.min(index + IMPORT_CHUNK, games.length), games.length)
    }

    // The difference, not the number supplied: games already held are rejected
    // by the unique key, and saying "added 40,000" when it added none is a lie.
    return (await this.countGames()) - before
  }

  private async countGames(): Promise<number> {
    const row = await this.client.selectOne<{ n: number }>('SELECT count(*) AS n FROM game')
    return Number(row?.n ?? 0)
  }

  async save(game: RecordedGame): Promise<string> {
    await this.ready()

    await this.client.execBatch([
      insertStatement(writePgn(game), 'played', game.recordedAt),
    ])

    const row = await this.client.selectOne<{ id: number }>(
      'SELECT last_insert_rowid() AS id',
    )
    return String(row?.id ?? '')
  }

  async remove(id: string): Promise<void> {
    await this.ready()
    this.parsed.delete(id)
    await this.client.exec('DELETE FROM game WHERE id = ?', [id])
  }

  private ready(): Promise<void> {
    this.initialisation ??= this.initialise()
    return this.initialisation
  }

  /**
   * Brings an existing database up to the current schema.
   *
   * Rebuilds the table wholesale rather than accumulating a ladder of `ALTER`
   * statements — the bundled collections are re-importable, so only the games
   * you played are irreplaceable, and those are carried across explicitly. A
   * schema change must never cost someone their own games.
   */
  private async migrate(): Promise<void> {
    const version = await this.client.selectOne<{ user_version: number }>(
      'PRAGMA user_version',
    )
    const current = Number(version?.user_version ?? 0)
    if (current === SCHEMA_VERSION) return

    // Always ask, never assume. A database created before versioning existed
    // also reports 0, so treating 0 as "nothing to keep" silently destroyed
    // saved games. If the table is absent the query simply fails and there was
    // genuinely nothing to carry.
    const saved = await this.client
      .select<{ pgn: string; recorded_at: string | null; source: string }>(
        "SELECT pgn, recorded_at, source FROM game WHERE source <> 'championship' AND source <> 'famous'",
      )
      .catch(() => [])

    await this.client.execBatch([
      { sql: 'DROP TABLE IF EXISTS game' },
      ...SCHEMA_STATEMENTS.map((sql): SqlStatement => ({ sql })),
      ...saved.map((row) =>
        insertStatement(
          String(row.pgn),
          String(row.source) as GameSource,
          row.recorded_at as string | null,
        ),
      ),
      { sql: `PRAGMA user_version = ${SCHEMA_VERSION}` },
    ])

    if (saved.length > 0) {
      console.info(`Schema updated; ${saved.length} of your game(s) carried across.`)
    }
  }

  private async initialise(): Promise<void> {
    await this.client.open()
    await this.migrate()

    // Tolerant of the table being absent: a database from before `meta` existed
    // must still open, and simply be treated as having no library installed.
    const installed = await this.client
      .selectOne<{ value: string }>("SELECT value FROM meta WHERE key = 'library_version'")
      .catch(() => null)
    const current = Number(installed?.value ?? 0)

    const games = await this.client.selectOne<{ n: number }>(
      "SELECT count(*) AS n FROM game WHERE source IN ('championship','famous')",
    )
    const hasGames = Number(games?.n ?? 0) > 0

    if (hasGames && current === LIBRARY_VERSION) return

    // The collections have changed since this browser last looked, so the old
    // ones are cleared out first. Only bundled games go — your own are yours.
    if (hasGames) {
      await this.client.exec("DELETE FROM game WHERE source IN ('championship','famous')")
      console.info('Game library updated; refreshing the bundled collections.')
    }

    for (const collection of this.bundled) {
      try {
        const text = await collection.source.load()
        const statements = splitPgnGames(text).map((game) =>
          insertStatement(game, collection.kind),
        )
        // One transaction, one round trip to the worker: thousands of separate
        // messages would cost far more than the inserts themselves.
        await this.client.execBatch(statements)
      } catch (error) {
        // A missing games file must not stop you playing, or using saved games.
        this.importFailure = error instanceof Error ? error.message : String(error)
        console.warn(`${collection.source.name} could not be imported.`, error)
      }
    }

    // Recorded only after a clean run, so a failed import is retried next time
    // rather than being mistaken for an up-to-date library.
    if (this.importFailure === null) {
      await this.client.exec(
        "INSERT INTO meta (key, value) VALUES ('library_version', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [String(LIBRARY_VERSION)],
      )
    }
  }
}
