import type { ArchivedGame, ArchivedGameSummary } from '@domain/archive/ArchivedGame'

/**
 * Whether what you save will still be there tomorrow.
 *
 * Expressed in the application's own terms rather than the storage
 * technology's, so a future server-backed library can answer it too.
 */
export type LibraryDurability =
  | { readonly kind: 'durable' }
  | { readonly kind: 'temporary'; readonly reason: 'no-storage' | 'another-tab' }

/** What a search term is matched against. */
export type SearchField = 'all' | 'player' | 'event' | 'year'

export const SEARCH_FIELDS: readonly { id: SearchField; label: string }[] = [
  { id: 'all', label: 'Anything' },
  { id: 'player', label: 'Player' },
  { id: 'event', label: 'Event' },
  { id: 'year', label: 'Year' },
]

export interface ArchiveQuery {
  readonly search?: string
  /** Defaults to `all`. */
  readonly field?: SearchField
  readonly limit?: number
  readonly offset?: number
}

export interface ArchivePage {
  readonly games: readonly ArchivedGameSummary[]
  readonly total: number
}

export type ImportProgress = (done: number, total: number) => void

export interface GameArchive {
  list(query?: ArchiveQuery): Promise<ArchivePage>
  load(id: string): Promise<ArchivedGame>
  /**
   * Adds games from raw PGN text. Returns how many were actually stored, which
   * is fewer than were supplied when some are already in the library.
   */
  importPgn(pgnText: string, sourceName: string, onProgress?: ImportProgress): Promise<number>
  /** Resolves once the library is open, so the UI can warn before a game is lost. */
  durability(): Promise<LibraryDurability>
}
