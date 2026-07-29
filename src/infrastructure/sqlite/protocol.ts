import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type { SqlValue }

export type SqlRow = Record<string, SqlValue>

export interface SqlStatement {
  readonly sql: string
  readonly bind?: readonly SqlValue[]
}

/**
 * The messages crossing into the database worker.
 *
 * Deliberately just "run this SQL": the worker holds no knowledge of chess,
 * PGN, or archives. Everything that understands the domain stays on the other
 * side of this boundary, where it can be tested without a worker at all.
 */
export type WorkerRequest =
  | { readonly id: number; readonly kind: 'open'; readonly filename: string }
  | { readonly id: number; readonly kind: 'exec'; readonly statements: readonly SqlStatement[] }
  | { readonly id: number; readonly kind: 'select'; readonly statement: SqlStatement }

/**
 * Where the database ended up living.
 *
 * OPFS grants its exclusive access handles to one connection per origin, so a
 * second tab genuinely cannot have them. That is reported rather than hidden,
 * because "your saves will not be kept" and "another tab has the library" call
 * for different words to the user.
 */
export type StorageStatus =
  | { readonly kind: 'persistent' }
  | { readonly kind: 'memory'; readonly reason: 'no-opfs' | 'another-tab' }

export type WorkerResponse =
  | {
      readonly id: number
      readonly ok: true
      readonly rows: SqlRow[]
      readonly storage: StorageStatus
    }
  | { readonly id: number; readonly ok: false; readonly error: string }
