import { describe, expect, it } from 'vitest'
import { decisive, drawn, IN_PROGRESS } from '@domain/chess/GameOutcome'
import type { PlayedMove } from '@domain/chess/Move'
import { UNLIMITED, suddenDeath } from '@domain/clock/TimeControl'
import type { LiveGameState } from './LiveGame'
import { recordGame, toPgnDate, type RecordGameDetails } from './recordGame'

/*
 * The last step before a game someone played becomes a row in their library.
 * Pure, so the mapping is checked here rather than through a database — and
 * anything it drops is dropped for good, because the live game is gone by the
 * time anyone notices.
 */

const move = (san: string, ply: number): PlayedMove =>
  ({ san, ply, from: 'e2', to: 'e4' }) as PlayedMove

const stateWith = (overrides: Partial<LiveGameState>): LiveGameState =>
  ({
    outcome: IN_PROGRESS,
    timeControl: UNLIMITED,
    history: [],
    ...overrides,
  }) as LiveGameState

const DETAILS: RecordGameDetails = {
  whiteName: 'Player',
  blackName: 'Stockfish',
  event: 'Casual game',
  site: 'ClaudeChessApp',
  at: new Date(2026, 8, 9, 14, 30),
}

describe('recordGame', () => {
  it('recordGame_FinishedGame_CarriesEveryFieldTheLibraryStores', () => {
    const state = stateWith({
      outcome: decisive('white', 'checkmate'),
      timeControl: suddenDeath(5, 3),
      history: [move('e4', 1), move('e5', 2)],
    })

    const recorded = recordGame(state, DETAILS)

    expect(recorded).toEqual({
      white: 'Player',
      black: 'Stockfish',
      event: 'Casual game',
      site: 'ClaudeChessApp',
      playedOn: '2026.09.09',
      outcome: { status: 'decisive', winner: 'white', reason: 'checkmate' },
      timeControl: suddenDeath(5, 3),
      moves: [move('e4', 1), move('e5', 2)],
      recordedAt: DETAILS.at.toISOString(),
    })
  })

  it('recordGame_NamesFromDetails_DoesNotSwapTheColours', () => {
    const recorded = recordGame(stateWith({}), {
      ...DETAILS,
      whiteName: 'Alice',
      blackName: 'Bob',
    })

    expect(recorded.white).toBe('Alice')
    expect(recorded.black).toBe('Bob')
  })

  it('recordGame_MoveHistory_KeepsTheMovesInPlayOrder', () => {
    const state = stateWith({
      history: [move('e4', 1), move('e5', 2), move('Nf3', 3)],
    })

    const recorded = recordGame(state, DETAILS)

    expect(recorded.moves.map((played) => played.san)).toEqual(['e4', 'e5', 'Nf3'])
  })

  it('recordGame_DrawnGame_KeepsTheDrawReasonRatherThanFlatteningIt', () => {
    const state = stateWith({ outcome: drawn('threefold_repetition') })

    const recorded = recordGame(state, DETAILS)

    expect(recorded.outcome).toEqual({ status: 'draw', reason: 'threefold_repetition' })
  })

  // Saving mid-game is allowed; the row simply has no result yet.
  it('recordGame_UnfinishedGame_RecordsItAsStillInProgress', () => {
    const state = stateWith({ outcome: IN_PROGRESS })

    const recorded = recordGame(state, DETAILS)

    expect(recorded.outcome).toEqual({ status: 'in_progress' })
  })

  it('recordGame_GameWithNoMoves_RecordsAnEmptyMoveList', () => {
    const state = stateWith({ history: [] })

    const recorded = recordGame(state, DETAILS)

    expect(recorded.moves).toEqual([])
  })

  it('recordGame_UntimedGame_RecordsTheUnlimitedControlRatherThanOmittingIt', () => {
    const state = stateWith({ timeControl: UNLIMITED })

    const recorded = recordGame(state, DETAILS)

    expect(recorded.timeControl).toEqual({ kind: 'unlimited' })
  })

  /*
   * `recordedAt` orders a player's own games, so it is the instant — UTC, to
   * the millisecond — while `playedOn` is the calendar date they saw. The two
   * are deliberately different views of one moment.
   */
  it('recordGame_AnyGame_StampsRecordedAtAsAnIsoInstant', () => {
    const at = new Date(Date.UTC(2026, 8, 9, 12, 0, 0))

    const recorded = recordGame(stateWith({}), { ...DETAILS, at })

    expect(recorded.recordedAt).toBe('2026-09-09T12:00:00.000Z')
  })

  it('recordGame_CalledTwiceWithTheSameInput_ProducesTheSameRow', () => {
    const state = stateWith({ outcome: decisive('black', 'resignation') })

    const first = recordGame(state, DETAILS)
    const second = recordGame(state, DETAILS)

    expect(first).toEqual(second)
  })
})

/*
 * PGN dates are `YYYY.MM.DD` and always zero-padded — a reader that expects
 * fixed-width fields will mis-slice "2026.9.9".
 */
describe('toPgnDate', () => {
  it('toPgnDate_TwoDigitMonthAndDay_WritesThemUnchanged', () => {
    const formatted = toPgnDate(new Date(2026, 10, 25))

    expect(formatted).toBe('2026.11.25')
  })

  it('toPgnDate_SingleDigitMonthAndDay_PadsBothToTwoDigits', () => {
    const formatted = toPgnDate(new Date(2026, 0, 5))

    expect(formatted).toBe('2026.01.05')
  })

  it('toPgnDate_FirstInstantOfTheYear_DoesNotRollBackToTheYearBefore', () => {
    const formatted = toPgnDate(new Date(2026, 0, 1, 0, 0, 0))

    expect(formatted).toBe('2026.01.01')
  })

  it('toPgnDate_LastInstantOfTheYear_DoesNotRollForward', () => {
    const formatted = toPgnDate(new Date(2026, 11, 31, 23, 59, 59))

    expect(formatted).toBe('2026.12.31')
  })

  it('toPgnDate_LeapDay_WritesTheTwentyNinth', () => {
    const formatted = toPgnDate(new Date(2028, 1, 29))

    expect(formatted).toBe('2028.02.29')
  })
})
