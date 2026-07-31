import type {
  SqlRow,
  SqlStatement,
  SqlValue,
  StorageStatus,
  WorkerRequest,
  WorkerResponse,
} from './protocol'

/** `Omit` collapses a union into its shared keys; this keeps the members apart. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

interface Pending {
  readonly resolve: (response: Extract<WorkerResponse, { ok: true }>) => void
  readonly reject: (reason: Error) => void
}

const DATABASE_FILE = 'chess-library.sqlite'

/**
 * Main-thread side of the database worker.
 *
 * Turns the worker's message passing into ordinary awaited calls, so the
 * archive adapter above it reads like it is talking to a normal database.
 */
export class SqliteClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private opened: Promise<void> | null = null
  private storageStatus: StorageStatus = { kind: 'memory', reason: 'no-opfs' }

  constructor() {
    this.worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (pending === undefined) return
      this.pending.delete(response.id)

      if (response.ok) {
        this.storageStatus = response.storage
        pending.resolve(response)
      } else {
        pending.reject(new Error(response.error))
      }
    }
  }

  /**
   * Where the database ended up living. Anything other than `persistent` means
   * saves will not survive a refresh, which the UI is expected to say plainly
   * rather than lose a game quietly.
   */
  get storage(): StorageStatus {
    return this.storageStatus
  }

  open(): Promise<void> {
    // A failed open is an attempt, not a state: forgotten so the next call can
    // try again — the worker's open is idempotent, and caching the rejection
    // would keep the database unreachable for the rest of the session.
    this.opened ??= this.send({ kind: 'open', filename: DATABASE_FILE }).then(
      () => undefined,
      (error: unknown) => {
        this.opened = null
        throw error
      },
    )
    return this.opened
  }

  async select<T extends SqlRow = SqlRow>(
    sql: string,
    bind?: readonly SqlValue[],
  ): Promise<T[]> {
    await this.open()
    const response = await this.send({ kind: 'select', statement: { sql, bind } })
    return response.rows as T[]
  }

  async selectOne<T extends SqlRow = SqlRow>(
    sql: string,
    bind?: readonly SqlValue[],
  ): Promise<T | null> {
    const rows = await this.select<T>(sql, bind)
    return rows[0] ?? null
  }

  async exec(sql: string, bind?: readonly SqlValue[]): Promise<void> {
    await this.open()
    await this.send({ kind: 'exec', statements: [{ sql, bind }] })
  }

  /** Runs many statements as one transaction — one round trip, all or nothing. */
  async execBatch(statements: readonly SqlStatement[]): Promise<void> {
    if (statements.length === 0) return
    await this.open()
    await this.send({ kind: 'exec', statements })
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Database closed'))
    }
    this.pending.clear()
    this.worker.terminate()
  }

  private send(
    request: WithoutId<WorkerRequest>,
  ): Promise<Extract<WorkerResponse, { ok: true }>> {
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...request, id } as WorkerRequest)
    })
  }
}
