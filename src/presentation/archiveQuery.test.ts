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
  it('buildQuery_EmptyFilters_AreDroppedNotSentAsEmptiness', () => {
    const query = toArchiveQuery(question(), 'all', '')
    expect(query.event).toBeUndefined()
    expect(query.result).toBeUndefined()
    expect(query.yearFrom).toBeUndefined()
    expect(query.yearTo).toBeUndefined()
  })

  it('buildQuery_SetFilters_ArePassedThrough', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, event: 'WCh', result: '1-0' } }),
      'all',
      '',
    )
    expect(query.event).toBe('WCh')
    expect(query.result).toBe('1-0')
  })

  // The controls hold text; the archive wants numbers to compare.
  it('buildQuery_YearText_IsTurnedIntoNumbers', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, yearFrom: '1960', yearTo: '1972' } }),
      'all',
      '',
    )
    expect(query.yearFrom).toBe(1960)
    expect(query.yearTo).toBe(1972)
  })

  it('buildQuery_OneEndOfAYearRange_DoesNotInventTheOther', () => {
    const query = toArchiveQuery(
      question({ filters: { ...NO_FILTERS, yearFrom: '1960' } }),
      'all',
      '',
    )
    expect(query.yearFrom).toBe(1960)
    expect(query.yearTo).toBeUndefined()
  })

  // The query runs on the debounced term, not on what is currently in the box.
  it('buildQuery_TermStillBeingTyped_SearchesTheSettledTermInstead', () => {
    const query = toArchiveQuery(question(), 'all', 'fischer')
    expect(query.search).toBe('fischer')
  })

  it('buildQuery_Scope_IsCarriedSoEachScreenAsksForItsHalf', () => {
    expect(toArchiveQuery(question(), 'mine', '').scope).toBe('mine')
    expect(toArchiveQuery(question(), 'reference', '').scope).toBe('reference')
  })

  // A chosen player finds their games under every spelling of the name, which
  // typing the name cannot do.
  it('buildQuery_ChosenPlayer_IsAskedForById', () => {
    expect(toArchiveQuery(question({ chosen: fischer }), 'all', '').playerId).toBe('p1')
    expect(toArchiveQuery(question(), 'all', '').playerId).toBeUndefined()
  })

  // No column clicked yet leaves the archive's own relevance ordering in
  // place rather than imposing an arbitrary one on arrival.
  it('buildQuery_NoColumnChosen_SendsNoSort', () => {
    expect(toArchiveQuery(question(), 'all', '').sort).toBeUndefined()
    expect(toArchiveQuery(question({ sort: 'year' }), 'all', '').sort).toBe('year')
  })
})

describe('accumulatePages', () => {
  // Offset zero is a new question, not more of the old one.
  it('accumulate_FirstPage_ReplacesTheList', () => {
    expect(accumulatePages(['a', 'b'], ['c'], 0)).toEqual(['c'])
  })

  it('accumulate_LaterPage_AppendsBehindWhatIsShown', () => {
    expect(accumulatePages(['a', 'b'], ['c'], 2)).toEqual(['a', 'b', 'c'])
  })

  it('accumulate_EmptyLaterPage_LeavesTheListAlone', () => {
    expect(accumulatePages(['a'], [], 1)).toEqual(['a'])
  })

  // A first page with no results has to clear what was there, or a search
  // that matches nothing shows the previous search's games.
  it('accumulate_EmptyFirstPage_EmptiesTheList', () => {
    expect(accumulatePages(['a', 'b'], [], 0)).toEqual([])
  })
})

describe('restartedAt', () => {
  it('resetPaging_AfterPagingForward_GoesBackToTheFirstPage', () => {
    const restarted = restartedAt(question({ offset: 400, limit: 5_000 }))
    expect(restarted.offset).toBe(0)
    expect(restarted.limit).toBe(PAGE_SIZE)
  })

  it('resetPaging_ExistingQuery_KeepsTheQuestionItselfIntact', () => {
    const asked = question({ search: 'tal', field: 'player', sort: 'year', offset: 80 })
    expect(restartedAt(asked)).toMatchObject({
      search: 'tal',
      field: 'player',
      sort: 'year',
    })
  })
})

describe('sortedBy', () => {
  it('toggleSort_NewColumn_StartsTheWayThatColumnReadsBest', () => {
    expect(sortedBy(question(), 'year', 'desc')).toMatchObject({
      sort: 'year',
      direction: 'desc',
    })
    expect(sortedBy(question(), 'players', 'asc').direction).toBe('asc')
  })

  it('toggleSort_SameColumn_ReversesIt', () => {
    const byYear = question({ sort: 'year', direction: 'desc' })
    expect(sortedBy(byYear, 'year', 'desc').direction).toBe('asc')
    expect(sortedBy(sortedBy(byYear, 'year', 'desc'), 'year', 'desc').direction).toBe('desc')
  })

  // Switching columns takes the new column's own starting direction, not
  // whatever the last column happened to be left on.
  it('toggleSort_SwitchingColumns_DoesNotCarryTheOldDirectionOver', () => {
    const byYearAscending = question({ sort: 'year', direction: 'asc' })
    expect(sortedBy(byYearAscending, 'event', 'desc').direction).toBe('desc')
  })

  // Page two of the old order is not page two of the new one.
  it('toggleSort_AnyChange_RestartsTheList', () => {
    const deep = question({ sort: 'year', offset: 120, limit: 500 })
    expect(sortedBy(deep, 'event', 'asc')).toMatchObject({ offset: 0, limit: PAGE_SIZE })
  })
})

