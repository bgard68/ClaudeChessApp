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
  /**
   * Set once the worker is beyond use, and never cleared.
   *
   * A worker that fails to start answers nothing, and every request was waiting
   * on an answer: `send` resolves only from `onmessage`, so a worker that never
   * posts a message leaves each promise pending for the life of the page. The
   * archive screen sets `isLoading` and waits on exactly those promises, so the
   * failure presented as a library that is still searching — permanently, with
   * no error, no empty state, and nothing to retry.
   *
   * Terminal rather than retried, deliberately: a `Worker` that errored cannot
   * be restarted, only replaced, and this client owns one for the life of the
   * session. Failing every later call immediately is what turns a hang into a
   * message somebody can act on.
   */
  private failure: Error | null = null

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

    // Reaching either of these means no response is coming for anything.
    this.worker.onerror = (event: ErrorEvent) =>
      this.fail(
        new Error(
          `The game library could not be opened: ${event.message || 'the database worker failed to start'}`,
        ),
      )
    this.worker.onmessageerror = () =>
      this.fail(new Error('The game library sent a message that could not be read'))
  }

  /** Fails every request in flight, and every one after it. */
  private fail(error: Error): void {
    this.failure ??= error
    for (const pending of this.pending.values()) pending.reject(this.failure)
    this.pending.clear()
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
    this.fail(new Error('Database closed'))
    this.worker.terminate()
  }

  private send(
    request: WithoutId<WorkerRequest>,
  ): Promise<Extract<WorkerResponse, { ok: true }>> {
    if (this.failure !== null) return Promise.reject(this.failure)

    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...request, id } as WorkerRequest)
    })
  }
}
