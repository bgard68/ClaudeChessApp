import { useCallback, useEffect, useState } from 'react'
import type {
  ArchiveFacets,
  ArchiveScope,
  PlayerSuggestion,
  SearchField,
  SortColumn,
  SortDirection,
} from '@application/ports/GameArchive'
import type { ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import { NO_FILTERS, isFiltering, type FilterValues } from '../components/ArchiveFilters'
import {
  NO_QUESTION,
  PAGE_SIZE,
  accumulatePages,
  activeChips,
  restartedAt,
  sortedBy,
  toArchiveQuery,
  type ActiveChip,
  type QuestionState,
} from '../archiveQuery'
import { useDebounced } from './useDebounced'
import { useServices } from '../ServicesContext'

export interface ArchiveQueryResult {
  /** What is being asked, and what came back. */
  readonly question: QuestionState
  /**
   * The term the results actually answer, which trails what is in the box by
   * one debounce. The screen compares the two to know the list is stale.
   */
  readonly settledSearch: string
  readonly games: readonly ArchivedGameSummary[]
  readonly total: number
  readonly facets: ArchiveFacets | null
  readonly isLoading: boolean
  readonly error: string | null

  /** Derived, so the screen does not recompute them per render. */
  readonly chips: readonly ActiveChip[]
  readonly isFiltered: boolean
  readonly libraryIsEmpty: boolean
  readonly hasMore: boolean

  /** Changing the question. Each restarts the list where that is the meaning. */
  readonly setSearch: (search: string) => void
  readonly setField: (field: SearchField) => void
  readonly choosePlayer: (player: PlayerSuggestion) => void
  readonly setFilters: (filters: FilterValues) => void
  readonly applySort: (column: SortColumn, initial: SortDirection) => void
  readonly reset: () => void
  readonly apply: (question: QuestionState) => void

  /** Asking for more of the same answer, rather than a different one. */
  readonly loadMore: () => void
  readonly loadAll: () => void

  /** Re-ask from the top, after an import, a delete, or a failure. */
  readonly reload: () => void
  readonly clearError: () => void
  readonly setError: (message: string) => void
}

/**
 * Owns the question the archive screen is asking, and the answer.
 *
 * Extracted from the screen because the two were interleaved with the
 * selection, the preview and the import controls in one 1,000-line component,
 * where the rules for restarting the list were spread across every handler
 * that could change a filter. The decisions themselves live in
 * `archiveQuery.ts` as plain functions, so they can be tested without a
 * database or a browser; what is left here is the wiring.
 */
export function useArchiveQuery(scope: ArchiveScope): ArchiveQueryResult {
  const { services } = useServices()

  const [question, setQuestion] = useState<QuestionState>(() => NO_QUESTION(NO_FILTERS))
  // The box updates instantly; the query waits for a pause in typing.
  const debouncedSearch = useDebounced(question.search)

  const [games, setGames] = useState<readonly ArchivedGameSummary[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<ArchiveFacets | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  // Re-read after an import: it can add both events and years to filter by.
  useEffect(() => {
    let cancelled = false

    services.archive
      .facets(scope)
      .then((found) => {
        if (!cancelled) setFacets(found)
      })
      .catch(() => {
        if (!cancelled) setFacets(null)
      })

    return () => {
      cancelled = true
    }
  }, [services.archive, scope, reloadToken])

  const { field, chosen, filters, sort, direction, offset, limit } = question

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    services.archive
      .list(
        toArchiveQuery({ field, chosen, filters, sort, direction, offset, limit }, scope, debouncedSearch),
      )
      .then((result) => {
        if (cancelled) return
        setGames((current) => accumulatePages(current, result.games, offset))
        setTotal(result.total)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    services.archive,
    scope,
    debouncedSearch,
    field,
    chosen,
    filters,
    sort,
    direction,
    offset,
    limit,
    reloadToken,
  ])

  const apply = useCallback((next: QuestionState) => setQuestion(next), [])

  const setSearch = useCallback((search: string) => {
    // Typing something new abandons a player picked from the suggestions —
    // the two are alternatives, and keeping both would filter by a player the
    // box no longer names.
    setQuestion((current) => restartedAt({ ...current, search, chosen: null }))
  }, [])

  const setField = useCallback((field: SearchField) => {
    setQuestion((current) => restartedAt({ ...current, field }))
  }, [])

  const choosePlayer = useCallback((player: PlayerSuggestion) => {
    setQuestion((current) =>
      restartedAt({ ...current, chosen: player, search: player.name }),
    )
  }, [])

  const setFilters = useCallback((filters: FilterValues) => {
    setQuestion((current) => restartedAt({ ...current, filters }))
  }, [])

  const applySort = useCallback((column: SortColumn, initial: SortDirection) => {
    setQuestion((current) => sortedBy(current, column, initial))
  }, [])

  const reset = useCallback(() => {
    setQuestion((current) => restartedAt({ ...current, filters: NO_FILTERS, sort: null }))
  }, [])

  /*
   * More of the same answer: the question does not change, only where the
   * next page starts — so the results append rather than replacing.
   *
   * Both page from `games.length` rather than from the previous offset,
   * because "load all" leaves a limit that is not a page size, and adding
   * that to the offset would skip past everything it just loaded.
   */
  const loadMore = useCallback(() => {
    setQuestion((current) => ({ ...current, limit: PAGE_SIZE, offset: games.length }))
  }, [games.length])

  // One request for everything left; the list keeps what it already has and
  // the rest arrives behind it.
  const loadAll = useCallback(() => {
    setQuestion((current) => ({
      ...current,
      limit: total - games.length,
      offset: games.length,
    }))
  }, [games.length, total])

  /**
   * Asks the archive again, from the top.
   *
   * The archive retries a failed first load on its next query, so bumping the
   * token is all a recovery takes — the same mechanism an import uses to
   * refresh once new games have landed.
   */
  const reload = useCallback(() => {
    setError(null)
    setQuestion((current) => restartedAt(current))
    setReloadToken((token) => token + 1)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    question,
    settledSearch: debouncedSearch,
    games,
    total,
    facets,
    isLoading,
    error,
    chips: activeChips(question, debouncedSearch),
    // The filters alone, not the search term: this decides between "Filtered"
    // and "All games" in the summary line, which only speaks when nothing has
    // been searched for.
    isFiltered: isFiltering(filters),
    // The library holding nothing at all is a different problem from a filter
    // excluding everything, and the two need different advice.
    libraryIsEmpty: facets !== null && facets.totalGames === 0,
    hasMore: games.length < total,
    setSearch,
    setField,
    choosePlayer,
    setFilters,
    applySort,
    reset,
    apply,
    loadMore,
    loadAll,
    reload,
    clearError,
    setError,
  }
}

export { PAGE_SIZE }
