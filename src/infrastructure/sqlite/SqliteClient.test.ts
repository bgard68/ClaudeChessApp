import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteClient } from './SqliteClient'

/*
 * The main-thread half of the database, without a database.
 *
 * What is testable here is the part with no SQLite in it: correlating replies to
 * requests, and what happens when no reply is ever coming. The second is where
 * the fault was — a worker that fails to start answers nothing, and every caller
 * was waiting on an answer, so the archive screen sat on "Searching…" for the
 * life of the page with no error and nothing to retry.
 */

const OK = { ok: true as const, storage: { kind: 'persistent' as const } }

/** A worker that replies only when the test says so. */
class FakeWorker {
  static latest: FakeWorker | null = null

  readonly received: { id: number; kind: string }[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  terminated = false

  constructor() {
    FakeWorker.latest = this
  }

  postMessage(request: { id: number; kind: string }): void {
    this.received.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(id: number, extra: Record<string, unknown> = {}): void {
    this.onmessage?.({ data: { id, ...OK, ...extra } } as MessageEvent)
  }

  fail(id: number, error: string): void {
    this.onmessage?.({ data: { id, ok: false, error } } as MessageEvent)
  }

  /** The worker script could not be fetched, parsed, or started. */
  die(message = 'Failed to construct Worker'): void {
    this.onerror?.({ message } as ErrorEvent)
  }

  /** The id of the nth request, which the client chooses. */
  idOf(index: number): number {
    return this.received[index]!.id
  }
}

const clientAndWorker = () => {
  vi.stubGlobal('Worker', FakeWorker)
  const client = new SqliteClient()
  return { client, worker: FakeWorker.latest! }
}

/** Lets the open() round trip complete so a query reaches the worker. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.unstubAllGlobals()
  FakeWorker.latest = null
})

describe('SqliteClient', () => {
  it('sqliteClient_Select_ReturnsTheRowsForItsOwnRequest', async () => {
    const { client, worker } = clientAndWorker()

    const rows = client.select('select 1')
    worker.reply(worker.idOf(0)) // open
    await tick()
    worker.reply(worker.idOf(1), { rows: [{ n: 1 }] })

    await expect(rows).resolves.toEqual([{ n: 1 }])
  })

  /*
   * Replies are matched by id, not by arrival order. Two queries in flight and a
   * database that answers the second one first must not hand the second one's
   * rows to the first caller — the kind of fault that shows up as one screen
   * displaying another screen's results.
   */
  it('sqliteClient_RepliesOutOfOrder_StillGoToTheRequestThatAskedFor', async () => {
    const { client, worker } = clientAndWorker()

    const first = client.select('select 1')
    worker.reply(worker.idOf(0))
    await tick()
    const second = client.select('select 2')
    await tick()

    worker.reply(worker.idOf(2), { rows: [{ n: 2 }] })
    worker.reply(worker.idOf(1), { rows: [{ n: 1 }] })

    await expect(first).resolves.toEqual([{ n: 1 }])
    await expect(second).resolves.toEqual([{ n: 2 }])
  })

  it('sqliteClient_WorkerReportsAnError_RejectsWithIt', async () => {
    const { client, worker } = clientAndWorker()

    const rows = client.select('select bad')
    worker.reply(worker.idOf(0))
    await tick()
    worker.fail(worker.idOf(1), 'no such column: bad')

    await expect(rows).rejects.toThrow(/no such column/)
  })

  /*
   * The bug. A worker that never starts never posts a message, and `send`
   * resolves only from `onmessage` — so every request stayed pending forever.
   * Nothing timed out and nothing rejected, which is why it reached the screen as
   * a permanent "Searching…" rather than as a failure.
   */
  it('sqliteClient_WorkerFailsToStart_RejectsWhatIsWaitingRatherThanHanging', async () => {
    const { client, worker } = clientAndWorker()

    const rows = client.select('select 1')
    worker.die()

    await expect(rows).rejects.toThrow(/could not be opened/i)
  })

  // And every call after it, so a screen that retries gets an answer rather than
  // starting a second wait that also never ends.
  it('sqliteClient_WorkerAlreadyDead_FailsImmediately', async () => {
    const { client, worker } = clientAndWorker()

    worker.die()

    await expect(client.select('select 1')).rejects.toThrow(/could not be opened/i)
    await expect(client.exec('insert into t values (1)')).rejects.toThrow(/could not be opened/i)
  })

  it('sqliteClient_MessageThatCannotBeRead_IsAlsoAFailure', async () => {
    const { client, worker } = clientAndWorker()

    const rows = client.select('select 1')
    worker.onmessageerror?.({} as MessageEvent)

    await expect(rows).rejects.toThrow(/could not be read/i)
  })

  it('sqliteClient_Disposed_RejectsWhatIsWaitingAndStopsTheWorker', async () => {
    const { client, worker } = clientAndWorker()

    const rows = client.select('select 1')
    client.dispose()

    await expect(rows).rejects.toThrow(/closed/i)
    expect(worker.terminated).toBe(true)
  })

  // An empty batch is not a transaction to run; it must not cost a round trip.
  it('sqliteClient_EmptyBatch_SendsNothing', async () => {
    const { client, worker } = clientAndWorker()

    await client.execBatch([])

    expect(worker.received).toHaveLength(0)
  })

  /*
   * A failed open is an attempt, not a state. Caching the rejection would keep
   * the database unreachable for the rest of the session even once whatever
   * caused it had passed.
   */
  it('sqliteClient_OpenFailedOnce_IsTriedAgain', async () => {
    const { client, worker } = clientAndWorker()

    const first = client.select('select 1')
    worker.fail(worker.idOf(0), 'locked by another tab')
    await expect(first).rejects.toThrow(/locked/)

    const second = client.select('select 1')
    await tick()
    // A second open was attempted rather than the first rejection being reused.
    expect(worker.received.filter((request) => request.kind === 'open')).toHaveLength(2)

    worker.reply(worker.idOf(1))
    await tick()
    worker.reply(worker.idOf(2), { rows: [] })
    await expect(second).resolves.toEqual([])
  })
})
