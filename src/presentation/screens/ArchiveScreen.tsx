import { useEffect, useRef, useState } from 'react'
import { displayYear, type ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import { useFederations } from '../hooks/useFederations'
import {
  SEARCH_FIELDS,
  type ArchiveFacets,
  type ArchivePage,
  type PlayerSuggestion,
  type SearchField,
  type SortColumn,
  type SortDirection,
} from '@application/ports/GameArchive'
import { describeOversizeImport } from '@application/importLimits'
import { PlayerSearch } from '../components/PlayerSearch'
import {
  ArchiveFilters,
  isFiltering,
  NO_FILTERS,
  type FilterValues,
} from '../components/ArchiveFilters'
import { useDebounced } from '../hooks/useDebounced'
import { useServices } from '../ServicesContext'

const PAGE_SIZE = 40

interface ImportState {
  readonly done: number
  readonly total: number
  readonly name: string
}

const SEARCH_PLACEHOLDERS: Readonly<Record<SearchField, string>> = {
  all: 'Search players, events, and years',
  player: 'Search by player name',
  event: 'Search by tournament or match',
  year: 'Year or range, e.g. 1972 or 1960-1970',
}

const FIELD_NAMES: Readonly<Record<SearchField, string>> = {
  all: '',
  player: 'players',
  event: 'events',
  year: 'years',
}

/**
 * The sortable columns, in the order they appear.
 *
 * `initial` is the direction the *first* click applies: alphabetical columns
 * read forwards, but nobody opening a chess archive by year wants 1886 first.
 */
const COLUMNS: readonly {
  readonly id: SortColumn
  readonly label: string
  readonly className: string
  readonly initial: SortDirection
}[] = [
  { id: 'players', label: 'Players', className: 'col-players', initial: 'asc' },
  { id: 'event', label: 'Event', className: 'col-event', initial: 'asc' },
  { id: 'result', label: 'Result', className: 'col-result', initial: 'asc' },
  { id: 'year', label: 'Year', className: 'col-year', initial: 'desc' },
  { id: 'moves', label: 'Moves', className: 'col-moves', initial: 'desc' },
]

/** States plainly what is on screen and why, rather than leaving a bare list. */
function describeResults(
  total: number,
  search: string,
  field: SearchField,
  isLoading: boolean,
  filtered: boolean,
): string {
  if (isLoading) return 'Searching…'

  const games = `${total.toLocaleString()} game${total === 1 ? '' : 's'}`
  if (search.trim() === '') return filtered ? `Filtered · ${games}` : `All games · ${games}`

  const scope = field === 'all' ? '' : ` in ${FIELD_NAMES[field]}`
  return total === 0
    ? `No games matching “${search}”${scope}`
    : `${games} matching “${search}”${scope}`
}

/** One side of a game: title and federation when known, name, rating when recorded. */
function Player({
  name,
  elo,
  lookup,
}: {
  name: string
  elo: number | null
  lookup: (name: string) => { code: string; country: string; title: string | null } | null
}) {
  const federation = lookup(name)

  return (
    <span className="player">
      {federation?.title ? <span className="player__title">{federation.title}</span> : null}
      {federation !== null ? (
        <abbr className="player__flag" title={federation.country}>
          {federation.code}
        </abbr>
      ) : null}
      <span className="player__name">{name}</span>
      {elo !== null ? <span className="player__elo">{elo}</span> : null}
    </span>
  )
}

interface ArchiveScreenProps {
  readonly onOpenGame: (id: string) => void
  readonly onBack: () => void
}

export function ArchiveScreen({ onOpenGame, onBack }: ArchiveScreenProps) {
  const { services } = useServices()
  const lookup = useFederations()
  const [search, setSearch] = useState('')
  // The box updates instantly; the query waits for a pause in typing.
  const query = useDebounced(search)
  const [field, setField] = useState<SearchField>('all')
  // Set when a player is chosen from the suggestions; clears on any new typing.
  const [chosen, setChosen] = useState<PlayerSuggestion | null>(null)
  const [filters, setFilters] = useState<FilterValues>(NO_FILTERS)
  // Null until a header is clicked, which leaves the default relevance
  // ordering in place rather than imposing an arbitrary column on arrival.
  const [sort, setSort] = useState<SortColumn | null>(null)
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [facets, setFacets] = useState<ArchiveFacets | null>(null)
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ArchivePage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [importing, setImporting] = useState<ImportState | null>(null)
  const [lastImport, setLastImport] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // Re-read after an import: it can add both events and years to filter by.
  useEffect(() => {
    let cancelled = false

    services.archive
      .facets()
      .then((found) => {
        if (!cancelled) setFacets(found)
      })
      .catch(() => {
        if (!cancelled) setFacets(null)
      })

    return () => {
      cancelled = true
    }
  }, [services.archive, reloadToken])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    services.archive
      .list({
        search: query,
        field,
        playerId: chosen?.id,
        event: filters.event === '' ? undefined : filters.event,
        result: filters.result === '' ? undefined : filters.result,
        yearFrom: filters.yearFrom === '' ? undefined : Number(filters.yearFrom),
        yearTo: filters.yearTo === '' ? undefined : Number(filters.yearTo),
        sort: sort ?? undefined,
        direction,
        offset,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return
        setPage(result)
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
  }, [services.archive, query, field, chosen, filters, sort, direction, offset, reloadToken])

  const importFile = async (file: File) => {
    setError(null)

    // Checked before the file is read, not after: reading it is the part that
    // freezes the tab, so a message afterwards would arrive too late to help.
    const tooLarge = describeOversizeImport(file)
    if (tooLarge !== null) {
      setError(tooLarge)
      return
    }

    setImporting({ done: 0, total: 0, name: file.name })
    try {
      const added = await services.archive.importPgn(
        await file.text(),
        file.name,
        // Collections run to a hundred thousand games; without this the app
        // looks frozen for minutes.
        (done, total) => setImporting({ done, total, name: file.name }),
      )
      setOffset(0)
      setReloadToken((token) => token + 1)
      setLastImport(added)
      if (added === 0) {
        setError(`Nothing new in ${file.name} — those games are already in your library.`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(null)
    }
  }

  const deleteGame = async (id: string) => {
    try {
      await services.store.remove(id)
      setReloadToken((token) => token + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /** Same column toggles direction; a new one starts the way it reads best. */
  const applySort = (column: SortColumn, initial: SortDirection) => {
    if (sort === column) {
      setDirection(direction === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(column)
      setDirection(initial)
    }
    setOffset(0)
  }

  const changeFilters = (next: FilterValues) => {
    setFilters(next)
    setOffset(0)
  }

  const resetFilters = () => {
    setFilters(NO_FILTERS)
    setSort(null)
    setOffset(0)
  }

  const games = page?.games ?? []
  const total = page?.total ?? 0
  const filtered = isFiltering(filters)
  // The library holding nothing at all is a different problem from a filter
  // excluding everything, and the two need different advice.
  const libraryIsEmpty = facets !== null && facets.totalGames === 0

  return (
    <div className="screen screen--archive">
      <header className="archive__header">
        <button type="button" className="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Championship games</h1>
        <div className="archive__tools">
          {/* Field and scope share one bordered container, so they read as a
              single control rather than two that happen to sit together. */}
          <div className="search-bar">
            <input
              type="search"
              className="search-bar__input"
              placeholder={SEARCH_PLACEHOLDERS[field]}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setChosen(null)
                setOffset(0)
              }}
            />
            <select
              className="search-bar__scope"
              aria-label="Search within"
              value={field}
              onChange={(event) => {
                setField(event.target.value as SearchField)
                setOffset(0)
              }}
            >
              {SEARCH_FIELDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {field === 'player' && chosen === null ? (
              <PlayerSearch
                term={search}
                onChoose={(player) => {
                  setChosen(player)
                  setSearch(player.name)
                  setOffset(0)
                }}
              />
            ) : null}
          </div>
          <button type="button" className="button" onClick={() => fileInput.current?.click()}>
            Import PGN
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pgn,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importFile(file)
              event.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="archive__body">
        <ArchiveFilters
          facets={facets}
          values={filters}
          onChange={changeFilters}
          onReset={resetFilters}
          matched={total}
          isLoading={isLoading}
        />

        <section className="archive__results">
          <h2 className="archive__heading">
            {chosen !== null
              ? `${total.toLocaleString()} games by ${chosen.name}`
              : describeResults(total, query, field, isLoading || query !== search, filtered)}
          </h2>

          {importing !== null ? (
            <p className="notice">
              {importing.total === 0
                ? `Reading ${importing.name}…`
                : `Importing ${importing.name} — ${importing.done.toLocaleString()} of ${importing.total.toLocaleString()} games`}
            </p>
          ) : null}

          {lastImport !== null && lastImport > 0 && importing === null ? (
            <p className="notice">Added {lastImport.toLocaleString()} games.</p>
          ) : null}

          {error ? <p className="notice notice--error">{error}</p> : null}

          {!isLoading && games.length === 0 ? (
            libraryIsEmpty ? (
              <p className="notice">
                No games in the library yet. Use <strong>Import PGN</strong> to load a
                game file from your computer.
              </p>
            ) : (
              <p className="notice">
                No games match what you asked for.
                {filtered ? (
                  <>
                    {' '}
                    <button type="button" className="link-button" onClick={resetFilters}>
                      Clear the filters
                    </button>{' '}
                    to see the rest.
                  </>
                ) : null}
              </p>
            )
          ) : null}

          {games.length > 0 ? (
            <div className="game-table-scroll">
              <table className="game-table">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.id}
                        scope="col"
                        className={column.className}
                        aria-sort={
                          sort === column.id
                            ? direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button
                          type="button"
                          className="game-table__sort"
                          onClick={() => applySort(column.id, column.initial)}
                        >
                          <span>{column.label}</span>
                          <span className="game-table__arrow" aria-hidden="true">
                            {sort === column.id ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => (
                    <GameRow
                      key={game.id}
                      game={game}
                      onOpen={() => onOpenGame(game.id)}
                      onDelete={
                        game.origin === 'played' ? () => void deleteGame(game.id) : undefined
                      }
                      lookup={lookup}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {total > PAGE_SIZE ? (
            <nav className="pager">
              <button
                type="button"
                className="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <button
                type="button"
                className="button"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  )
}

/** How each result tag is drawn, and what it actually means when read aloud. */
const RESULT_PILLS: Readonly<
  Record<string, { readonly kind: string; readonly label: string; readonly title: string }>
> = {
  '1-0': { kind: 'white', label: '1–0', title: 'White won' },
  '0-1': { kind: 'black', label: '0–1', title: 'Black won' },
  '1/2-1/2': { kind: 'draw', label: '½–½', title: 'Drawn' },
}

function ResultPill({ result }: { result: string }) {
  const pill = RESULT_PILLS[result]
  if (pill === undefined) {
    return (
      <span className="result-pill result-pill--unknown" title="No result recorded">
        —
      </span>
    )
  }

  return (
    <span className={`result-pill result-pill--${pill.kind}`} title={pill.title}>
      {pill.label}
    </span>
  )
}

function GameRow({
  game,
  onOpen,
  onDelete,
  lookup,
}: {
  game: ArchivedGameSummary
  onOpen: () => void
  lookup: (name: string) => { code: string; country: string; title: string | null } | null
  /** Only your own games can be removed; history is not yours to delete. */
  onDelete?: () => void
}) {
  // Round tags are frequently placeholders, and "round -" is worse than silence.
  const round = game.round === '-' || game.round === '?' || game.round === '' ? null : game.round
  const detail = [game.site, round === null ? null : `round ${round}`]
    .filter((part) => part !== null)
    .join(' · ')

  return (
    <tr className="game-table__row" onClick={onOpen}>
      <td className="col-players">
        {/* The row is clickable for the mouse; this button is what a keyboard
            and a screen reader actually reach. */}
        <button
          type="button"
          className="game-table__open"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          {game.nickname !== null ? (
            <span className="game-table__nickname">{game.nickname}</span>
          ) : null}
          <span className="game-table__pair">
            <Player name={game.white} elo={game.whiteElo} lookup={lookup} />
            <span className="game-table__versus">vs</span>
            <Player name={game.black} elo={game.blackElo} lookup={lookup} />
          </span>
          {game.origin === 'played' || game.hasRecordedClocks ? (
            <span className="game-table__badges">
              {game.origin === 'played' ? <span className="badge">yours</span> : null}
              {game.hasRecordedClocks ? (
                <span className="badge badge--recorded">clocks</span>
              ) : null}
            </span>
          ) : null}
        </button>
      </td>
      <td className="col-event">
        <span className="game-table__event">{game.event}</span>
        {detail !== '' ? <span className="game-table__detail">{detail}</span> : null}
      </td>
      <td className="col-result">
        <ResultPill result={game.result} />
      </td>
      <td className="col-year">{displayYear(game.date)}</td>
      <td className="col-moves">{game.moveCount}</td>
      <td className="col-actions">
        {onDelete ? (
          <button
            type="button"
            className="button button--danger button--small"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`Delete ${game.white} vs ${game.black}`}
          >
            Delete
          </button>
        ) : null}
      </td>
    </tr>
  )
}
