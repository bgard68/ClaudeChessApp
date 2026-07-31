import { describe, expect, it } from 'vitest'
import type { PlayerSuggestion } from '@application/ports/GameArchive'
import type { ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import { NO_FILTERS } from './components/ArchiveFilters'
import {
  NO_QUESTION,
  PAGE_SIZE,
  accumulatePages,
  activeChips,
  nextSelection,
  restartedAt,
  sortedBy,
  toArchiveQuery,
  type QuestionState,
} from './archiveQuery'

const question = (over: Partial<QuestionState> = {}): QuestionState => ({
  ...NO_QUESTION(NO_FILTERS),
  ...over,
})

const fischer = { id: 'p1', name: 'Fischer, Robert James' } as PlayerSuggestion

describe('toArchiveQuery', () => {
  /*
   * The filter values are strings because they come from form controls. An
   * empty one means "not filtering", and sending it through as `''` would
   * ask the archive for games whose event is literally blank — which finds
   * nothing, and looks exactly like a library that lost its games.
   */
  it('drops empty filters rather than filtering on emptiness', () => {
    const query = toArchiveQuery(question(), 'all', '')
    expect(query.event).toBeUndefined()
    expect(query.result).toBeUndefined()
    expect(query.yearFrom).toBeUndefined()
    expect(query.yearTo).toBeUndefined()
  })

  it('passes the filters that are set', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, event: 'WCh', result: '1-0' } }),
      'all',
      '',
    )
    expect(query.event).toBe('WCh')
    expect(query.result).toBe('1-0')
  })

  // The controls hold text; the archive wants numbers to compare.
  it('turns year text into numbers', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, yearFrom: '1960', yearTo: '1972' } }),
      'all',
      '',
    )
    expect(query.yearFrom).toBe(1960)
    expect(query.yearTo).toBe(1972)
  })

  it('sends one end of a year range without inventing the other', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, yearFrom: '1960' } }),
      'all',
      '',
    )
    expect(query.yearFrom).toBe(1960)
    expect(query.yearTo).toBeUndefined()
  })

  // The query runs on the debounced term, not on what is currently in the box.
  it('searches for the settled term, not the one being typed', () => {
    const query = toArchiveQuery(question(), 'all', 'fischer')
    expect(query.search).toBe('fischer')
  })

  it('carries the scope so each screen asks for its own half of the library', () => {
    expect(toArchiveQuery(question(), 'mine', '').scope).toBe('mine')
    expect(toArchiveQuery(question(), 'reference', '').scope).toBe('reference')
  })

  // A chosen player finds their games under every spelling of the name, which
  // typing the name cannot do.
  it('asks for a chosen player by id', () => {
    expect(toArchiveQuery(question({ chosen: fischer }), 'all', '').playerId).toBe('p1')
    expect(toArchiveQuery(question(), 'all', '').playerId).toBeUndefined()
  })

  // No column clicked yet leaves the archive's own relevance ordering in
  // place rather than imposing an arbitrary one on arrival.
  it('sends no sort until a column is chosen', () => {
    expect(toArchiveQuery(question(), 'all', '').sort).toBeUndefined()
    expect(toArchiveQuery(question({ sort: 'year' }), 'all', '').sort).toBe('year')
  })
})

describe('accumulatePages', () => {
  // Offset zero is a new question, not more of the old one.
  it('replaces the list on a first page', () => {
    expect(accumulatePages(['a', 'b'], ['c'], 0)).toEqual(['c'])
  })

  it('appends a later page behind what is already shown', () => {
    expect(accumulatePages(['a', 'b'], ['c'], 2)).toEqual(['a', 'b', 'c'])
  })

  it('leaves the list alone when a later page comes back empty', () => {
    expect(accumulatePages(['a'], [], 1)).toEqual(['a'])
  })

  // A first page with no results has to clear what was there, or a search
  // that matches nothing shows the previous search's games.
  it('empties the list when a first page finds nothing', () => {
    expect(accumulatePages(['a', 'b'], [], 0)).toEqual([])
  })
})

describe('restartedAt', () => {
  it('goes back to the first page at the usual size', () => {
    const restarted = restartedAt(question({ offset: 400, limit: 5_000 }))
    expect(restarted.offset).toBe(0)
    expect(restarted.limit).toBe(PAGE_SIZE)
  })

  it('keeps the question itself intact', () => {
    const asked = question({ search: 'tal', field: 'player', sort: 'year', offset: 80 })
    expect(restartedAt(asked)).toMatchObject({
      search: 'tal',
      field: 'player',
      sort: 'year',
    })
  })
})

describe('sortedBy', () => {
  it('starts a new column the way that column reads best', () => {
    expect(sortedBy(question(), 'year', 'desc')).toMatchObject({
      sort: 'year',
      direction: 'desc',
    })
    expect(sortedBy(question(), 'players', 'asc').direction).toBe('asc')
  })

  it('reverses the column already sorted', () => {
    const byYear = question({ sort: 'year', direction: 'desc' })
    expect(sortedBy(byYear, 'year', 'desc').direction).toBe('asc')
    expect(sortedBy(sortedBy(byYear, 'year', 'desc'), 'year', 'desc').direction).toBe('desc')
  })

  // Switching columns takes the new column's own starting direction, not
  // whatever the last column happened to be left on.
  it('does not carry the previous column direction over', () => {
    const byYearAscending = question({ sort: 'year', direction: 'asc' })
    expect(sortedBy(byYearAscending, 'event', 'desc').direction).toBe('desc')
  })

  // Page two of the old order is not page two of the new one.
  it('restarts the list', () => {
    const deep = question({ sort: 'year', offset: 120, limit: 500 })
    expect(sortedBy(deep, 'event', 'asc')).toMatchObject({ offset: 0, limit: PAGE_SIZE })
  })
})

