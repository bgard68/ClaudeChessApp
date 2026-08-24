import { describe, expect, it } from 'vitest'
import { headerOr, readHeaders, summarise } from './pgnHeaders'

describe('readHeaders', () => {
  it('reads every tag pair', () => {
    expect(readHeaders('[Event "WCh"]\n[Site "Reykjavik"]\n\n1. e4 *')).toEqual({
      Event: 'WCh',
      Site: 'Reykjavik',
    })
  })

  it('accepts an empty tag value', () => {
    expect(readHeaders('[Site ""]\n\n*')).toEqual({ Site: '' })
  })

  it('ignores a line that is not a tag pair', () => {
    // A malformed tag must not stop the well-formed ones being read.
    expect(readHeaders('[Broken\n[Event "WCh"]\n\n*')).toEqual({ Event: 'WCh' })
  })
})

describe('headerOr', () => {
  it('returns the value when there is one', () => {
    expect(headerOr({ White: 'Fischer' }, 'White', 'Unknown')).toBe('Fischer')
  })

  it('falls back for a missing, empty, or placeholder value', () => {
    expect(headerOr({}, 'White', 'Unknown')).toBe('Unknown')
    expect(headerOr({ White: '' }, 'White', 'Unknown')).toBe('Unknown')
    expect(headerOr({ White: '?' }, 'White', 'Unknown')).toBe('Unknown')
  })
})

describe('summarise', () => {
  const pgn = `[Event "World Championship"]
[Site "Reykjavik ISL"]
[Date "1972.07.23"]
[Round "6"]
[White "Fischer, Robert James"]
[Black "Spassky, Boris V"]
[WhiteElo "2785"]
[Result "1-0"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 1-0
`

  it('reads the columns a list needs', () => {
    expect(summarise(pgn, 'g1')).toEqual({
      id: 'g1',
      origin: 'championship',
      white: 'Fischer, Robert James',
      black: 'Spassky, Boris V',
      whiteElo: 2785,
      blackElo: null,
      event: 'World Championship',
      site: 'Reykjavik ISL',
      date: '1972.07.23',
      round: '6',
      result: '1-0',
      moveCount: 3,
      hasRecordedClocks: false,
      nickname: null,
    })
  })

  it('falls back for everything a bare game omits', () => {
    const summary = summarise('1. e4 *', 'g2')

    expect(summary).toMatchObject({
      white: 'Unknown',
      black: 'Unknown',
      event: 'Unknown event',
      site: null,
      date: '????.??.??',
      round: '-',
      result: '*',
      whiteElo: null,
    })
  })

  it('counts by the highest move number in the movetext alone', () => {
    // The 1972 in the Date tag is a bigger number than any move; tags are
    // stripped before counting so it cannot become the move count.
    expect(summarise(pgn, 'g3').moveCount).toBe(3)
  })

  it('keeps the highest move number, not the last one seen', () => {
    // Concatenated or damaged movetext restarts its numbering; the count must
    // not fall back down when it does.
    expect(summarise('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 1. d4 *', 'g4').moveCount).toBe(2)
  })

  it('notices clock annotations and a nickname', () => {
    const annotated = summarise(
      '[Nickname "The Immortal Game"]\n\n1. e4 {[%clk 0:59:00]} e5 *',
      'g5',
    )

    expect(annotated.hasRecordedClocks).toBe(true)
    expect(annotated.nickname).toBe('The Immortal Game')
  })
})
