import { useState } from 'react'
import { MAX_EVENT_OPTIONS, type ArchiveFacets } from '@application/ports/GameArchive'

/**
 * The structured filters, held the way the controls hold them.
 *
 * Strings rather than numbers because that is what a `<select>` deals in, and
 * because an empty string says "not filtering on this" — a distinction that
 * `0` and `null` both blur once years are involved.
 */
export interface FilterValues {
  readonly event: string
  readonly result: string
  readonly yearFrom: string
  readonly yearTo: string
}

export const NO_FILTERS: FilterValues = {
  event: '',
  result: '',
  yearFrom: '',
  yearTo: '',
}

export function isFiltering(values: FilterValues): boolean {
  return (
    values.event !== '' ||
    values.result !== '' ||
    values.yearFrom !== '' ||
    values.yearTo !== ''
  )
}

/** The result tags, named the way people say them rather than as PGN spells them. */
export const RESULT_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '', label: 'Any result' },
  { value: '1-0', label: 'White won' },
  { value: '0-1', label: 'Black won' },
  { value: '1/2-1/2', label: 'Draw' },
]

interface ArchiveFiltersProps {
  readonly facets: ArchiveFacets | null
  readonly values: FilterValues
  readonly onChange: (next: FilterValues) => void
  readonly onReset: () => void
}

export function ArchiveFilters({ facets, values, onChange, onReset }: ArchiveFiltersProps) {
  // Narrow screens fold the controls away behind the title; the desktop
  // sidebar ignores this entirely and always shows them.
  const [open, setOpen] = useState(false)
  const years = yearOptions(facets)

  /**
   * Applies one control's change, keeping the year range the right way round.
   *
   * Without the clamp, picking a "from" later than the "to" already chosen
   * produces an empty list and no explanation of why.
   */
  const set = (patch: Partial<FilterValues>) => {
    const next = { ...values, ...patch }
    if (next.yearFrom !== '' && next.yearTo !== '' && Number(next.yearFrom) > Number(next.yearTo)) {
      onChange(
        patch.yearFrom === undefined
          ? { ...next, yearFrom: next.yearTo }
          : { ...next, yearTo: next.yearFrom },
      )
      return
    }
    onChange(next)
  }

  return (
    <aside className={`filters${open ? '' : ' filters--closed'}`}>
      <div className="filters__head">
        <button
          type="button"
          className="filters__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Filters
          <span className="filters__chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
        </button>
        <button
          type="button"
          className="filters__reset"
          onClick={onReset}
          disabled={!isFiltering(values)}
        >
          Reset
        </button>
      </div>

      {/* display: contents on desktop, so collapsing exists only where the
          screen is narrow enough to need the room back. */}
      <div className="filters__body">
        <label className="filter">
          <span className="filter__label">Event</span>
          <select
            className="filter__control"
            value={values.event}
            onChange={(event) => set({ event: event.target.value })}
          >
            <option value="">All events</option>
            {facets?.events.map((event) => (
              <option key={event.name} value={event.name}>
                {event.name} ({event.games.toLocaleString()})
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span className="filter__label">Result</span>
          <select
            className="filter__control"
            value={values.result}
            onChange={(event) => set({ result: event.target.value })}
          >
            {RESULT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="filter">
          <span className="filter__label">Year</span>
          <div className="filter__range">
            <select
              className="filter__control"
              aria-label="Earliest year"
              value={values.yearFrom}
              onChange={(event) => set({ yearFrom: event.target.value })}
            >
              <option value="">From</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className="filter__dash" aria-hidden="true">
              –
            </span>
            <select
              className="filter__control"
              aria-label="Latest year"
              value={values.yearTo}
              onChange={(event) => set({ yearTo: event.target.value })}
            >
              <option value="">To</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* One line, not a card: what the library holds overall. What the current
          query matched is the results heading's job, next to the results. */}
      <p className="stats-line">{describeLibrary(facets)}</p>
    </aside>
  )
}

function describeLibrary(facets: ArchiveFacets | null): string {
  if (facets === null) return '…'
  return `${facets.totalGames.toLocaleString()} games · ${eventCount(facets)} events · ${yearSpan(facets)}`
}

/**
 * How many events the filter can offer.
 *
 * "250+" once the list is capped, because the true number is larger than
 * anything this screen was told and printing the cap as a total is a lie.
 */
function eventCount(facets: ArchiveFacets): string {
  return facets.events.length >= MAX_EVENT_OPTIONS
    ? `${MAX_EVENT_OPTIONS}+`
    : facets.events.length.toLocaleString()
}

function yearSpan(facets: ArchiveFacets): string {
  if (facets.firstYear === null || facets.lastYear === null) return '—'
  return facets.firstYear === facets.lastYear
    ? String(facets.firstYear)
    : `${facets.firstYear}–${facets.lastYear}`
}

/** Every year the library covers, most recent first. */
function yearOptions(facets: ArchiveFacets | null): readonly number[] {
  if (facets === null || facets.firstYear === null || facets.lastYear === null) return []

  const years: number[] = []
  for (let year = facets.lastYear; year >= facets.firstYear; year -= 1) years.push(year)
  return years
}
