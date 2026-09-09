import { describe, expect, it } from 'vitest'
import { parseArchivedGame } from './parseArchivedGame'
import { splitPgnGames } from './splitPgnGames'

/*
 * Integration across the PGN pipeline: splitter, header reader, clock reader,
 * time-control reader and the rules engine, driven through the one entry point
 * import actually calls. The parts are unit-tested in their own siblings; what
 * is exercised here is the seam between them — a real chess.js instance, not a
 * mock, because the thing worth testing is that the moves genuinely play out.
 */

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

const CHECKMATE = `[Event "Quick"]
[White "A"]
[Black "B"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`

const firstOf = (pgn: string): string => {
  const [game] = splitPgnGames(pgn)
  return game ?? ''
}

describe('parseArchivedGame', () => {
  it('parseArchivedGame_TaggedGame_PlaysEveryMoveOutIntoPositions', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game?.moves.map((move) => move.san)).toEqual(['c4', 'e6', 'Nf3', 'd5'])
    expect(game?.moves.map((move) => move.color)).toEqual([
      'white',
      'black',
      'white',
      'black',
    ])
    expect(game?.moves.map((move) => move.ply)).toEqual([1, 2, 3, 4])
  })

  it('parseArchivedGame_TaggedGame_BridgesEachMoveBetweenItsTwoPositions', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game?.moves[0]?.positionBefore.sideToMove).toBe('white')
    expect(game?.moves[0]?.positionAfter.sideToMove).toBe('black')
    // The position one move ends in is the position the next begins from.
    expect(game?.moves[1]?.positionBefore.fen).toBe(game?.moves[0]?.positionAfter.fen)
  })

  it('parseArchivedGame_TaggedGame_CarriesTheHeaderFieldsThrough', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game).toMatchObject({
      id: 'g0',
      white: 'Fischer, Robert J.',
      black: 'Spassky, Boris V.',
      event: 'Test Match',
      site: 'Somewhere',
      date: '1972.07.11',
      round: '1',
      result: '0-1',
    })
  })

  /*
   * The index counts move numbers in the text; this counts the moves that were
   * actually played. Four half-moves are two full moves, and the exact figure
   * has to win — otherwise an annotated game keeps the inflated estimate.
   */
  it('parseArchivedGame_PlayedMoves_ReplacesTheIndexEstimateWithAnExactCount', () => {
    const annotated = `[Event "E"]\n[Result "*"]\n\n1. e4 {see 99. Qh8} e5 *\n`

    const game = parseArchivedGame(annotated, 'noisy')

    expect(game?.moves).toHaveLength(2)
    expect(game?.moveCount).toBe(1)
  })

  it('parseArchivedGame_ClockAnnotations_AttachesEachReadingToTheMoveThatProducedIt', () => {
    const game = parseArchivedGame(GAME_WITH_CLOCKS, 'clk')

    expect(game?.hasRecordedClocks).toBe(true)
    expect(game?.moves.map((move) => move.recordedClockMs)).toEqual([
      7_152_000,
      7_120_000,
      7_025_000,
    ])
  })

  it('parseArchivedGame_TimeControlTag_ResolvesItIntoStages', () => {
    const game = parseArchivedGame(GAME_WITH_CLOCKS, 'clk')

    expect(game?.declaredTimeControl).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 1_800_000, incrementMs: 30_000 },
      ],
    })
  })

  it('parseArchivedGame_NoClockAnnotations_LeavesEveryReadingNull', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game?.hasRecordedClocks).toBe(false)
    expect(game?.moves.map((move) => move.recordedClockMs)).toEqual([null, null, null, null])
  })

  it('parseArchivedGame_NoTimeControlTag_ReportsNoDeclaredControl', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game?.declaredTimeControl).toBeNull()
  })
})

/*
 * A PGN records who won, never why. The reason has to come from the board or
 * from a `Termination` tag this app wrote itself — and getting it wrong shows
 * the player a banner claiming a checkmate that never happened.
 */
describe('parseArchivedGame outcomes', () => {
  it('parseArchivedGame_MateOnTheBoard_ReportsCheckmateWithoutATerminationTag', () => {
    const game = parseArchivedGame(CHECKMATE, 'mate')

    expect(game?.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
  })

  it('parseArchivedGame_DecisiveResultWithNoMate_ReportsTheReasonAsUnknown', () => {
    const pgn = firstOf(TWO_GAMES)

    const game = parseArchivedGame(pgn, 'g0')

    expect(game?.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'unknown',
    })
  })

  it('parseArchivedGame_RecognisedTerminationTag_TrustsItOverTheBoard', () => {
    const resigned = `[Event "E"]\n[Result "1-0"]\n[Termination "resignation"]\n\n1. e4 e5 1-0\n`

    const game = parseArchivedGame(resigned, 'res')

    expect(game?.outcome).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'resignation',
    })
  })

  it('parseArchivedGame_UnrecognisedTerminationTag_FallsBackToTheBoard', () => {
    const odd = `[Event "E"]\n[Result "1-0"]\n[Termination "abandoned by arbiter"]\n\n1. e4 e5 1-0\n`

    const game = parseArchivedGame(odd, 'odd')

    expect(game?.outcome).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'unknown',
    })
  })

  it('parseArchivedGame_DrawnResultWithNoTermination_FallsBackToAgreement', () => {
    const drawn = `[Event "E"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2\n`

    const game = parseArchivedGame(drawn, 'draw')

    expect(game?.outcome).toEqual({ status: 'draw', reason: 'agreement' })
  })

  it('parseArchivedGame_DrawTerminationTag_TrustsTheRecordedReason', () => {
    const repetition = `[Event "E"]\n[Result "1/2-1/2"]\n[Termination "threefold_repetition"]\n\n1. e4 e5 1/2-1/2\n`

    const game = parseArchivedGame(repetition, 'rep')

    expect(game?.outcome).toEqual({ status: 'draw', reason: 'threefold_repetition' })
  })

  it('parseArchivedGame_UnfinishedResult_ReportsTheGameAsStillInProgress', () => {
    const game = parseArchivedGame(GAME_WITH_CLOCKS, 'clk')

    expect(game?.outcome).toEqual({ status: 'in_progress' })
  })
})

/*
 * One malformed game in a file of thousands should cost that game and nothing
 * else, so the failure mode has to be a null rather than a thrown error.
 */
describe('parseArchivedGame rejections', () => {
  it('parseArchivedGame_IllegalMoveInMovetext_ReturnsNullRatherThanThrowing', () => {
    const broken = `[Event "Broken"]\n[Result "*"]\n\n1. e4 zz9 *\n`

    const game = parseArchivedGame(broken, 'bad')

    expect(game).toBeNull()
  })

  it('parseArchivedGame_MoveThatIsLegalNotationButIllegalHere_ReturnsNull', () => {
    const impossible = `[Event "Broken"]\n[Result "*"]\n\n1. e4 e5 2. Qh8 *\n`

    const game = parseArchivedGame(impossible, 'bad')

    expect(game).toBeNull()
  })

  it('parseArchivedGame_EmptyInput_ReturnsAGameWithNoMovesRatherThanNull', () => {
    const game = parseArchivedGame('', 'empty')

    expect(game?.moves).toEqual([])
    expect(game?.moveCount).toBe(0)
    expect(game?.outcome).toEqual({ status: 'in_progress' })
  })
})
