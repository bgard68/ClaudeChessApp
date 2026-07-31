import { useEffect, useRef, useState } from 'react'
import {
  displayYear,
  type ArchivedGame,
  type ArchivedGameSummary,
  type RecordedMove,
} from '@domain/archive/ArchivedGame'
import { STARTING_FEN } from '@domain/chess/Position'
import { useFederations } from '../hooks/useFederations'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  SEARCH_FIELDS,
  type SearchField,
  type SortColumn,
  type SortDirection,
} from '@application/ports/GameArchive'
import { describeOversizeImport } from '@application/importLimits'
import { AppIcon } from '../components/AppIcon'
import { ChessBoardView } from '../components/ChessBoardView'
import { PlayerSearch } from '../components/PlayerSearch'
import { ScreenHeader } from '../components/ScreenHeader'
import { ArchiveFilters } from '../components/ArchiveFilters'
import { PAGE_SIZE, nextSelection } from '../archiveQuery'
import { useArchiveQuery } from '../hooks/useArchiveQuery'
import { useServices } from '../ServicesContext'

/** Below this, there is no room for a third column and rows open the replay
 *  directly; at or above it, a click previews and a second click replays. */
const PREVIEW_LAYOUT = '(min-width: 1100px)'

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

/**
 * States plainly what is on screen and why, rather than leaving a bare list.
 *
 * Exported for its own tests — the screen reaches these states only after the
 * library has answered, which needs a database.
 */
