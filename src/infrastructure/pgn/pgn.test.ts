import { describe, expect, it } from 'vitest'
import { parseClockComment } from './clockComment'
import { parseArchivedGame } from './parseArchivedGame'
import { summarise } from './pgnHeaders'
import { splitPgnGames } from './splitPgnGames'
import { parseTimeControlTag } from './timeControlTag'

const TWO_GAMES = `[Event "Test Match"]
[Site "Somewhere"]
[Date "1972.07.11"]
[Round "1"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "0-1"]

1. c4 e6 2. Nf3 d5 0-1

[Event "Test Match"]
[Site "Somewhere"]
[Date "1972.07.13"]
[Round "2"]
[White "Spassky, Boris V."]
[Black "Fischer, Robert J."]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0
`

const GAME_WITH_CLOCKS = `[Event "Broadcast"]
[Date "2021.12.03"]
[White "A"]
[Black "B"]
[Result "*"]
[TimeControl "40/7200:1800+30"]

1. e4 {[%clk 1:59:12]} e5 {[%clk 1:58:40]} 2. Nf3 {[%clk 1:57:05]} *
`

describe('splitPgnGames', () => {
  it('separates games at the start of the next tag section', () => {
    const games = splitPgnGames(TWO_GAMES)
    expect(games).toHaveLength(2)
    expect(games[0]).toContain('Round "1"')
    expect(games[1]).toContain('Round "2"')
  })

  it('handles Windows line endings and trailing whitespace', () => {
    expect(splitPgnGames(TWO_GAMES.replace(/\n/g, '\r\n'))).toHaveLength(2)
  })

  it('returns nothing for empty input', () => {
    expect(splitPgnGames('   \n\n')).toEqual([])
  })
})

describe('summarise', () => {
  it('reads the tag pairs without playing the moves', () => {
    const [first] = splitPgnGames(TWO_GAMES)
    const summary = summarise(first!, 'test-0')

    expect(summary).toMatchObject({
      id: 'test-0',
      white: 'Fischer, Robert J.',
      black: 'Spassky, Boris V.',
      event: 'Test Match',
      date: '1972.07.11',
      result: '0-1',
      moveCount: 2,
      hasRecordedClocks: false,
    })
  })

  it('notices when clock annotations are present', () => {
    expect(summarise(GAME_WITH_CLOCKS, 'x').hasRecordedClocks).toBe(true)
  })
})

describe('parseClockComment', () => {
  it('reads hours, minutes, and seconds', () => {
    expect(parseClockComment('[%clk 1:29:35]')).toBe((3600 + 29 * 60 + 35) * 1000)
  })

  it('reads tenths of a second', () => {
    expect(parseClockComment('[%clk 0:00:59.9]')).toBe(59_900)
  })

  it('treats the hour field as optional', () => {
    expect(parseClockComment('[%clk 12:34]')).toBe((12 * 60 + 34) * 1000)
  })

  it('returns null for a comment with no clock in it', () => {
    expect(parseClockComment('a fine move')).toBeNull()
  })
})

describe('parseTimeControlTag', () => {
  it('parses a staged classical control', () => {
    expect(parseTimeControlTag('40/7200:1800')).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 0 },
      ],
    })
  })

  it('parses a sudden-death control with an increment', () => {
    expect(parseTimeControlTag('300+3')).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 300_000, incrementMs: 3_000 }],
    })
  })

  it('returns null for the unknown and unspecified markers', () => {
    expect(parseTimeControlTag('?')).toBeNull()
    expect(parseTimeControlTag('-')).toBeNull()
    expect(parseTimeControlTag(undefined)).toBeNull()
  })

  it('returns null rather than guessing at malformed input', () => {
    expect(parseTimeControlTag('soon')).toBeNull()
  })
})

