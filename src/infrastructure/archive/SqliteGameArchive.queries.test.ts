import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMPORT_BYTES } from '@application/importLimits'
import { MAX_EVENT_OPTIONS } from '@application/ports/GameArchive'
import type { RecordedGame } from '@application/ports/GameStore'
import { UNLIMITED } from '@domain/clock/TimeControl'
import type { SqliteClient } from '../sqlite/SqliteClient'
import type { SqlRow, SqlStatement, SqlValue, StorageStatus } from '../sqlite/protocol'
import { LIBRARY_VERSION, SCHEMA_VERSION } from '../sqlite/schema'
import { SqliteGameArchive } from './SqliteGameArchive'
import { StaticPgnSource } from './PgnSource'

const GAME = `[Event "Test Match"]
[Site "Nowhere"]
[Date "1999.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`

/** The columns a summary row carries, filled in with plausible values. */
const summaryRow = (over: Partial<SqlRow> = {}): SqlRow => ({
  id: 1,
  source: 'championship',
  white_name: 'Alice',
  black_name: 'Bob',
  white_elo: null,
  black_elo: null,
  event: 'Test Match',
  site: 'Nowhere',
  played_on: '1999.01.01',
  round: '1',
  result: '1-0',
  move_count: 4,
  has_clock_times: 0,
  nickname: null,
  ...over,
})

interface Query {
  readonly sql: string
  readonly bind: readonly SqlValue[]
}

/**
 * Records every query the archive issues and answers it from a table of
 * canned replies. No SQL is evaluated — these tests are about the statements
 * the archive builds and what it makes of the answers, which is exactly the
 * half a real database would not tell you.
 */
class RecordingClient {
  readonly queries: Query[] = []
  readonly batches: SqlStatement[][] = []
  storage: StorageStatus = { kind: 'persistent' }

  /** Answers matched in order: the first whose pattern matches wins. */
  private replies: { match: RegExp; rows: SqlRow[] | (() => SqlRow[]) }[] = []
  private failures: { match: RegExp; error: string }[] = []

  constructor() {
    // A freshly migrated, empty database.
    this.reply(/PRAGMA user_version/, [{ user_version: SCHEMA_VERSION }])
    this.reply(/FROM meta/, [{ value: String(LIBRARY_VERSION) }])
    this.reply(/count\(\*\) AS n/, [{ n: 1, lo: 1990, hi: 2020 }])
  }

  reply(match: RegExp, rows: SqlRow[] | (() => SqlRow[])): this {
    this.replies.unshift({ match, rows })
    return this
  }

  failOn(match: RegExp, error: string): this {
    this.failures.push({ match, error })
    return this
  }

  /** The recorded query whose SQL matches, or a failure if none does. */
  query(match: RegExp): Query {
    const found = this.queries.find((entry) => match.test(entry.sql))
    if (found === undefined) {
      throw new Error(`No query matching ${match}. Saw:\n${this.queries.map((q) => q.sql).join('\n--\n')}`)
    }
    return found
  }

  open(): Promise<void> {
    return Promise.resolve()
  }

  select<T extends SqlRow = SqlRow>(sql: string, bind: readonly SqlValue[] = []): Promise<T[]> {
    this.queries.push({ sql, bind })

    const failure = this.failures.find((entry) => entry.match.test(sql))
    if (failure !== undefined) return Promise.reject(new Error(failure.error))

    const reply = this.replies.find((entry) => entry.match.test(sql))
    const rows = reply === undefined ? [] : typeof reply.rows === 'function' ? reply.rows() : reply.rows
    return Promise.resolve(rows as T[])
  }

  async selectOne<T extends SqlRow = SqlRow>(
    sql: string,
    bind: readonly SqlValue[] = [],
  ): Promise<T | null> {
    return (await this.select<T>(sql, bind))[0] ?? null
  }

  exec(sql: string, bind: readonly SqlValue[] = []): Promise<void> {
    this.queries.push({ sql, bind })
    return Promise.resolve()
  }

  execBatch(statements: readonly SqlStatement[]): Promise<void> {
    this.batches.push([...statements])
    return Promise.resolve()
  }

  asClient(): SqliteClient {
    return this as unknown as SqliteClient
  }
}

/** An archive over a client, seeded from one bundled collection. */
function archiveOver(client: RecordingClient) {
  return new SqliteGameArchive(client.asClient(), [
    { kind: 'famous', source: new StaticPgnSource('bundled games', GAME) },
  ])
}