export function describeResults(
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

type FederationLookup = (
  name: string,
) => { code: string; country: string; title: string | null } | null

/** One side of a game: title and federation when known, name, rating when recorded. */
function Player({
  name,
  elo,
  lookup,
}: {
  name: string
  elo: number | null
  lookup: FederationLookup
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
  /**
   * Which half of the library this screen is. `reference` is the bundled
   * collections, read-only; `mine` is what you played or imported, where
   * importing, exporting and deleting apply and nowhere else.
   */
  readonly scope: 'reference' | 'mine'
  readonly onOpenGame: (id: string) => void
}

export function ArchiveScreen({ scope, onOpenGame }: ArchiveScreenProps) {
  const { services } = useServices()
  const lookup = useFederations()

  /*
   * The question being asked of the library, and the answer, live in a hook
   * of their own — search, filters, sort and paging change together, and the
   * rule for what restarts the list belongs beside the question rather than
   * repeated in every control that can change it.
   */
  const archive = useArchiveQuery(scope)
  const {
    games,
    total,
    facets,
    isLoading,
    error,
    chips,
    settledSearch,
    isFiltered,
    libraryIsEmpty,
    hasMore,
  } = archive
  const { search, field, chosen, sort, direction } = archive.question

  const [importing, setImporting] = useState<ImportState | null>(null)
  const [lastImport, setLastImport] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const menu = useRef<HTMLDivElement | null>(null)

  // Master/detail: which row is chosen, and the full game behind it.
  const hasPane = useMediaQuery(PREVIEW_LAYOUT)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewGame, setPreviewGame] = useState<ArchivedGame | null>(null)
  const selectedRow = useRef<HTMLTableRowElement | null>(null)

  // A narrowed list can drop the selected game; the preview must not outlive it.
  useEffect(() => {
    if (selectedId !== null && !games.some((game) => game.id === selectedId)) {
      setSelectedId(null)
      setPreviewGame(null)
    }
  }, [games, selectedId])

  useEffect(() => {
    if (!hasPane || selectedId === null) return
    let cancelled = false

    services.archive
      .load(selectedId)
      .then((game) => {
        if (!cancelled) setPreviewGame(game)
      })
      .catch(() => {
        if (!cancelled) setPreviewGame(null)
      })

    return () => {
      cancelled = true
    }
  }, [services.archive, selectedId, hasPane])

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // The ⋯ menu closes the way menus close: outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (menu.current !== null && !menu.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  /**
   * Downloads the games you played or imported as one PGN file.
   *
   * The only recovery from a cleared profile: storage permission makes eviction
   * unlikely, but nothing inside the browser survives the user deleting site
   * data, and a file on disk does.
   */
  const exportGames = async () => {
    archive.clearError()
    try {
      const pgn = await services.archive.exportPgn()
      if (pgn === '') {
        archive.setError('Nothing to export yet — no games of your own have been saved or imported.')
        return
      }

      const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'my-chess-games.pgn'
      link.click()
      // Released on the next turn of the event loop: revoking immediately can
      // cancel the download before the browser has taken the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (cause) {
      archive.setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const importFile = async (file: File) => {
    archive.clearError()

    // Checked before the file is read, not after: reading it is the part that
    // freezes the tab, so a message afterwards would arrive too late to help.
    const tooLarge = describeOversizeImport(file)
    if (tooLarge !== null) {
      archive.setError(tooLarge)
      return
    }

    setImporting({ done: 0, total: 0, name: file.name })
    try {
      const added = await services.archive.importPgn(
        await file.text(),
        file.name,
        // Collections run to a hundred thousand games; without this the app
        // looks frozen for minutes.
        (done, totalGames) => setImporting({ done, total: totalGames, name: file.name }),
      )
      archive.reload()
      setLastImport(added)
      if (added === 0) {
        archive.setError(`Nothing new in ${file.name} — those games are already in your library.`)
      }
    } catch (cause) {
      archive.setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setImporting(null)
    }
  }

  const deleteGame = async (id: string) => {
    try {
      await services.store.remove(id)
      archive.reload()
    } catch (cause) {
      archive.setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /**
   * What clicking a row means depends on the layout: with a preview pane the
   * first click selects and the second opens; without one there is nothing to
   * select into, so a click just opens the replay.
   */
  const activate = (id: string) => {
    if (!hasPane || selectedId === id) {
      onOpenGame(id)
      return
    }
    setSelectedId(id)
  }

  /** Arrow keys browse, Enter replays — a list this long earns keyboard legs. */
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && selectedId !== null) {
      event.preventDefault()
      onOpenGame(selectedId)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    const next = nextSelection(games, selectedId, event.key)
    if (next === null) return

    event.preventDefault()
    setSelectedId(next)
  }

  const selected = games.find((game) => game.id === selectedId) ?? null

  return (
    <div className="screen screen--archive phase3-archive phase46-archive">
      <ScreenHeader
        kicker={scope === 'mine' ? 'Your collection' : 'Reference library'}
        title={scope === 'mine' ? 'My games' : 'Championship games'}
        description={
          scope === 'mine'
            ? 'Games you have played or imported. These are the only ones you can export or delete.'
            : 'Every world championship game the app ships with. Search, filter, preview, and replay.'
        }
        metrics={
          <div className="phase46-archive-metrics" aria-live="polite">
            <span><strong>{isLoading ? '—' : total.toLocaleString()}</strong><small>games found</small></span>
            <span><strong>{games.length.toLocaleString()}</strong><small>loaded</small></span>
            <span><strong>{chips.length}</strong><small>active filters</small></span>
          </div>
        }
        actions={
          <div className="archive__tools">
            {/* Field and scope share one bordered container, so they read as a
                single control rather than two that happen to sit together. */}
            <div className="search-bar">
              <input
                type="search"
                className="search-bar__input"
                aria-label="Search championship games"
                placeholder={SEARCH_PLACEHOLDERS[field]}
                value={search}
                onChange={(event) => archive.setSearch(event.target.value)}
              />
              <select
                className="search-bar__scope"
                aria-label="Search within"
                value={field}
                onChange={(event) => archive.setField(event.target.value as SearchField)}
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
                  onChoose={(player) => archive.choosePlayer(player)}
                />
              ) : null}
            </div>

            {/* Data management, not browsing — parked behind one quiet button. */}
            <div className="menu" ref={menu}>
              {/* Import and export only ever touch your own games —
                  export writes `played` and `imported` and nothing
                  else — so they belong on that screen alone. */}
              {scope === 'mine' ? (
                <>
              <button
                type="button"
                className="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Import and export"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <AppIcon name="menu" size={18} />
              </button>
              {menuOpen ? (
                <div className="menu__popup" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      setMenuOpen(false)
                      fileInput.current?.click()
                    }}
                  >
                    Import PGN…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      setMenuOpen(false)
                      void exportGames()
                    }}
                  >
                    Export my games
                  </button>
                </div>
              ) : null}
                </>
              ) : null}
            </div>

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
        }
      />

      <div className={`archive__body${hasPane ? ' archive__body--preview' : ''}`}>
        <ArchiveFilters
          facets={facets}
          values={archive.question.filters}
          onChange={archive.setFilters}
          onReset={archive.reset}
        />

        <section className="archive__results">
          {chips.length > 0 ? (
            <div className="active-filters">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="chip chip--selected"
                  onClick={() => archive.apply(chip.without)}
                  aria-label={`Remove ${chip.label}`}
                >
                  {chip.label} ✕
                </button>
              ))}
            </div>
          ) : null}

          <h2 className="archive__heading" aria-live="polite">
            {chosen !== null
              ? `${total.toLocaleString()} games by ${chosen.name}`
              : describeResults(total, settledSearch, field, isLoading || settledSearch !== search, isFiltered)}
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

          {error ? (
            <p className="notice notice--error">
              {error}
              {games.length === 0 ? (
                <>
                  {' '}
                  <button type="button" className="link-button" onClick={archive.reload}>
                    Try again
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {!isLoading && games.length === 0 && error === null ? (
            services.archive.failures.length > 0 ? (
              // The bundled games failed to load, which importing cannot fix —
              // name the real problem and offer the retry that can.
              <p className="notice notice--error">
                The bundled games could not be loaded (
                {services.archive.failures[0]}).{' '}
                <button type="button" className="link-button" onClick={archive.reload}>
                  Try again
                </button>
              </p>
            ) : libraryIsEmpty ? (
              <p className="notice">
                {scope === 'mine' ? (
                  <>
                    Nothing here yet. Games you play are saved from the
                    game-over banner, or{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => fileInput.current?.click()}
                    >
                      import a PGN file
                    </button>{' '}
                    from your computer.
                  </>
                ) : (
                  <>
                    The bundled collections could not be read. Reload the page
                    to try again.
                  </>
                )}
              </p>
            ) : (
              <p className="notice">
                {settledSearch.trim() !== ''
                  ? 'Nothing found — try a player surname, an event name, or a year like 1972.'
                  : 'No games match what you asked for.'}
                {settledSearch.trim() !== '' ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        archive.setSearch('')
                      }}
                    >
                      Clear the search
                    </button>
                  </>
                ) : null}
                {isFiltered ? (
                  <>
                    {' '}
                    <button type="button" className="link-button" onClick={archive.reset}>
                      Clear the filters
                    </button>{' '}
                    to see the rest.
                  </>
                ) : null}
              </p>
            )
          ) : null}

          {games.length > 0 ? (
            <div
              className="game-table-scroll"
              tabIndex={0}
              aria-label="Games. Arrow keys browse, Enter opens the replay."
              onKeyDown={onListKeyDown}
            >
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
                          onClick={() => archive.applySort(column.id, column.initial)}
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
                      isSelected={game.id === selectedId}
                      rowRef={game.id === selectedId ? selectedRow : null}
                      onActivate={() => activate(game.id)}
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

          {games.length > 0 ? (
            <footer className="pager">
              <span>
                Showing {games.length.toLocaleString()} of {total.toLocaleString()}
              </span>
              {hasMore ? (
                <>
                  <button
                    type="button"
                    className="button"
                    disabled={isLoading}
                    onClick={archive.loadMore}
                  >
                    Load {Math.min(PAGE_SIZE, total - games.length).toLocaleString()} more
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={isLoading}
                    onClick={archive.loadAll}
                  >
                    Load all {total.toLocaleString()}
                  </button>
                </>
              ) : null}
            </footer>
          ) : null}
        </section>

        {hasPane ? (
          <GamePreview
            selected={selected}
            game={previewGame}
            lookup={lookup}
            onReplay={onOpenGame}
          />
        ) : null}
      </div>
    </div>
  )
}

/** The right-hand pane: the selected game, without leaving the list. */
function GamePreview({
  selected,
  game,
  lookup,
  onReplay,
}: {
  selected: ArchivedGameSummary | null
  game: ArchivedGame | null
  lookup: FederationLookup
  onReplay: (id: string) => void
}) {
  if (selected === null) {
    return (
      <aside className="preview phase3-preview phase46-preview">
        <p className="preview__empty">
          Click a game to preview it here. Click it again — or press Enter — to replay it.
        </p>
      </aside>
    )
  }

  // The pane renders from the summary at once; the board and moves fill in
  // when the full game arrives, rather than the whole pane blinking empty.
  const loaded = game !== null && game.id === selected.id
  const last = loaded ? (game.moves.at(-1) ?? null) : null

  const detail = [
    selected.event,
    selected.site,
    displayYear(selected.date),
  ].filter((part): part is string => part !== null && part !== '')

  return (
    <aside className="preview phase3-preview phase46-preview">
      {selected.nickname !== null ? (
        <p className="preview__nickname">{selected.nickname}</p>
      ) : null}
      <h3 className="preview__title">
        <Player name={selected.white} elo={selected.whiteElo} lookup={lookup} />
        <span className="game-table__versus">vs</span>
        <Player name={selected.black} elo={selected.blackElo} lookup={lookup} />
      </h3>
      <p className="preview__meta">
        {detail.join(' · ')} · <ResultPill result={selected.result} />
      </p>

      <div className="preview__board">
        <ChessBoardView
          fen={last?.positionAfter.fen ?? STARTING_FEN}
          orientation="white"
          interactive={false}
          legalMoves={[]}
          lastMove={last !== null ? { from: last.from, to: last.to } : null}
        />
      </div>
      <p className="preview__caption">
        {loaded ? `Final position · ${selected.moveCount} moves` : 'Loading the game…'}
      </p>

      {loaded && game.opening !== null ? (
        <p className="preview__opening">
          {game.eco !== null ? `${game.eco} · ` : ''}
          {game.opening}
        </p>
      ) : null}

      {loaded ? <div className="preview__pgn">{movetext(game.moves)}</div> : null}

      <button
        type="button"
        className="button button--primary"
        onClick={() => onReplay(selected.id)}
      >
        <AppIcon name="play" size={16} />
        Replay game
      </button>
    </aside>
  )
}

/** The moves as PGN movetext reads them: numbered White–Black pairs. */
export function movetext(moves: readonly RecordedMove[]): string {
  const turns: string[] = []
  for (let index = 0; index < moves.length; index += 2) {
    const black = moves[index + 1]
    turns.push(
      `${index / 2 + 1}. ${moves[index]!.san}${black === undefined ? '' : ` ${black.san}`}`,
    )
  }
  return turns.join(' ')
}

/** How each result tag is drawn, and what it actually means when read aloud. */
const RESULT_PILLS: Readonly<
  Record<string, { readonly kind: string; readonly label: string; readonly title: string }>
> = {
  '1-0': { kind: 'white', label: '1–0', title: 'White won' },
  '0-1': { kind: 'black', label: '0–1', title: 'Black won' },
  '1/2-1/2': { kind: 'draw', label: '½–½', title: 'Drawn' },
}

export function ResultPill({ result }: { result: string }) {
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
  isSelected,
  rowRef,
  onActivate,
  onDelete,
  lookup,
}: {
  game: ArchivedGameSummary
  isSelected: boolean
  rowRef: React.RefObject<HTMLTableRowElement | null> | null
  onActivate: () => void
  lookup: FederationLookup
  /** Only your own games can be removed; history is not yours to delete. */
  onDelete?: () => void
}) {
  // Round tags are frequently placeholders, and "round -" is worse than silence.
  const round = game.round === '-' || game.round === '?' || game.round === '' ? null : game.round
  const detail = [game.site, round === null ? null : `round ${round}`]
    .filter((part) => part !== null)
    .join(' · ')

  return (
    <tr
      className={`game-table__row${isSelected ? ' game-table__row--selected' : ''}`}
      ref={rowRef ?? undefined}
      aria-selected={isSelected}
      onClick={onActivate}
    >
      <td className="col-players">
        {/* The row is clickable for the mouse; this button is what a keyboard
            and a screen reader actually reach. */}
        <button
          type="button"
          className="game-table__open"
          onClick={(event) => {
            event.stopPropagation()
            onActivate()
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