describe('nextSelection', () => {
  const games = ['a', 'b', 'c'].map((id) => ({ id })) as ArchivedGameSummary[]

  it('has nowhere to go in an empty list', () => {
    expect(nextSelection([], null, 'ArrowDown')).toBeNull()
    expect(nextSelection([], 'a', 'ArrowUp')).toBeNull()
  })

  // The first press has to land somewhere, and which end depends on which
  // way it was pressed.
  it('enters at the top going down and the bottom going up', () => {
    expect(nextSelection(games, null, 'ArrowDown')).toBe('a')
    expect(nextSelection(games, null, 'ArrowUp')).toBe('c')
  })

  it('steps one row at a time', () => {
    expect(nextSelection(games, 'a', 'ArrowDown')).toBe('b')
    expect(nextSelection(games, 'b', 'ArrowUp')).toBe('a')
  })

  // Holding rather than wrapping: a list that jumps from the last row back to
  // the first reads as a glitch, not as navigation.
  it('holds at both ends instead of wrapping', () => {
    expect(nextSelection(games, 'c', 'ArrowDown')).toBe('c')
    expect(nextSelection(games, 'a', 'ArrowUp')).toBe('a')
  })

  // A narrowed list can drop the selected game entirely; the keys must still
  // work rather than getting stuck on a row that is gone.
  it('re-enters the list when the selection is no longer in it', () => {
    expect(nextSelection(games, 'vanished', 'ArrowDown')).toBe('a')
    expect(nextSelection(games, 'vanished', 'ArrowUp')).toBe('c')
  })
})

describe('activeChips', () => {
  it('shows nothing when nothing is narrowed', () => {
    expect(activeChips(question(), '')).toHaveLength(0)
  })

  it('names the term that was searched for', () => {
    const [chip] = activeChips(question(), 'fischer')
    expect(chip?.key).toBe('search')
    expect(chip?.label).toContain('fischer')
  })

  it('ignores a search of nothing but spaces', () => {
    expect(activeChips(question(), '   ')).toHaveLength(0)
  })

  // Choosing a player from the suggestions sets the box to their name, so
  // showing both chips would name the same narrowing twice.
  it('shows the player instead of the text that found them', () => {
    const chips = activeChips(question({ chosen: fischer }), 'Fischer, Robert James')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.key).toBe('player')
  })

  it('names each filter that is set', () => {
    const chips = activeChips(
      question({ filters: { ...NO_FILTERS, event: 'WCh', result: '1-0' } }),
      '',
    )
    expect(chips.map((chip) => chip.key)).toEqual(['event', 'result'])
    expect(chips[0]?.label).toBe('Event: WCh')
  })

  // "1-0" is how PGN writes it; "White won" is what it means.
  it('reads a result filter back in words', () => {
    const [chip] = activeChips(question({ filters: { ...NO_FILTERS, result: '1/2-1/2' } }), '')
    expect(chip?.label).toBe('Draw')
  })

  describe('a year range', () => {
    // One narrowing, so one chip: clearing half of it would leave a filter
    // nobody asked for.
    it('is a single chip covering both ends', () => {
      const chips = activeChips(
        question({ filters: { ...NO_FILTERS, yearFrom: '1960', yearTo: '1972' } }),
        '',
      )
      expect(chips).toHaveLength(1)
      expect(chips[0]?.label).toBe('Years: 1960–1972')
    })

    it('marks an open end rather than leaving it blank', () => {
      const [from] = activeChips(question({ filters: { ...NO_FILTERS, yearFrom: '1960' } }), '')
      expect(from?.label).toBe('Years: 1960–…')
      const [to] = activeChips(question({ filters: { ...NO_FILTERS, yearTo: '1972' } }), '')
      expect(to?.label).toBe('Years: …–1972')
    })

    it('clears both ends together', () => {
      const [chip] = activeChips(
        question({ filters: { ...NO_FILTERS, yearFrom: '1960', yearTo: '1972' } }),
        '',
      )
      expect(chip?.without.filters.yearFrom).toBe('')
      expect(chip?.without.filters.yearTo).toBe('')
    })
  })

  describe('dismissing one', () => {
    const asked = question({
      filters: { ...NO_FILTERS, event: 'WCh', result: '1-0' },
      offset: 120,
    })

    it('lifts only the narrowing it names', () => {
      const event = activeChips(asked, '').find((chip) => chip.key === 'event')
      expect(event?.without.filters.event).toBe('')
      expect(event?.without.filters.result).toBe('1-0')
    })

    it('restarts the list, because the answer is now a different one', () => {
      const event = activeChips(asked, '')[0]
      expect(event?.without.offset).toBe(0)
      expect(event?.without.limit).toBe(PAGE_SIZE)
    })

    // Clearing the player chip clears the name it put in the box too, or the
    // text stays behind and silently becomes a search.
    it('clears the box along with the chosen player', () => {
      const [chip] = activeChips(question({ chosen: fischer }), 'Fischer, Robert James')
      expect(chip?.without.chosen).toBeNull()
      expect(chip?.without.search).toBe('')
    })
  })
})