describe('parseArchivedGame', () => {
  it('plays the moves out into positions', () => {
    const [first] = splitPgnGames(TWO_GAMES)
    const game = parseArchivedGame(first!, 'g0')

    expect(game).not.toBeNull()
    expect(game!.moves.map((move) => move.san)).toEqual(['c4', 'e6', 'Nf3', 'd5'])
    expect(game!.moves[0]!.color).toBe('white')
    expect(game!.moves[1]!.color).toBe('black')
    expect(game!.moves[0]!.positionAfter.sideToMove).toBe('black')
    expect(game!.outcome).toEqual({ status: 'decisive', winner: 'black', reason: 'unknown' })
  })

  it('attaches recorded clock readings to the moves that produced them', () => {
    const game = parseArchivedGame(GAME_WITH_CLOCKS, 'clk')

    expect(game!.hasRecordedClocks).toBe(true)
    expect(game!.moves[0]!.recordedClockMs).toBe((3600 + 59 * 60 + 12) * 1000)
    expect(game!.moves[1]!.recordedClockMs).toBe((3600 + 58 * 60 + 40) * 1000)
    expect(game!.declaredTimeControl).not.toBeNull()
  })

  it('leaves clock readings null when the source recorded none', () => {
    const [first] = splitPgnGames(TWO_GAMES)
    const game = parseArchivedGame(first!, 'g0')

    expect(game!.hasRecordedClocks).toBe(false)
    expect(game!.moves.every((move) => move.recordedClockMs === null)).toBe(true)
  })

  it('returns null for unparseable movetext instead of throwing', () => {
    const broken = `[Event "Broken"]\n[Result "*"]\n\n1. e4 zz9 *\n`
    expect(parseArchivedGame(broken, 'bad')).toBeNull()
  })
})

/*
 * A PGN records who won, never why. Games this app saved say so in a
 * Termination tag; for every other game only what the final board shows can
 * be established, and anything else would be invention.
 */
describe('recovering why a game ended', () => {
  const game = (result: string, movetext: string, termination?: string) =>
    parseArchivedGame(
      `[Event "T"]\n[Result "${result}"]\n${
        termination === undefined ? '' : `[Termination "${termination}"]\n`
      }\n${movetext}\n`,
      'x',
    )

  it('trusts a Termination tag it recognises', () => {
    expect(game('1-0', '1. e4 e5 1-0', 'resignation')?.outcome).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'resignation',
    })
    expect(game('0-1', '1. e4 e5 0-1', 'timeout')?.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'timeout',
    })
  })

  it('ignores a Termination tag naming a reason it does not know', () => {
    // "unterminated" is not one of the reasons the domain models, and the
    // board shows no mate, so the honest answer is that nobody knows.
    expect(game('1-0', '1. e4 e5 1-0', 'unterminated')?.outcome).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'unknown',
    })
  })

  it('reads checkmate off the final board when no tag says so', () => {
    expect(game('0-1', '1. f3 e5 2. g4 Qh4# 0-1')?.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
  })

  it('trusts a draw reason the tag names', () => {
    expect(game('1/2-1/2', '1. e4 e5 1/2-1/2', 'threefold_repetition')?.outcome).toEqual({
      status: 'draw',
      reason: 'threefold_repetition',
    })
  })

  it('reads stalemate off the final board', () => {
    // Qg6 leaves the black king on h8 with no legal move and no check.
    const stalemate = parseArchivedGame(
      `[Event "T"]\n[FEN "7k/8/8/6Q1/8/8/8/6K1 w - - 0 1"]\n[SetUp "1"]\n[Result "1/2-1/2"]\n\n1. Qg6 1/2-1/2\n`,
      'x',
    )
    expect(stalemate?.outcome).toEqual({ status: 'draw', reason: 'stalemate' })
  })

  it('reads insufficient material off the final board', () => {
    // Taking the last knight leaves king against king.
    const bare = parseArchivedGame(
      `[Event "T"]\n[FEN "7k/8/8/8/8/8/1n6/K7 w - - 0 1"]\n[SetUp "1"]\n[Result "1/2-1/2"]\n\n1. Kxb2 1/2-1/2\n`,
      'x',
    )
    expect(bare?.outcome).toEqual({ status: 'draw', reason: 'insufficient_material' })
  })

  it('falls back to agreement for a draw the board cannot explain', () => {
    expect(game('1/2-1/2', '1. e4 e5 1/2-1/2')?.outcome).toEqual({
      status: 'draw',
      reason: 'agreement',
    })
  })

  it('leaves an unfinished game in progress', () => {
    expect(game('*', '1. e4 e5 *')?.outcome).toEqual({ status: 'in_progress' })
  })

  it('leaves a comment carrying no clock reading alone', () => {
    const annotated = game('1-0', '1. e4 {a fine move} e5 1-0')

    expect(annotated?.hasRecordedClocks).toBe(false)
    expect(annotated?.moves[0]?.recordedClockMs).toBeNull()
  })
})
