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
  /**
   * Restricts to one player's games, under every spelling of their name.
   * Takes precedence over `search`.
   */
  readonly playerId?: string
  readonly limit?: number
  readonly offset?: number
}

/** A player as one identity, with every spelling of their name folded in. */
export interface PlayerSuggestion {
  readonly id: string
  readonly name: string
  readonly games: number
  readonly firstYear: number | null
  readonly lastYear: number | null
  readonly peakElo: number | null
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

  /**
   * Players whose name begins with `prefix`, most-played first.
   *
   * Exists because the same person is spelled several ways in these archives,
   * so picking a player from a list is the only reliable way to ask for all of
   * their games.
   */
  suggestPlayers(prefix: string, limit?: number): Promise<readonly PlayerSuggestion[]>
}
