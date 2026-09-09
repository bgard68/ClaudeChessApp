import { describe, expect, it } from 'vitest'
import { splitPgnGames } from './splitPgnGames'

const TWO_GAMES = `[Event "Test Match"]
[Round "1"]
[Result "0-1"]

1. c4 e6 2. Nf3 d5 0-1

[Event "Test Match"]
[Round "2"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0
`

/*
 * Import runs every file through this first, so a bad split does not corrupt
 * one game — it corrupts the whole file, and the user sees half-games in their
 * library with no indication anything went wrong.
 */
describe('splitPgnGames', () => {
  it('splitPgnGames_TwoGames_SplitsAtTheNextTagSection', () => {
    const games = splitPgnGames(TWO_GAMES)

    expect(games).toHaveLength(2)
    expect(games[0]).toContain('Round "1"')
    expect(games[0]).not.toContain('Round "2"')
    expect(games[1]).toContain('Round "2"')
  })

  it('splitPgnGames_WindowsLineEndings_SplitsIdenticallyToUnix', () => {
    const crlf = TWO_GAMES.replace(/\n/g, '\r\n')

    const games = splitPgnGames(crlf)

    expect(games).toEqual(splitPgnGames(TWO_GAMES))
  })

  it('splitPgnGames_NoBlankLineBetweenGames_StillSplitsThem', () => {
    const packed = '[Event "A"]\n\n1. e4 *\n[Event "B"]\n\n1. d4 *\n'

    const games = splitPgnGames(packed)

    expect(games).toEqual(['[Event "A"]\n\n1. e4 *', '[Event "B"]\n\n1. d4 *\n'])
  })

  it('splitPgnGames_NoTrailingNewline_KeepsTheFinalGame', () => {
    const unterminated = '[Event "A"]\n\n1. e4 *'

    const games = splitPgnGames(unterminated)

    expect(games).toEqual(['[Event "A"]\n\n1. e4 *'])
  })

  it('splitPgnGames_MovetextBeforeAnyTagSection_KeepsItAsItsOwnEntry', () => {
    const headless = '1. e4 *\n\n[Event "B"]\n\n1. d4 *\n'

    const games = splitPgnGames(headless)

    expect(games).toEqual(['1. e4 *\n', '[Event "B"]\n\n1. d4 *\n'])
  })

  it('splitPgnGames_InlineClockAnnotation_DoesNotSplitMidGame', () => {
    const annotated = '[Event "A"]\n\n1. e4 {[%clk 0:01:00]} e5 *\n'

    const games = splitPgnGames(annotated)

    expect(games).toEqual([annotated])
  })

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   \n\n'],
    ['newlines only', '\n\n\n'],
  ])('splitPgnGames_%s_ReturnsNoGames', (_case, text) => {
    const games = splitPgnGames(text)

    expect(games).toEqual([])
  })

  it('splitPgnGames_TagsWithNoMovetext_ReturnsTheTagsAsOneGame', () => {
    const tagsOnly = '[Event "A"]\n[Site "B"]\n'

    const games = splitPgnGames(tagsOnly)

    expect(games).toEqual([tagsOnly])
  })

  it('splitPgnGames_LeadingBlankLines_DoesNotEmitAnEmptyLeadingGame', () => {
    const padded = '\n\n[Event "A"]\n\n1. e4 *\n'

    const games = splitPgnGames(padded)

    expect(games).toEqual([padded])
  })

  /*
   * The case that used to tear a game in half: broadcast PGN wrapped at a fixed
   * column puts a `[%clk ...]` at the start of a movetext line, and a splitter
   * deciding on the bracket alone read it as the next game's tag section. The
   * import gained a tagless, resultless fragment and said nothing about it.
   */
  it('splitPgnGames_AnnotationAtStartOfMovetextLine_KeepsTheGameWhole', () => {
    const wrapped = '[Event "A"]\n\n1. e4\n[%clk 0:01:00] e5 *\n'

    const games = splitPgnGames(wrapped)

    expect(games).toEqual([wrapped])
  })

  it('splitPgnGames_MultipleWrappedAnnotationLines_StillReturnsOneGame', () => {
    const wrapped =
      '[Event "A"]\n\n1. e4\n[%clk 0:01:00] e5\n[%clk 0:00:58] 2. Nf3\n[%eval 0.2] *\n'

    const games = splitPgnGames(wrapped)

    expect(games).toEqual([wrapped])
  })

  it('splitPgnGames_AnnotationLineBetweenTwoRealGames_SplitsOnlyAtTheTagSection', () => {
    const file = '[Event "A"]\n\n1. e4\n[%clk 0:01:00] e5 *\n\n[Event "B"]\n\n1. d4 *\n'

    const games = splitPgnGames(file)

    expect(games).toEqual([
      '[Event "A"]\n\n1. e4\n[%clk 0:01:00] e5 *\n',
      '[Event "B"]\n\n1. d4 *\n',
    ])
  })

  it.each([
    ['a tag whose value is empty', '[Site ""]'],
    ['a tag name containing digits', '[Round1 "x"]'],
    ['a tag name containing an underscore', '[Time_Control "300"]'],
    ['a tag indented by whitespace', '  [Event "A"]'],
  ])('splitPgnGames_%s_IsStillRecognisedAsATagSection', (_case, tagLine) => {
    const file = `[Event "First"]\n\n1. e4 *\n\n${tagLine}\n\n1. d4 *\n`

    const games = splitPgnGames(file)

    expect(games).toHaveLength(2)
    expect(games[1]).toContain(tagLine.trim())
  })
})
