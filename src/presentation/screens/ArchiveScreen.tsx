import { useEffect, useRef, useState } from 'react'
import { displayYear, type ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import {
  SEARCH_FIELDS,
  type ArchivePage,
  type SearchField,
} from '@application/ports/GameArchive'
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
  year: 'Search by year, e.g. 1972',
}

const FIELD_NAMES: Readonly<Record<SearchField, string>> = {
  all: '',
  player: 'players',
  event: 'events',
  year: 'years',
}

/** States plainly what is on screen and why, rather than leaving a bare list. */
function describeResults(
  total: number,
  search: string,
  field: SearchField,
  isLoading: boolean,
): string {
  if (isLoading) return 'Searching…'

  const games = `${total.toLocaleString()} game${total === 1 ? '' : 's'}`
  if (search.trim() === '') return `All games · ${games}`

  const scope = field === 'all' ? '' : ` in ${FIELD_NAMES[field]}`
  return total === 0
    ? `No games matching “${search}”${scope}`
    : `${games} matching “${search}”${scope}`
}

interface ArchiveScreenProps {
  readonly onOpenGame: (id: string) => void
  readonly onBack: () => void
}

export function ArchiveScreen({ onOpenGame, onBack }: ArchiveScreenProps) {
  const { services } = useServices()
  const [search, setSearch] = useState('')
  const [field, setField] = useState<SearchField>('all')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ArchivePage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [importing, setImporting] = useState<ImportState | null>(null)
  const [lastImport, setLastImport] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    services.archive
      .list({ search, field, offset, limit: PAGE_SIZE })
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
  }, [services.archive, search, field, offset, reloadToken])

  const importFile = async (file: File) => {
    setError(null)
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

  const games = page?.games ?? []
  const total = page?.total ?? 0

  return (
    <div className="screen screen--archive">
      <header className="archive__header">
        <button type="button" className="button" onClick={onBack}>
          ← Back
        </button>
        <h1>Championship games</h1>
        <div className="archive__tools">
          <input
            type="search"
            className="input"
            placeholder={SEARCH_PLACEHOLDERS[field]}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
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

      <div className="archive__scope" role="group" aria-label="Search within">
        <span className="archive__scope-label">Search in</span>
        {SEARCH_FIELDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`chip${field === option.id ? ' chip--selected' : ''}`}
            aria-pressed={field === option.id}
            onClick={() => {
              setField(option.id)
              setOffset(0)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <h2 className="archive__heading">{describeResults(total, search, field, isLoading)}</h2>

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
        <p className="notice">
          No games in the library yet. Use <strong>Import PGN</strong> to load a game
          file from your computer.
        </p>
      ) : null}


      <ol className="game-list">
        {games.map((game) => (
          <GameRow
            key={game.id}
            game={game}
            onOpen={() => onOpenGame(game.id)}
            onDelete={game.origin === 'played' ? () => void deleteGame(game.id) : undefined}
          />
        ))}
      </ol>

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
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
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
    </div>
  )
}

function GameRow({
  game,
  onOpen,
  onDelete,
}: {
  game: ArchivedGameSummary
  onOpen: () => void
  /** Only your own games can be removed; history is not yours to delete. */
  onDelete?: () => void
}) {
  return (
    <li className="game-list__item">
      <button type="button" className="game-row" onClick={onOpen}>
        <span className="game-row__players">
          {game.nickname !== null ? (
            <span className="game-row__nickname">{game.nickname}</span>
          ) : null}
          {game.white} <span className="game-row__versus">vs</span> {game.black}
        </span>
        <span className="game-row__meta">
          {game.event} · round {game.round} · {displayYear(game.date)}
        </span>
        <span className="game-row__result">{game.result}</span>
        <span className="game-row__moves">{game.moveCount} moves</span>
        {game.origin === 'played' ? <span className="badge">yours</span> : null}
        {game.hasRecordedClocks ? (
          <span className="badge badge--recorded">clocks</span>
        ) : null}
      </button>
      {onDelete ? (
        <button
          type="button"
          className="button button--danger game-row__delete"
          onClick={onDelete}
          aria-label={`Delete ${game.white} vs ${game.black}`}
        >
          Delete
        </button>
      ) : null}
    </li>
  )
}
