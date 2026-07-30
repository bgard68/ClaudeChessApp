import type { ArchivedGame, ArchivedGameSummary } from '@domain/archive/ArchivedGame'

/**
 * Whether what you save will still be there tomorrow.
 *
 * Expressed in the application's own terms rather than the storage
 * technology's, so a future server-backed library can answer it too.
 */
export type LibraryDurability =
  /**
   * Stored on disk and still there after a restart. `evictable` when the browser
   * has not promised to keep it: storage works, but the origin is best-effort and
   * may be cleared under disk pressure. Worth distinguishing, because the games
   * at risk are the ones nobody can get back.
   */
  | { readonly kind: 'durable'; readonly evictable: boolean }
  | { readonly kind: 'temporary'; readonly reason: 'no-storage' | 'another-tab' }

/** What a search term is matched against. */
export type SearchField = 'all' | 'player' | 'event' | 'year'

export const SEARCH_FIELDS: readonly { id: SearchField; label: string }[] = [
  { id: 'all', label: 'Anything' },
  { id: 'player', label: 'Player' },
  { id: 'event', label: 'Event' },
  { id: 'year', label: 'Year' },
]

/** Columns the list can be ordered by. */
export type SortColumn = 'event' | 'players' | 'result' | 'year' | 'moves'
export type SortDirection = 'asc' | 'desc'

export interface ArchiveQuery {
  readonly search?: string
  /** Defaults to `all`. */
  readonly field?: SearchField
  /**
   * Restricts to one player's games, under every spelling of their name.
   * Takes precedence over `search`.
   */
  readonly playerId?: string
  /** Filters, each optional and combined with AND. */
  readonly event?: string
  readonly result?: string
  readonly yearFrom?: number
  readonly yearTo?: number
  readonly sort?: SortColumn
  readonly direction?: SortDirection
  readonly limit?: number
  readonly offset?: number
}

/**
 * Longest event list a filter should offer.
 *
 * Exported rather than kept in the adapter because the screen has to say
 * "250+" instead of "250" once the list has been cut off, and this is the
 * number that decides where the cut falls.
 */
export const MAX_EVENT_OPTIONS = 250

/** What the filter controls need to offer, derived from the games held. */
export interface ArchiveFacets {
  readonly totalGames: number
  readonly events: readonly { readonly name: string; readonly games: number }[]
  readonly firstYear: number | null
  readonly lastYear: number | null
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
  /**
   * Why the library may be missing games right now: the bundled sources that
   * could not be read on the last attempt. Empty when the library is whole.
   * The screen shows these instead of advising an import that would not help.
   */
  readonly failures: readonly string[]

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
   * Every game you played or imported, as one PGN file.
   *
   * The bundled collections are deliberately left out: they are shipped with the
   * app and re-importable, and this exists for the games that are not. Storage
   * permission reduces the chance of losing them; a file you hold is the only
   * thing that actually recovers from a cleared profile.
   */
  exportPgn(): Promise<string>

  /**
   * Players whose name begins with `prefix`, most-played first.
   *
   * Exists because the same person is spelled several ways in these archives,
   * so picking a player from a list is the only reliable way to ask for all of
   * their games.
   */
  suggestPlayers(prefix: string, limit?: number): Promise<readonly PlayerSuggestion[]>

  /** Values the filters can offer, and the shape of the library as a whole. */
  facets(): Promise<ArchiveFacets>
}
