import type {
  ArchiveQuery,
  ArchiveScope,
  PlayerSuggestion,
  SearchField,
  SortColumn,
  SortDirection,
} from '@application/ports/GameArchive'
import type { ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import { RESULT_OPTIONS, type FilterValues } from './components/ArchiveFilters'

/** How many games one page of the list holds. */
export const PAGE_SIZE = 40

/**
 * Everything that decides which games the archive is being asked for.
 *
 * Kept as one value rather than a dozen loose variables because they change
 * together: any edit to a question restarts the list, and the rule for what
 * "restarts" means belongs next to the question rather than beside each
 * control that can change it.
 */
export interface QuestionState {
  readonly search: string
  readonly field: SearchField
  readonly chosen: PlayerSuggestion | null
  readonly filters: FilterValues
  readonly sort: SortColumn | null
  readonly direction: SortDirection
  readonly offset: number
  readonly limit: number
}

export const NO_QUESTION = (filters: FilterValues): QuestionState => ({
  search: '',
  field: 'all',
  chosen: null,
  filters,
  sort: null,
  direction: 'asc',
  offset: 0,
  limit: PAGE_SIZE,
})

/**
 * The question minus the text being typed into it.
 *
 * The live search term is deliberately not part of this: the query runs on
 * the debounced value, so taking the whole question here would invite
 * re-querying on every keystroke.
 */
export type QueryFields = Omit<QuestionState, 'search'>

/**
 * Turns the screen's controls into a query the archive understands.
 *
 * The filter values are strings because they come from form controls, and an
 * empty one means "not filtering" rather than "filter on the empty string" —
 * sending `event: ''` would ask for games whose event is blank and find none.
 * Years cross from text to number here for the same reason.
 */
export function toArchiveQuery(
  fields: QueryFields,
  scope: ArchiveScope,
  debouncedSearch: string,
): ArchiveQuery {
  const { field, chosen, filters, sort, direction, offset, limit } = fields

  return {
    search: debouncedSearch,
    field,
    playerId: chosen?.id,
    scope,
    event: filters.event === '' ? undefined : filters.event,
    result: filters.result === '' ? undefined : filters.result,
    yearFrom: filters.yearFrom === '' ? undefined : Number(filters.yearFrom),
    yearTo: filters.yearTo === '' ? undefined : Number(filters.yearTo),
    sort: sort ?? undefined,
    direction,
    offset,
    limit,
  }
}

/**
 * Adds a page of results to the ones already shown.
 *
 * Offset zero means this is a first page and replaces what came before —
 * a new question, not more of the old one. Appending there instead would
 * leave the previous question's games above the new question's.
 */
export function accumulatePages<T>(
  current: readonly T[],
  incoming: readonly T[],
  offset: number,
): readonly T[] {
  return offset === 0 ? incoming : [...current, ...incoming]
}

/** A new question starts the list over at its first page. */
export function restartedAt(question: QuestionState): QuestionState {
  return { ...question, offset: 0, limit: PAGE_SIZE }
}

/**
 * What clicking a column header does.
 *
 * Clicking the column already sorted reverses it; clicking a new one starts it
 * the way that column reads best — years newest first, names A to Z. Either
 * way the list restarts, because page two of the old order is not page two of
 * the new one.
 */
export function sortedBy(
  question: QuestionState,
  column: SortColumn,
  initial: SortDirection,
): QuestionState {
  const flipped = question.sort === column
  return restartedAt({
    ...question,
    sort: column,
    direction: flipped ? (question.direction === 'asc' ? 'desc' : 'asc') : initial,
  })
}

/**
 * Where the arrow keys move the selection.
 *
 * Returns the id to select, or null when there is nothing to move to. With
 * nothing selected yet, down enters at the top and up enters at the bottom —
 * so the first press always lands somewhere. Both ends hold rather than wrap:
 * a list that jumps from the last row to the first reads as a glitch.
 */
export function nextSelection(
  games: readonly ArchivedGameSummary[],
  selectedId: string | null,
  key: 'ArrowDown' | 'ArrowUp',
): string | null {
  if (games.length === 0) return null

  const delta = key === 'ArrowDown' ? 1 : -1
  const index = games.findIndex((game) => game.id === selectedId)

  if (index === -1) return (delta > 0 ? games[0] : games[games.length - 1])!.id

  return games[Math.max(0, Math.min(games.length - 1, index + delta))]!.id
}

/** One narrowing currently in force, and what removing it leaves behind. */
export interface ActiveChip {
  readonly key: string
  readonly label: string
  /** The question with this one narrowing lifted. */
  readonly without: QuestionState
}

/**
 * The narrowings in force, each dismissible where it is shown.
 *
 * They all apply together — the chips sitting in one row is what says so.
 * Each carries the question it would leave rather than a callback, so the
 * list can be checked without running the screen.
 */
export function activeChips(
  question: QuestionState,
  debouncedSearch: string,
): readonly ActiveChip[] {
  const { chosen, filters } = question
  const chips: ActiveChip[] = []
  const clearing = (next: Partial<QuestionState>): QuestionState =>
    restartedAt({ ...question, ...next })

  // A chosen player supersedes the text that found them, so only one of the
  // two is ever shown.
  if (chosen === null && debouncedSearch.trim() !== '') {
    chips.push({
      key: 'search',
      label: `Search: “${debouncedSearch.trim()}”`,
      without: clearing({ search: '' }),
    })
  }

  if (chosen !== null) {
    chips.push({
      key: 'player',
      label: `Player: ${chosen.name}`,
      without: clearing({ chosen: null, search: '' }),
    })
  }

  if (filters.event !== '') {
    chips.push({
      key: 'event',
      label: `Event: ${filters.event}`,
      without: clearing({ filters: { ...filters, event: '' } }),
    })
  }

  if (filters.result !== '') {
    chips.push({
      key: 'result',
      label:
        RESULT_OPTIONS.find((option) => option.value === filters.result)?.label ??
        filters.result,
      without: clearing({ filters: { ...filters, result: '' } }),
    })
  }

  // One chip for both ends: a range is a single narrowing, and clearing half
  // of it leaves a filter nobody asked for.
  if (filters.yearFrom !== '' || filters.yearTo !== '') {
    const from = filters.yearFrom === '' ? '…' : filters.yearFrom
    const to = filters.yearTo === '' ? '…' : filters.yearTo
    chips.push({
      key: 'years',
      label: `Years: ${from}–${to}`,
      without: clearing({ filters: { ...filters, yearFrom: '', yearTo: '' } }),
    })
  }

  return chips
}
