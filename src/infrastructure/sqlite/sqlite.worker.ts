/// <reference lib="webworker" />
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import type {
  SqlRow,
  SqlStatement,
  StorageStatus,
  WorkerRequest,
  WorkerResponse,
} from './protocol'

/**
 * Runs SQLite inside a worker.
 *
 * Not an optimisation — a requirement. `createSyncAccessHandle`, which the
 * OPFS storage backend is built on, exists only in worker scope; on the main
 * thread it is `undefined` and the database could never persist. Keeping the
 * queries off the main thread is a welcome side effect.
 */

const context = self as unknown as DedicatedWorkerGlobalScope

const VFS_NAME = 'chess-library'

let database: Database | null = null
let storage: StorageStatus = { kind: 'memory', reason: 'no-opfs' }

async function open(filename: string): Promise<void> {
  if (database !== null) return

  const sqlite3 = await sqlite3InitModule()

  try {
    // The SAH-pool backend is the one that needs no COOP/COEP headers, which is
    // what keeps this app deployable as plain static files.
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: VFS_NAME })
    database = new pool.OpfsSAHPoolDb(filename)
    storage = { kind: 'persistent' }
  } catch (error) {
    // Two distinct causes, and the user deserves to be told which: no OPFS at
    // all (private windows, older browsers), or another tab already holding the
    // exclusive access handles.
    const isLocked =
      error instanceof Error &&
      (error.name === 'NoModificationAllowedError' ||
        error.message.includes('Access Handles cannot be created'))

    console.warn('Falling back to an in-memory database.', error)
    database = new sqlite3.oo1.DB(':memory:')
    storage = { kind: 'memory', reason: isLocked ? 'another-tab' : 'no-opfs' }
  }
}

function requireDatabase(): Database {
  if (database === null) throw new Error('Database has not been opened')
  return database
}

function runStatement(statement: SqlStatement): SqlRow[] {
  return requireDatabase().exec({
    sql: statement.sql,
    bind: statement.bind === undefined ? undefined : [...statement.bind],
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as SqlRow[]
}

/** All-or-nothing: a failed import must not leave a half-filled library. */
function runInTransaction(statements: readonly SqlStatement[]): void {
  const db = requireDatabase()
  db.exec('BEGIN')
  try {
    for (const statement of statements) runStatement(statement)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

context.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const reply = (response: WorkerResponse) => context.postMessage(response)

  try {
    switch (request.kind) {
      case 'open':
        await open(request.filename)
        break
      case 'exec':
        if (request.statements.length === 1) runStatement(request.statements[0]!)
        else runInTransaction(request.statements)
        break
      case 'select':
        reply({ id: request.id, ok: true, rows: runStatement(request.statement), storage })
        return
    }
    reply({ id: request.id, ok: true, rows: [], storage })
  } catch (error) {
    reply({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