let client: RecordingClient

beforeEach(() => {
  client = new RecordingClient()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('list', () => {
  /** Runs a query and hands back the SELECT that fetched the page. */
  async function listing(query: Parameters<SqliteGameArchive['list']>[0]) {
    client.reply(/SELECT id, source/, [summaryRow()])
    const page = await archiveOver(client).list(query)
    return { page, sql: client.query(/SELECT id, source/) }
  }

  it('asks for everything when nothing is narrowed', async () => {
    const { page, sql } = await listing({})

    expect(sql.sql).not.toContain('WHERE')
    expect(page.total).toBe(1)
    expect(page.games[0]).toMatchObject({ id: '1', white: 'Alice' })
    // The default page size, and no offset.
    expect(sql.bind).toEqual([50, 0])
  })

  it('honours an explicit page size and offset', async () => {
    const { sql } = await listing({ limit: 10, offset: 20 })
    expect(sql.bind).toEqual([10, 20])
  })

  it('refuses a page of nothing, or a negative offset', async () => {
    // A limit of zero would fetch nothing forever; the list must still move.
    expect((await listing({ limit: 0, offset: -5 })).sql.bind).toEqual([1, 0])
  })

  it('matches a search term at the start of a word', async () => {
    const { sql } = await listing({ search: '  Tal  ' })

    expect(sql.sql).toContain('search_text LIKE ?')
    // Trimmed and folded, then matched at a word start rather than anywhere.
    expect(sql.bind).toEqual(['tal%', '% tal%', '% tal %', 50, 0])
  })

  it('ranks whole-word player matches above the rest', async () => {
    const { sql } = await listing({ search: 'tal' })

    // Without this, "tal" buries Mihail Tal under Asztalos and Talvik.
    expect(sql.sql).toContain('CASE WHEN')
    expect(sql.bind).toContain('% tal %')
  })

  it('searches one field at a time when asked', async () => {
    expect((await listing({ search: 'fischer', field: 'player' })).sql.sql).toContain(
      "white_name || ' ' || black_name",
    )

    client = new RecordingClient()
    expect((await listing({ search: 'reykjavik', field: 'event' })).sql.sql).toContain('event')
  })

  it('reads a year, a year range, and refuses anything else', async () => {
    // Compared numerically, so "201" cannot quietly mean 2010 through 2019.
    // The trailing binding is the relevance ranking, which every search gets.
    expect((await listing({ search: '1972', field: 'year' })).sql.bind).toEqual([
      1972,
      '% 1972 %',
      50,
      0,
    ])

    for (const range of ['1960-1970', '1960..1970', '1960 – 1970', '1960 to 1970']) {
      client = new RecordingClient()
      const { sql } = await listing({ search: range, field: 'year' })
      expect(sql.sql).toContain('year BETWEEN ? AND ?')
      expect(sql.bind.slice(0, 2)).toEqual([1960, 1970])
    }

    // Back to front is still a range, read the way round it was meant.
    client = new RecordingClient()
    expect(
      (await listing({ search: '1970-1960', field: 'year' })).sql.bind.slice(0, 2),
    ).toEqual([1960, 1970])

    // Not a year at all: match nothing rather than everything.
    client = new RecordingClient()
    expect((await listing({ search: 'fischer', field: 'year' })).sql.sql).toContain('1 = 0')
  })

  it('takes every spelling of a chosen player', async () => {
    const { sql } = await listing({ playerId: '7' })

    expect(sql.sql).toContain('player_alias')
    expect(sql.bind).toEqual(['7', '7', 50, 0])
  })

  it('lets a chosen player override a search term, and drops the ranking', async () => {
    const { sql } = await listing({ playerId: '7', search: 'tal' })

    expect(sql.sql).toContain('player_alias')
    expect(sql.sql).not.toContain('CASE WHEN')
    expect(sql.bind).toEqual(['7', '7', 50, 0])
  })

  it('narrows to one half of the library', async () => {
    expect((await listing({ scope: 'reference' })).sql.sql).toContain(
      "source IN ('championship','famous','career')",
    )

    client = new RecordingClient()
    expect((await listing({ scope: 'mine' })).sql.sql).toContain(
      "source IN ('played','imported')",
    )

    client = new RecordingClient()
    expect((await listing({ scope: 'all' })).sql.sql).not.toContain('source IN')
  })

  it('combines every filter with AND', async () => {
    const { sql } = await listing({
      search: 'tal',
      event: 'World Championship',
      result: '1-0',
      yearFrom: 1960,
      yearTo: 1970,
      scope: 'mine',
    })

    expect(sql.sql).toContain(' AND ')
    expect(sql.bind).toEqual([
      'tal%',
      '% tal%',
      'World Championship',
      '1-0',
      1960,
      1970,
      '% tal %',
      50,
      0,
    ])
  })

  it('ignores an empty event or result filter', async () => {
    const { sql } = await listing({ event: '', result: '' })
    expect(sql.sql).not.toContain('WHERE')
  })

  it('sorts by a named column, in either direction', async () => {
    expect((await listing({ sort: 'year' })).sql.sql).toContain('ORDER BY year ASC')

    client = new RecordingClient()
    expect((await listing({ sort: 'players', direction: 'desc' })).sql.sql).toContain(
      'ORDER BY white_name DESC',
    )

    client = new RecordingClient()
    expect((await listing({ sort: 'moves', direction: 'asc' })).sql.sql).toContain(
      'ORDER BY move_count ASC',
    )
  })

  it('falls back rather than interpolating a column name it does not know', async () => {
    // SQL has no placeholder for a column, so an unknown key would otherwise
    // put "undefined" straight into ORDER BY.
    const { sql } = await listing({ sort: 'nonsense' as never })

    expect(sql.sql).toContain('ORDER BY played_on')
    expect(sql.sql).not.toContain('undefined')
  })

  it('puts your own games first by default', async () => {
    const { sql } = await listing({})
    expect(sql.sql).toContain("CASE source WHEN 'played' THEN 0")
  })

  it('reports a total of zero when the count comes back empty', async () => {
    client.reply(/count\(\*\) AS n FROM game/, [])
    client.reply(/SELECT id, source/, [])

    expect((await archiveOver(client).list()).total).toBe(0)
  })
})

describe('facets', () => {
  it('reports the totals and the events, capped', async () => {
    client.reply(/GROUP BY event/, [{ event: 'World Championship', games: 40 }])

    const facets = await archiveOver(client).facets()

    expect(facets).toEqual({
      totalGames: 1,
      events: [{ name: 'World Championship', games: 40 }],
      firstYear: 1990,
      lastYear: 2020,
    })
    expect(client.query(/GROUP BY event/).bind).toEqual([MAX_EVENT_OPTIONS])
  })

  it('scopes the filters to the games the screen can show', async () => {
    await archiveOver(client).facets('mine')
    expect(client.query(/GROUP BY event/).sql).toContain("source IN ('played','imported')")

    client = new RecordingClient()
    await archiveOver(client).facets('reference')
    expect(client.query(/GROUP BY event/).sql).toContain(
      "source IN ('championship','famous','career')",
    )

    client = new RecordingClient()
    await archiveOver(client).facets('all')
    expect(client.query(/GROUP BY event/).sql).not.toContain('source IN')
  })

  it('reports no year range for a library that records none', async () => {
    client.reply(/count\(\*\) AS n/, [{ n: 0, lo: null, hi: null }])

    expect(await archiveOver(client).facets()).toMatchObject({
      totalGames: 0,
      firstYear: null,
      lastYear: null,
    })
  })

  it('reports no year range when the totals row is missing entirely', async () => {
    client.reply(/count\(\*\) AS n, min\(year\)/, [])

    expect(await archiveOver(client).facets()).toMatchObject({
      totalGames: 0,
      firstYear: null,
      lastYear: null,
    })
  })
})

describe('suggestPlayers', () => {
  const playerRow = (over: Partial<SqlRow> = {}): SqlRow => ({
    id: 3,
    canonical: 'Tal, Mihail',
    game_count: 900,
    first_year: 1949,
    last_year: 1992,
    peak_elo: 2705,
    ...over,
  })

  it('matches a prefix against both the sort key and the name', async () => {
    client.reply(/FROM player\b/, [playerRow()])

    const suggestions = await archiveOver(client).suggestPlayers('  Tal ')

    expect(suggestions).toEqual([
      {
        id: '3',
        name: 'Tal, Mihail',
        games: 900,
        firstYear: 1949,
        lastYear: 1992,
        peakElo: 2705,
      },
    ])
    // Trimmed, folded, and defaulted to eight suggestions.
    expect(client.query(/FROM player\b/).bind).toEqual(['tal%', 'tal%', 8])
  })

  it('honours a requested limit', async () => {
    client.reply(/FROM player\b/, [])
    await archiveOver(client).suggestPlayers('tal', 3)

    expect(client.query(/FROM player\b/).bind).toEqual(['tal%', 'tal%', 3])
  })

  it('suggests nothing for an empty prefix, without asking the database', async () => {
    const archive = archiveOver(client)

    expect(await archive.suggestPlayers('   ')).toEqual([])
    expect(client.queries.some((entry) => /FROM player\b/.test(entry.sql))).toBe(false)
  })

  it('keeps the nulls a player row is entitled to', async () => {
    client.reply(/FROM player\b/, [
      playerRow({ first_year: null, last_year: null, peak_elo: null }),
    ])

    expect(await archiveOver(client).suggestPlayers('tal')).toEqual([
      {
        id: '3',
        name: 'Tal, Mihail',
        games: 900,
        firstYear: null,
        lastYear: null,
        peakElo: null,
      },
    ])
  })
})

describe('load', () => {
  it('reads a game out of its stored PGN', async () => {
    client.reply(/SELECT pgn FROM game WHERE id/, [{ pgn: GAME }])

    const game = await archiveOver(client).load('12')

    expect(game.white).toBe('Alice')
    expect(game.moves).toHaveLength(7)
    expect(client.query(/SELECT pgn FROM game WHERE id/).bind).toEqual(['12'])
  })

  it('parses each game once and remembers it', async () => {
    client.reply(/SELECT pgn FROM game WHERE id/, [{ pgn: GAME }])
    const archive = archiveOver(client)

    const first = await archive.load('12')
    const again = await archive.load('12')

    expect(again).toBe(first)
    expect(client.queries.filter((q) => /WHERE id/.test(q.sql))).toHaveLength(1)
  })

  it('says which game is missing', async () => {
    client.reply(/SELECT pgn FROM game WHERE id/, [])

    await expect(archiveOver(client).load('99')).rejects.toThrow('No archived game with id "99"')
  })

  it('says when a stored game cannot be read', async () => {
    client.reply(/SELECT pgn FROM game WHERE id/, [{ pgn: '[Event "x"]\n\n1. zz9 *' }])

    await expect(archiveOver(client).load('5')).rejects.toThrow(
      'Game "5" could not be read from its PGN',
    )
  })

  it('forgets a game once it is removed', async () => {
    client.reply(/SELECT pgn FROM game WHERE id/, [{ pgn: GAME }])
    const archive = archiveOver(client)

    await archive.load('12')
    await archive.remove('12')
    await archive.load('12')

    // Read again rather than served from the cache of a deleted game.
    expect(client.queries.filter((q) => /WHERE id/.test(q.sql))).toHaveLength(3)
    expect(client.query(/DELETE FROM game WHERE id/).bind).toEqual(['12'])
  })
})

describe('exportPgn', () => {
  it('writes back only your own games, as stored', async () => {
    client.reply(/SELECT pgn FROM game WHERE source IN/, [
      { pgn: `${GAME}\n` },
      { pgn: `  ${GAME}  ` },
    ])

    const exported = await archiveOver(client).exportPgn()

    expect(exported).toBe(`${GAME}\n\n${GAME}\n`)
    expect(client.query(/SELECT pgn FROM game WHERE source IN/).sql).toContain(
      "source IN ('played','imported')",
    )
  })

  it('writes nothing at all when there is nothing of yours', async () => {
    client.reply(/SELECT pgn FROM game WHERE source IN/, [])

    expect(await archiveOver(client).exportPgn()).toBe('')
  })
})

describe('save', () => {
  const recorded: RecordedGame = {
    white: 'You',
    black: 'Computer',
    event: 'Game vs computer',
    site: 'This device',
    playedOn: '2026.08.24',
    outcome: { status: 'decisive', winner: 'white', reason: 'resignation' },
    timeControl: UNLIMITED,
    moves: [],
    recordedAt: '2026-08-24T10:00:00.000Z',
  }

  it('stores the game and hands back its new id', async () => {
    client.reply(/last_insert_rowid/, [{ id: 41 }])

    expect(await archiveOver(client).save(recorded)).toBe('41')

    // Written as one of your own games, stamped with when it was recorded.
    const insert = client.batches.flat().find((s) => s.sql.includes('INSERT OR IGNORE INTO game') && s.bind?.[0] === 'played')
    expect(insert?.bind?.at(-1)).toBe('2026-08-24T10:00:00.000Z')
  })

  it('hands back an empty id when the database reports none', async () => {
    client.reply(/last_insert_rowid/, [])

    expect(await archiveOver(client).save(recorded)).toBe('')
  })
})

describe('importPgn', () => {
  it('adds the games and reports how many were new', async () => {
    let stored = 1
    client.reply(/count\(\*\) AS n FROM game$/, () => [{ n: stored }])
    client.reply(/count\(\*\) AS n/, () => [{ n: stored, lo: null, hi: null }])

    const archive = archiveOver(client)
    await archive.list()

    // The second count sees one more game than the first.
    let counted = 0
    client.reply(/count\(\*\) AS n FROM game$/, () => [{ n: (counted += 1) === 1 ? 5 : 7 }])

    expect(await archive.importPgn(`${GAME}\n\n${GAME}`, 'a file')).toBe(2)
    expect(stored).toBe(1)
  })

  it('reports progress as it goes', async () => {
    const archive = archiveOver(client)
    const progress: [number, number][] = []

    await archive.importPgn(`${GAME}\n\n${GAME}`, 'a file', (done, total) =>
      progress.push([done, total]),
    )

    expect(progress).toEqual([[2, 2]])
  })

  it('refuses a file past the limit before touching the database', async () => {
    const archive = archiveOver(client)
    await archive.list()
    const before = client.batches.length

    await expect(
      archive.importPgn('x'.repeat(MAX_IMPORT_BYTES + 1), 'huge.pgn'),
    ).rejects.toThrow('too large to import')

    expect(client.batches).toHaveLength(before)
  })

  it('counts nothing when the database reports no count at all', async () => {
    const archive = archiveOver(client)
    await archive.list()

    client.reply(/count\(\*\) AS n FROM game$/, [])

    // Nothing before and nothing after: no games were added, not NaN of them.
    expect(await archive.importPgn(GAME, 'a file')).toBe(0)
  })

  it('rebuilds the player index from the games now held', async () => {
    client.reply(/GROUP BY name/, [
      { name: 'Anand,V', games: 5, first_year: 1990, last_year: 2000, peak_elo: 2800 },
      { name: 'Anand, Viswanathan', games: 3, first_year: 1995, last_year: 2005, peak_elo: null },
      // A name the games record no years for at all.
      { name: 'Unknown,X', games: 1, first_year: null, last_year: null, peak_elo: null },
    ])

    await archiveOver(client).importPgn(GAME, 'a file')

    const written = client.batches.flat()
    // The table is emptied before it is refilled, so it cannot drift.
    expect(written.some((s) => s.sql.includes('DELETE FROM player_alias'))).toBe(true)

    const player = written.find((s) => s.sql.includes('INSERT INTO player '))
    // Both spellings folded into one player, with the fuller name winning.
    expect(player?.bind?.slice(0, 3)).toEqual(['Anand, Viswanathan', 'anand v', 8])
    expect(written.filter((s) => s.sql.includes('INTO player_alias'))).toHaveLength(3)

    // The yearless player is written with nulls rather than NaN.
    const yearless = written.find((s) => s.bind?.[0] === 'Unknown,X')
    expect(yearless?.bind?.slice(3)).toEqual([null, null, null])
  })
})

describe('durability', () => {
  it('reports a persistent library the browser has promised to keep', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: () => Promise.resolve(true), persist: () => Promise.resolve(true) },
    })

    expect(await archiveOver(client).durability()).toEqual({ kind: 'durable', evictable: false })
  })

  it('warns that a persistent library may still be cleared', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) },
    })

    expect(await archiveOver(client).durability()).toEqual({ kind: 'durable', evictable: true })
  })

  it('names another tab as the reason nothing can be kept', async () => {
    client.storage = { kind: 'memory', reason: 'another-tab' }

    expect(await archiveOver(client).durability()).toEqual({
      kind: 'temporary',
      reason: 'another-tab',
    })
  })

  it('reports no storage at all when the browser has none', async () => {
    client.storage = { kind: 'memory', reason: 'no-opfs' }

    expect(await archiveOver(client).durability()).toEqual({
      kind: 'temporary',
      reason: 'no-storage',
    })
  })
})

