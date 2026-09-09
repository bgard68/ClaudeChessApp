import { describe, expect, it } from 'vitest'
import { headerOr, readHeaders, summarise } from './pgnHeaders'

const GAME = `[Event "Test Match"]
[Site "Reykjavik ISL"]
[Date "1972.07.11"]
[Round "1"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "0-1"]
[WhiteElo "2785"]
[BlackElo "2660"]

1. c4 e6 2. Nf3 d5 0-1
`

describe('readHeaders', () => {
  it('readHeaders_TagSection_ReturnsEveryTagAsAKeyValuePair', () => {
    const headers = readHeaders('[Event "Test Match"]\n[Round "1"]\n\n1. e4 *')

    expect(headers).toEqual({ Event: 'Test Match', Round: '1' })
  })

  it('readHeaders_EmptyTagValue_KeepsTheKeyWithAnEmptyString', () => {
    const headers = readHeaders('[Site ""]\n')

    expect(headers).toEqual({ Site: '' })
  })

  // Last one wins. PGN forbids duplicates, so either answer is defensible —
  // this pins which one the reader actually gives.
  it('readHeaders_DuplicateTag_KeepsTheLastOccurrence', () => {
    const headers = readHeaders('[Event "A"]\n[Event "B"]\n')

    expect(headers).toEqual({ Event: 'B' })
  })

  it('readHeaders_MovetextOnly_ReturnsNoHeaders', () => {
    const headers = readHeaders('1. e4 e5 2. Nf3 *')

    expect(headers).toEqual({})
  })

  it('readHeaders_EmptyInput_ReturnsNoHeaders', () => {
    const headers = readHeaders('')

    expect(headers).toEqual({})
  })

  it('readHeaders_UnterminatedTag_SkipsIt', () => {
    const headers = readHeaders('[Event "A"]\n[Broken "unclosed\n')

    expect(headers).toEqual({ Event: 'A' })
  })
})

describe('headerOr', () => {
  it('headerOr_PresentValue_ReturnsIt', () => {
    const value = headerOr({ Site: 'Reykjavik ISL' }, 'Site', 'Unknown')

    expect(value).toBe('Reykjavik ISL')
  })

  it.each([
    ['a missing key', {}],
    ['an empty value', { Site: '' }],
    ['the PGN unknown marker', { Site: '?' }],
  ])('headerOr_%s_ReturnsTheFallback', (_case, headers) => {
    const value = headerOr(headers, 'Site', 'Unknown')

    expect(value).toBe('Unknown')
  })

  // "-" means "not applicable", which is information — unlike "?".
  it('headerOr_TheNotApplicableMarker_ReturnsItRatherThanTheFallback', () => {
    const value = headerOr({ Site: '-' }, 'Site', 'Unknown')

    expect(value).toBe('-')
  })
})

/*
 * `summarise` builds every row of the archive list, for thousands of games, by
 * reading tags only — no rules engine. Everything the list column shows is
 * decided here.
 */
describe('summarise', () => {
  it('summarise_FullyTaggedGame_BuildsTheCompleteListEntry', () => {
    const summary = summarise(GAME, 'test-0')

    expect(summary).toEqual({
      id: 'test-0',
      origin: 'championship',
      white: 'Fischer, Robert J.',
      black: 'Spassky, Boris V.',
      whiteElo: 2785,
      blackElo: 2660,
      event: 'Test Match',
      site: 'Reykjavik ISL',
      date: '1972.07.11',
      round: '1',
      result: '0-1',
      moveCount: 2,
      hasRecordedClocks: false,
      nickname: null,
    })
  })

  it('summarise_NoTagsAtAll_FillsEveryFieldWithItsFallback', () => {
    const summary = summarise('', 'empty')

    expect(summary).toEqual({
      id: 'empty',
      origin: 'championship',
      white: 'Unknown',
      black: 'Unknown',
      whiteElo: null,
      blackElo: null,
      event: 'Unknown event',
      site: null,
      date: '????.??.??',
      round: '-',
      result: '*',
      moveCount: 0,
      hasRecordedClocks: false,
      nickname: null,
    })
  })

  it('summarise_NonNumericElo_ReportsNullWithoutDiscardingTheOtherSide', () => {
    const summary = summarise('[WhiteElo "abc"]\n[BlackElo "2800"]\n\n1. e4 *', 'elo')

    expect(summary.whiteElo).toBeNull()
    expect(summary.blackElo).toBe(2800)
  })

  it('summarise_ClockAnnotationsPresent_FlagsTheGameAsHavingClocks', () => {
    const summary = summarise('[Event "E"]\n\n1. e4 {[%clk 1:59:12]} *', 'clk')

    expect(summary.hasRecordedClocks).toBe(true)
  })

  it('summarise_NicknameTag_CarriesItThrough', () => {
    const summary = summarise('[Nickname "The Immortal Game"]\n\n1. e4 *', 'nick')

    expect(summary.nickname).toBe('The Immortal Game')
  })

  it('summarise_UnknownSiteMarker_ReportsNullRatherThanAPlaceholderPlace', () => {
    const summary = summarise('[Site "?"]\n\n1. e4 *', 'site')

    expect(summary.site).toBeNull()
  })

  it('summarise_MovetextWithNoMoveNumbers_ReportsZeroMoves', () => {
    const summary = summarise('[Event "E"]\n\n*', 'none')

    expect(summary.moveCount).toBe(0)
  })

  it('summarise_MoveNumberInsideAComment_DoesNotCountItAsAMove', () => {
    const summary = summarise('[Event "E"]\n\n1. e4 {see 99. Qh8} e5 *', 'noisy')

    expect(summary.moveCount).toBe(1)
  })

  /*
   * The case this actually protects. `[%clk 0:00:59.9]` is how Lichess and
   * other broadcast exports write a sub-second clock, and the "59." in it read
   * as a move number — so a two-ply game reached the archive list claiming
   * fifty-nine moves. Whole-second clocks never showed it, which is why it
   * survived: the bundled collections carry no clock comments at all.
   */
  it('summarise_SubSecondClockComments_DoesNotReadTheClockAsAMoveNumber', () => {
    const broadcast = '[Event "B"]\n\n1. e4 {[%clk 0:00:59.9]} e5 {[%clk 0:01:23.4]} *'

    const summary = summarise(broadcast, 'clk')

    expect(summary.moveCount).toBe(1)
  })

  it('summarise_MultipleMoveNumbers_ReportsTheHighest', () => {
    const summary = summarise('[Event "E"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *', 'count')

    expect(summary.moveCount).toBe(3)
  })

  // The approximation that remains, and is deliberate: the count is the highest
  // move number written down, not the number of moves actually played.
  it('summarise_MovetextResumingFromAHighNumber_TrustsTheNumberWritten', () => {
    const summary = summarise('[Event "E"]\n\n41. Kg2 Rd8 *', 'resumed')

    expect(summary.moveCount).toBe(41)
  })
})
