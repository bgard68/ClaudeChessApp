import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RecordedMove } from '@domain/archive/ArchivedGame'
import { ResultPill, describeResults, movetext } from './ArchiveScreen'

/*
 * The screen itself needs the game library — every list it draws arrives from
 * a database query in an effect, which a static render never runs. What is
 * tested here is the logic that decides what those results say, which is
 * where the wording people read is actually decided.
 */

describe('describeResults', () => {
  // Said while a query is in flight, so a slow search does not look like an
  // empty library.
  it('countLabel_BeforeTheCountMeansAnything_SaysItIsStillLooking', () => {
    expect(describeResults(0, '', 'all', true, false)).toBe('Searching…')
    expect(describeResults(9_999, 'fischer', 'player', true, false)).toBe('Searching…')
  })

  it('countLabel_NothingAskedOfIt_CountsTheWholeLibrary', () => {
    expect(describeResults(2_987, '', 'all', false, false)).toBe('All games · 2,987 games')
  })

  // Thousands separators: an archive of 2987 games reads as a typo without one.
  it('countLabel_Thousands_AreGroupedForReadability', () => {
    expect(describeResults(1_164_000, '', 'all', false, false)).toContain('1,164,000')
  })

  it('countLabel_SingleGame_UsesTheSingular', () => {
    expect(describeResults(1, '', 'all', false, false)).toBe('All games · 1 game')
    expect(describeResults(0, '', 'all', false, false)).toContain('0 games')
  })

  // Filters narrow the library without a search term, and the count alone
  // would look like the library had shrunk.
  it('countLabel_FilteredCount_IsMarkedAsFiltered', () => {
    expect(describeResults(105, '', 'all', false, true)).toBe('Filtered · 105 games')
  })

  describe('when something has been searched for', () => {
    it('countLabel_SearchTerm_IsQuotedBack', () => {
      expect(describeResults(42, 'fischer', 'all', false, false)).toBe(
        '42 games matching “fischer”',
      )
    })

    it('countLabel_SpecificFieldSearched_NamesTheField', () => {
      expect(describeResults(42, 'fischer', 'player', false, false)).toBe(
        '42 games matching “fischer” in players',
      )
    })

    // "0 games matching" is a count; "No games matching" is an answer.
    it('countLabel_ZeroMatches_SaysNoneRatherThanCountingToZero', () => {
      expect(describeResults(0, 'zzz', 'event', false, false)).toBe(
        'No games matching “zzz” in events',
      )
    })
  })
})

describe('movetext', () => {
  const moves = (sans: readonly string[]): readonly RecordedMove[] =>
    sans.map((san) => ({ san })) as unknown as readonly RecordedMove[]

  it('movesSummary_PairedHalfMoves_NumbersEachPairOnce', () => {
    expect(movetext(moves(['e4', 'e5', 'Nf3', 'Nc6']))).toBe('1. e4 e5 2. Nf3 Nc6')
  })

  // A game ending on White's move has no reply to print, and the trailing
  // space a naive join leaves behind is not valid movetext.
  it('movesSummary_BlackNeverReplied_LeavesNoDanglingSpace', () => {
    expect(movetext(moves(['e4', 'e5', 'Qh5']))).toBe('1. e4 e5 2. Qh5')
  })

  it('movesSummary_SingleMove_IsNumberedAsTheFirst', () => {
    expect(movetext(moves(['d4']))).toBe('1. d4')
  })

  it('movesSummary_GameWithNoMoves_ProducesNothing', () => {
    expect(movetext(moves([]))).toBe('')
  })
})

describe('ResultPill', () => {
  const pill = (result: string) => renderToStaticMarkup(<ResultPill result={result} />)

  // The glyphs are typographic — an en dash and a real ½ — but what they mean
  // has to be readable, so each carries the sentence as a title.
  it.each([
    ['1-0', '1–0', 'White won'],
    ['0-1', '0–1', 'Black won'],
    ['1/2-1/2', '½–½', 'Drawn'],
  ])('resultBadge_%s_DrawsAs%sAndSaysWhatItMeans', (result, glyph, meaning) => {
    const markup = pill(result)
    expect(markup).toContain(glyph)
    expect(markup).toContain(`title="${meaning}"`)
  })

  /*
   * Plenty of archived games carry "*" or nothing at all. A dash that says
   * "no result recorded" is honest; falling through to a draw pill would
   * invent a result the source never claimed.
   */
  it.each(['*', '', '?'])('resultBadge_%s_RefusesToInventAResult', (result) => {
    const markup = pill(result)
    expect(markup).toContain('No result recorded')
    expect(markup).toContain('result-pill--unknown')
    expect(markup).not.toContain('½')
  })
})
