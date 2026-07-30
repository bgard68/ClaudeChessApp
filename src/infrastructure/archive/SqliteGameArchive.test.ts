import { describe, expect, it } from 'vitest'
import { SqliteGameArchive } from './SqliteGameArchive'
import type { SqliteClient } from '../sqlite/SqliteClient'
import type { SqlRow, SqlStatement } from '../sqlite/protocol'
import { SCHEMA_VERSION } from '../sqlite/schema'

const GAME = `[Event "Test Match"]
[Site "Nowhere"]
[Date "1999.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`

/**
 * Answers the archive's queries the way an empty, freshly created database
 * would, and records what was executed. No SQL is evaluated: these tests are
 * about when the archive gives up and when it tries again, not about queries.
 */
class ScriptedClient {
  openCalls = 0
  batches: SqlStatement[][] = []
  failOpens: number

  constructor(failOpens = 0) {
    this.failOpens = failOpens
  }

  readonly storage = { kind: 'persistent' } as const

  open(): Promise<void> {
    this.openCalls += 1
    return this.failOpens-- > 0
      ? Promise.reject(new Error('worker never came up'))
      : Promise.resolve()
  }

  select<T extends SqlRow = SqlRow>(sql: string): Promise<T[]> {
    const rows: SqlRow[] = sql.includes('PRAGMA user_version')
      ? [{ user_version: SCHEMA_VERSION }]
      : sql.includes('FROM meta')
        ? []
        : sql.includes('count(*)')
          ? [{ n: this.storedGames(), lo: null, hi: null }]
          : []
    return Promise.resolve(rows as T[])
  }

  async selectOne<T extends SqlRow = SqlRow>(sql: string): Promise<T | null> {
    return (await this.select<T>(sql))[0] ?? null
  }

  exec(): Promise<void> {
    return Promise.resolve()
  }

  execBatch(statements: readonly SqlStatement[]): Promise<void> {
    this.batches.push([...statements])
    return Promise.resolve()
  }

  /** How many games the recorded inserts have put in the `game` table. */
  storedGames(): number {
    return this.batches
      .flat()
      .filter((statement) => statement.sql.includes('INSERT OR IGNORE INTO game')).length
  }

  asClient(): SqliteClient {
    return this as unknown as SqliteClient
  }
}

/** A source that fails a set number of times before serving its games. */
class FlakySource {
  loads = 0
  constructor(
    readonly name: string,
    private failures: number,
  ) {}

  load(): Promise<string> {
    this.loads += 1
    return this.failures-- > 0
      ? Promise.reject(new Error(`${this.name} is unreachable`))
      : Promise.resolve(GAME)
  }
}

describe('SqliteGameArchive first-load recovery', () => {
  it('seeds once, on the first query', async () => {
    const client = new ScriptedClient()
    const source = new FlakySource('games', 0)
    const archive = new SqliteGameArchive(client.asClient(), [
      { kind: 'famous', source },
    ])

    await archive.list()
    await archive.facets()

    expect(source.loads).toBe(1)
    expect(client.storedGames()).toBe(1)
    expect(archive.failures).toEqual([])
  })

  it('retries seeding on the next query after a source failed', async () => {
    const client = new ScriptedClient()
    const source = new FlakySource('games', 1)
    const archive = new SqliteGameArchive(client.asClient(), [
      { kind: 'famous', source },
    ])

    // First visit: the fetch fails, the library stays empty, and the screen
    // is told why instead of being told to import something.
    await archive.list()
    expect(client.storedGames()).toBe(0)
    expect(archive.failures).toEqual(['games is unreachable'])

    // Next look — navigating back, or pressing "Try again" — heals it.
    await archive.list()
    expect(source.loads).toBe(2)
    expect(client.storedGames()).toBe(1)
    expect(archive.failures).toEqual([])
  })

  it('shares one attempt between concurrent queries, even a failing one', async () => {
    const client = new ScriptedClient()
    const source = new FlakySource('games', 1)
    const archive = new SqliteGameArchive(client.asClient(), [
      { kind: 'famous', source },
    ])

    // list() and facets() race on mount; a failure must burn one attempt,
    // not one per caller.
    await Promise.all([archive.list(), archive.facets()])
    expect(source.loads).toBe(1)
  })

  it('retries a database that failed to open', async () => {
    const client = new ScriptedClient(1)
    const source = new FlakySource('games', 0)
    const archive = new SqliteGameArchive(client.asClient(), [
      { kind: 'famous', source },
    ])

    await expect(archive.list()).rejects.toThrow('worker never came up')

    await archive.list()
    expect(client.openCalls).toBe(2)
    expect(client.storedGames()).toBe(1)
    expect(archive.failures).toEqual([])
  })
})