describe('nextSelection', () => {
  const games = ['a', 'b', 'c'].map((id) => ({ id })) as ArchivedGameSummary[]

  it('moveSelection_EmptyList_HasNowhereToGo', () => {
    expect(nextSelection([], null, 'ArrowDown')).toBeNull()
    expect(nextSelection([], 'a', 'ArrowUp')).toBeNull()
  })

  // The first press has to land somewhere, and which end depends on which
  // way it was pressed.
  it('moveSelection_EnteringTheList_EntersTopGoingDownBottomGoingUp', () => {
    expect(nextSelection(games, null, 'ArrowDown')).toBe('a')
    expect(nextSelection(games, null, 'ArrowUp')).toBe('c')
  })

  it('moveSelection_WithinTheList_StepsOneRowAtATime', () => {
    expect(nextSelection(games, 'a', 'ArrowDown')).toBe('b')
    expect(nextSelection(games, 'b', 'ArrowUp')).toBe('a')
  })

  // Holding rather than wrapping: a list that jumps from the last row back to
  // the first reads as a glitch, not as navigation.
  it('moveSelection_AtEitherEnd_HoldsInsteadOfWrapping', () => {
    expect(nextSelection(games, 'c', 'ArrowDown')).toBe('c')
    expect(nextSelection(games, 'a', 'ArrowUp')).toBe('a')
  })

  // A narrowed list can drop the selected game entirely; the keys must still
  // work rather than getting stuck on a row that is gone.
  it('moveSelection_SelectionNoLongerInTheList_ReEnters', () => {
    expect(nextSelection(games, 'vanished', 'ArrowDown')).toBe('a')
    expect(nextSelection(games, 'vanished', 'ArrowUp')).toBe('c')
  })
})

describe('activeChips', () => {
  it('activeFilters_NothingNarrowed_ShowsNothing', () => {
    expect(activeChips(question(), '')).toHaveLength(0)
  })

  it('activeFilters_SearchTerm_NamesTheTermSearchedFor', () => {
    const [chip] = activeChips(question(), 'fischer')
    expect(chip?.key).toBe('search')
    expect(chip?.label).toContain('fischer')
  })

  it('activeFilters_WhitespaceSearch_IsIgnored', () => {
    expect(activeChips(question(), '   ')).toHaveLength(0)
  })

  // Choosing a player from the suggestions sets the box to their name, so
  // showing both chips would name the same narrowing twice.
  it('activeFilters_ChosenPlayer_ShowsThePlayerNotTheText', () => {
    const chips = activeChips(question({ chosen: fischer }), 'Fischer, Robert James')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.key).toBe('player')
  })

  it('activeFilters_EachSetFilter_IsNamed', () => {
    const chips = activeChips(
      question({ filters: { ...NO_FILTERS, event: 'WCh', result: '1-0' } }),
      '',
    )
    expect(chips.map((chip) => chip.key)).toEqual(['event', 'result'])
    expect(chips[0]?.label).toBe('Event: WCh')
  })

  // "1-0" is how PGN writes it; "White won" is what it means.
  it('activeFilters_ResultFilter_ReadsBackInWords', () => {
    const [chip] = activeChips(question({ filters: { ...NO_FILTERS, result: '1/2-1/2' } }), '')
    expect(chip?.label).toBe('Draw')
  })

  describe('a year range', () => {
    // One narrowing, so one chip: clearing half of it would leave a filter
    // nobody asked for.
    it('activeFilters_YearRange_IsASingleChipCoveringBothEnds', () => {
      const chips = activeChips(
        question({ filters: { ...NO_FILTERS, yearFrom: '1960', yearTo: '1972' } }),
        '',
      )
      expect(chips).toHaveLength(1)
      expect(chips[0]?.label).toBe('Years: 1960–1972')
    })

    it('activeFilters_OpenEndedRange_MarksTheOpenEnd', () => {
      const [from] = activeChips(question({ filters: { ...NO_FILTERS, yearFrom: '1960' } }), '')
      expect(from?.label).toBe('Years: 1960–…')
      const [to] = activeChips(question({ filters: { ...NO_FILTERS, yearTo: '1972' } }), '')
      expect(to?.label).toBe('Years: …–1972')
    })

    it('clearFilter_YearChip_ClearsBothEndsTogether', () => {
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

    it('clearFilter_OneChip_LiftsOnlyTheNarrowingItNames', () => {
      const event = activeChips(asked, '').find((chip) => chip.key === 'event')
      expect(event?.without.filters.event).toBe('')
      expect(event?.without.filters.result).toBe('1-0')
    })

    it('clearFilter_AnyChip_RestartsTheList', () => {
      const event = activeChips(asked, '')[0]
      expect(event?.without.offset).toBe(0)
      expect(event?.without.limit).toBe(PAGE_SIZE)
    })

    // Clearing the player chip clears the name it put in the box too, or the
    // text stays behind and silently becomes a search.
    it('clearFilter_PlayerChip_ClearsTheBoxAlongWithThePlayer', () => {
      const [chip] = activeChips(question({ chosen: fischer }), 'Fischer, Robert James')
      expect(chip?.without.chosen).toBeNull()
      expect(chip?.without.search).toBe('')
    })
  })
})