describe('migration', () => {
  it('leaves a database that is already current alone', async () => {
    await archiveOver(client).list()

    expect(client.batches.flat().some((s) => s.sql.includes('DROP TABLE'))).toBe(false)
  })

  it('rebuilds the table, carrying your own games across', async () => {
    client.reply(/PRAGMA user_version/, [{ user_version: SCHEMA_VERSION - 1 }])
    client.reply(/SELECT pgn, recorded_at, source FROM game/, [
      { pgn: GAME, recorded_at: '2026-01-01T00:00:00.000Z', source: 'played' },
    ])

    await archiveOver(client).list()

    const migration = client.batches.find((batch) => batch[0]?.sql.includes('DROP TABLE'))
    expect(migration).toBeDefined()
    // The saved game is written back, and the version stamped last.
    expect(migration!.some((s) => s.bind?.[0] === 'played')).toBe(true)
    expect(migration!.at(-1)?.sql).toContain(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })

  it('carries nothing across when the old table cannot even be read', async () => {
    client.reply(/PRAGMA user_version/, [{ user_version: 0 }])
    client.failOn(/SELECT pgn, recorded_at, source FROM game/, 'no such table: game')

    await archiveOver(client).list()

    const migration = client.batches.find((batch) => batch[0]?.sql.includes('DROP TABLE'))
    expect(migration).toBeDefined()
    expect(migration!.some((s) => s.sql.includes('INSERT OR IGNORE INTO game'))).toBe(false)
  })

  it('treats a database reporting no version as one to migrate', async () => {
    client.reply(/PRAGMA user_version/, [])

    await archiveOver(client).list()

    expect(client.batches.flat().some((s) => s.sql.includes('DROP TABLE'))).toBe(true)
  })
})

describe('seeding the bundled collections', () => {
  it('refreshes the collections when the shipped library has moved on', async () => {
    client.reply(/FROM meta/, [{ value: String(LIBRARY_VERSION - 1) }])

    await archiveOver(client).list()

    // The old bundled games go; yours are untouched.
    expect(client.query(/DELETE FROM game WHERE source IN/).sql).toContain(
      "source IN ('championship','famous')",
    )
    expect(client.batches.flat().some((s) => s.bind?.[0] === 'famous')).toBe(true)
  })

  it('opens a database from before the meta table existed', async () => {
    client.failOn(/FROM meta/, 'no such table: meta')
    client.reply(/count\(\*\) AS n FROM game WHERE source IN/, [{ n: 0 }])

    await archiveOver(client).list()

    // Treated as having no library installed, so the collections are seeded.
    expect(client.batches.flat().some((s) => s.bind?.[0] === 'famous')).toBe(true)
  })

  it('stamps the library version only after a clean run', async () => {
    client.reply(/FROM meta/, [])
    client.reply(/count\(\*\) AS n FROM game WHERE source IN/, [{ n: 0 }])

    await archiveOver(client).list()

    expect(client.query(/INSERT INTO meta/).bind).toEqual([String(LIBRARY_VERSION)])
  })

  it('leaves the version unstamped when a collection could not be read', async () => {
    client.reply(/FROM meta/, [])
    client.reply(/count\(\*\) AS n FROM game WHERE source IN/, [{ n: 0 }])

    const archive = new SqliteGameArchive(client.asClient(), [
      {
        kind: 'famous',
        source: { name: 'missing games', load: () => Promise.reject(new Error('404')) },
      },
    ])
    await archive.list()

    expect(archive.failures).toEqual(['404'])
    expect(client.queries.some((q) => /INSERT INTO meta/.test(q.sql))).toBe(false)
  })

  it('reports a thrown non-error as best it can', async () => {
    client.reply(/FROM meta/, [])
    client.reply(/count\(\*\) AS n FROM game WHERE source IN/, [{ n: 0 }])

    const archive = new SqliteGameArchive(client.asClient(), [
      {
        kind: 'famous',
        // A rejection that is not an Error still has to reach the screen as
        // words rather than "[object Object]".
        source: { name: 'odd source', load: () => Promise.reject('just a string') },
      },
    ])
    await archive.list()

    expect(archive.failures).toEqual(['just a string'])
  })
})
