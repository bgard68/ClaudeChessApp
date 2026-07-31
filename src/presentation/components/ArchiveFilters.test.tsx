import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ArchiveFacets } from '@application/ports/GameArchive'
import {
  ArchiveFilters,
  NO_FILTERS,
  RESULT_OPTIONS,
  isFiltering,
  type FilterValues,
} from './ArchiveFilters'

const facets = (over: Partial<ArchiveFacets> = {}): ArchiveFacets => ({
  totalGames: 2987,
  events: [
    { name: 'FIDE WCh KO', games: 1164 },
    { name: 'WCh', games: 105 },
  ],
  firstYear: 1886,
  lastYear: 2024,
  ...over,
})

const render = (over: Partial<Parameters<typeof ArchiveFilters>[0]> = {}) =>
  renderToStaticMarkup(
    <ArchiveFilters
      facets={facets()}
      values={NO_FILTERS}
      onChange={vi.fn()}
      onReset={vi.fn()}
      {...over}
    />,
  )

describe('isFiltering', () => {
  it('is false when nothing is set', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false)
  })

  it.each([
    ['event', { event: 'WCh' }],
    ['result', { result: '1-0' }],
    ['year from', { yearFrom: '1972' }],
    ['year to', { yearTo: '1972' }],
  ])('is true for %s alone', (_label, partial) => {
    expect(isFiltering({ ...NO_FILTERS, ...partial } as FilterValues)).toBe(true)
  })
})

describe('RESULT_OPTIONS', () => {
  // PGN writes results as 1-0 and 1/2-1/2; nobody says that out loud. The
  // values stay in the notation the database stores, the labels do not.
  it('keeps PGN values behind spoken labels', () => {
    expect(RESULT_OPTIONS.map((o) => o.value)).toEqual(['', '1-0', '0-1', '1/2-1/2'])
    expect(RESULT_OPTIONS.map((o) => o.label)).toEqual([
      'Any result',
      'White won',
      'Black won',
      'Draw',
    ])
  })

  it('offers "any" first, so the default needs no thought', () => {
    expect(RESULT_OPTIONS[0]?.value).toBe('')
  })
})

describe('ArchiveFilters', () => {
  // Reset stays in place and greys out rather than appearing and vanishing:
  // a control that moves as you type is harder to aim at than one that waits.
  it('keeps reset in place, disabled until there is something to clear', () => {
    const clean = render({ values: NO_FILTERS })
    const filtered = render({ values: { ...NO_FILTERS, result: '1-0' } })

    expect(clean).toContain('Reset')
    expect(clean).toContain('filters__reset')
    expect(clean.slice(clean.indexOf('filters__reset'))).toContain('disabled')

    expect(filtered.slice(filtered.indexOf('filters__reset'), filtered.indexOf('Reset'))).not.toContain('disabled')
  })

  it('lists each event with how many games it holds', () => {
    const markup = render()
    expect(markup).toContain('FIDE WCh KO')
    // The count is what tells you whether a filter is worth applying.
    expect(markup).toContain('1,164')
  })

  // The library is empty on a first visit until the import finishes, and a
  // filter panel offering nothing is better than one that throws.
  it('survives having no facets yet', () => {
    expect(() => render({ facets: null })).not.toThrow()
  })

  it('survives a library with no years recorded', () => {
    expect(() =>
      render({ facets: facets({ firstYear: null, lastYear: null }) }),
    ).not.toThrow()
  })

  // Newest first: the year someone reaches for is far more often 2024 than
  // 1886, and a list of 138 years is a long scroll from the wrong end.
  it('lists years from the most recent backwards', () => {
    const markup = render()
    expect(markup.indexOf('2024')).toBeLessThan(markup.indexOf('1886'))
  })
})
