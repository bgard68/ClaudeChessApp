import { describe, expect, it } from 'vitest'
import { suddenDeath, UNLIMITED } from '@domain/clock/TimeControl'
import type { RecordedGame } from '@application/ports/GameStore'
import { HumanOpponent } from '@application/HumanOpponent'
import { LiveGame } from '@application/LiveGame'
import { recordGame } from '@application/recordGame'
import { ChessJsRules } from '../chess/ChessJsRules'
import { FakeTicker, flushAsync } from '../../testing/fakes'
import { parseArchivedGame } from './parseArchivedGame'
import { writePgn } from './writePgn'

const rules = new ChessJsRules()
const DETAILS = {
  whiteName: 'You',
  blackName: 'Computer · Casual',
  event: 'Game vs computer (Casual)',
  site: 'This device',
  at: new Date('2026-07-29T12:00:00Z'),
}

/** Plays a few moves, pausing on the clock between each. */
async function playSampleGame(timeControl = suddenDeath(5)) {
  const ticker = new FakeTicker()
  const white = new HumanOpponent('You')
  const black = new HumanOpponent('Computer · Casual')
  const game = new LiveGame({ rules, ticker }, { white, black, timeControl })

  game.start()
  await flushAsync()

  const play = async (from: string, to: string, thinkMs: number) => {
    ticker.advance(thinkMs)
    game.submitMove({ from, to } as never)
    await flushAsync(6)
  }

  await play('e2', 'e4', 10_000)
  await play('e7', 'e5', 5_000)
  await play('g1', 'f3', 8_000)

  return { game, ticker }
}

describe('writePgn', () => {
  it('writePgn_TimedGame_RecordsTheClockThePlayerActuallyHadLeft', async () => {
    const { game } = await playSampleGame()
    const [first, second] = game.state.history

    // Five minutes less ten seconds of thought.
    expect(first?.clockAfterMs).toBe(300_000 - 10_000)
    expect(second?.clockAfterMs).toBe(300_000 - 5_000)
  })

  it('writePgn_SavedGame_RoundTripsIntoTheArchiveClocksIntact', async () => {
    const { game } = await playSampleGame()
    game.resign('black')

    const pgn = writePgn(recordGame(game.state, DETAILS))
    const parsed = parseArchivedGame(pgn, 'saved-1')

    expect(parsed).not.toBeNull()
    expect(parsed!.white).toBe('You')
    expect(parsed!.black).toBe('Computer · Casual')
    expect(parsed!.date).toBe('2026.07.29')
    expect(parsed!.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])

    // The point of the exercise: a game we played has genuine clock data, so
    // replay shows recorded times rather than an estimate.
    expect(parsed!.hasRecordedClocks).toBe(true)
    expect(parsed!.moves[0]!.recordedClockMs).toBe(290_000)
    expect(parsed!.moves[1]!.recordedClockMs).toBe(295_000)
  })

  it('writePgn_FinishedGame_PreservesTheResultAndWhy', async () => {
    const { game } = await playSampleGame()
    game.resign('black')

    const parsed = parseArchivedGame(writePgn(recordGame(game.state, DETAILS)), 'x')

    expect(parsed!.result).toBe('1-0')
    expect(parsed!.outcome).toEqual({
      status: 'decisive',
      winner: 'white',
      reason: 'resignation',
    })
  })

  it('writePgn_TimedGame_PreservesTheTimeControl', async () => {
    const { game } = await playSampleGame(suddenDeath(3, 2))
    game.resign('black')

    const parsed = parseArchivedGame(writePgn(recordGame(game.state, DETAILS)), 'x')

    expect(parsed!.declaredTimeControl).toEqual({
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 180_000, incrementMs: 2_000 }],
    })
  })

  it('writePgn_UntimedGame_WritesNoClockAnnotations', async () => {
    const { game } = await playSampleGame(UNLIMITED)
    game.resign('black')

    const pgn = writePgn(recordGame(game.state, DETAILS))

    expect(pgn).not.toContain('%clk')
    expect(pgn).toContain('[TimeControl "-"]')
    expect(parseArchivedGame(pgn, 'x')!.hasRecordedClocks).toBe(false)
  })
})

/*
 * Added by the mutation audit. Two gaps: the 80-column wrap was never hit at
 * exactly 80, and a decisive game with an unknown reason was never written.
 */
describe('the edges the audit found unwitnessed', () => {
  const gameWith = (
    outcome: RecordedGame['outcome'],
    moves: RecordedGame['moves'],
  ): RecordedGame => ({
    white: 'A',
    black: 'B',
    event: 'E',
    site: 'S',
    playedOn: '2026.09.09',
    outcome,
    timeControl: UNLIMITED,
    moves,
    recordedAt: '2026-09-09T12:00:00.000Z',
  })

  it('writePgn_LineLandingExactlyOnTheLimit_KeepsItOnOneLine', () => {
    // "1." + space + 77 characters = 80: exactly the limit, so no wrap.
    const fitted = gameWith({ status: 'in_progress' }, [
      { ply: 1, color: 'white', san: 'X'.repeat(77), clockAfterMs: null } as never,
    ])

    const pgn = writePgn(fitted)

    expect(pgn.endsWith(`\n\n1. ${'X'.repeat(77)}\n*\n`)).toBe(true)
  })

  it('writePgn_DecisiveGameWithUnknownReason_WritesNoTerminationTag', () => {
    // "unknown" is the absence of a reason; writing it would record one.
    const unexplained = gameWith(
      { status: 'decisive', winner: 'white', reason: 'unknown' },
      [],
    )

    const pgn = writePgn(unexplained)

    expect(pgn).not.toContain('[Termination')
    expect(pgn).toContain('[Result "1-0"]')
  })
})
