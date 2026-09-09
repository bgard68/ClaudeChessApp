import { describe, expect, it } from 'vitest'
import { parseArchivedGame } from '@infrastructure/pgn/parseArchivedGame'
import { classical } from '@domain/clock/TimeControl'
import { ReplayClockModel } from './ReplayClockModel'

const HISTORIC_GAME = `[Event "World Championship"]
[Date "1972.07.11"]
[White "Fischer"]
[Black "Spassky"]
[Result "0-1"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 0-1
`

const BROADCAST_GAME = `[Event "Broadcast"]
[Date "2021.12.03"]
[White "A"]
[Black "B"]
[Result "*"]
[TimeControl "40/7200:1800"]

1. e4 {[%clk 1:59:00]} e5 {[%clk 1:58:00]} 2. Nf3 {[%clk 1:57:00]} *
`

function gameFrom(pgn: string) {
  const game = parseArchivedGame(pgn, 'test')
  if (game === null) throw new Error('fixture failed to parse')
  return game
}

describe('ReplayClockModel', () => {
  it('forGame_RecordedClockAnnotations_UsesTheRecordedReadings', () => {
    const model = ReplayClockModel.forGame(gameFrom(BROADCAST_GAME))

    expect(model.source).toBe('recorded')
    expect(model.readingAt(1).whiteMs).toBe((3600 + 59 * 60) * 1000)
    expect(model.readingAt(2).blackMs).toBe((3600 + 58 * 60) * 1000)
  })

  it("holds a player's recorded reading steady while the other side thinks", () => {
    const model = ReplayClockModel.forGame(gameFrom(BROADCAST_GAME))

    // White moved at ply 1 and does not move again until ply 3.
    expect(model.readingAt(2).whiteMs).toBe(model.readingAt(1).whiteMs)
  })

  /*
   * Naming the assumed control rather than merely checking one exists: the
   * whole point of saying "simulated" is that the reader can judge the
   * assumption, and a model that assumed a five-minute blitz clock for a 1972
   * championship game would pass a non-null check while showing nonsense.
   */
  it('forGame_NoClockRecord_SimulatesAndNamesTheAssumedControl', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME))

    expect(model.source).toBe('simulated')
    expect(model.assumedControl).toEqual({
      kind: 'staged',
      stages: [
        { movesToComplete: 40, addedMs: 7_200_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 3_600_000, incrementMs: 0 },
      ],
    })
  })

  it('readingAt_PlyZeroSimulated_StartsBothClocksAtTheFullBudget', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), classical(40, 120, 60))
    const start = model.readingAt(0)

    expect(start.whiteMs).toBe(120 * 60_000)
    expect(start.blackMs).toBe(120 * 60_000)
  })

  it("charges White on odd plies and Black on even ones", () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), classical(40, 120, 60))

    // After White's first move, only White's clock has moved.
    expect(model.readingAt(1).whiteMs).toBeLessThan(model.readingAt(0).whiteMs!)
    expect(model.readingAt(1).blackMs).toBe(model.readingAt(0).blackMs)

    // After Black replies, Black's has too — and White's is unchanged.
    expect(model.readingAt(2).blackMs).toBeLessThan(model.readingAt(1).blackMs!)
    expect(model.readingAt(2).whiteMs).toBe(model.readingAt(1).whiteMs)
  })

  it('readingAt_SimulatedFirstControl_SpendsItAtAnEvenPace', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), classical(40, 120, 60))
    const perMove = (120 * 60_000) / 40

    expect(model.readingAt(1).whiteMs).toBe(120 * 60_000 - perMove)
    expect(model.readingAt(3).whiteMs).toBe(120 * 60_000 - 2 * perMove)
  })

  it('readingAt_PlyBeyondTheGame_ClampsToTheFinalReading', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME))
    expect(model.readingAt(999)).toEqual(model.readingAt(6))
  })
})

/*
 * Added by the mutation audit. Two gaps: nothing read a recorded model's
 * starting reading, and nothing crossed a stage boundary in the simulation.
 */
describe('the readings the audit found unwitnessed', () => {
  it('readingAt_PlyZeroOfARecordedGame_ShowsTheDeclaredStartingBudget', () => {
    const model = ReplayClockModel.forGame(gameFrom(BROADCAST_GAME))

    const start = model.readingAt(0)

    expect(start).toEqual({ whiteMs: 7_200_000, blackMs: 7_200_000, source: 'recorded' })
  })

  it('readingAt_SimulatedStageBoundary_AddsTheNextBudgetOnTheQuotaMoveNotAfter', () => {
    // One move completes the first stage, so the second stage's budget lands
    // as White's first move finishes — not one move late.
    const oneMoveStages = {
      kind: 'staged',
      stages: [
        { movesToComplete: 1, addedMs: 60_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 60_000, incrementMs: 0 },
      ],
    } as const
    const fourPlies = `[Event "E"]\n[Result "*"]\n\n1. c4 e6 2. Nf3 d5 *\n`
    const model = ReplayClockModel.forGame(gameFrom(fourPlies), oneMoveStages)

    const afterWhiteFirst = model.readingAt(1)
    const afterAllFour = model.readingAt(4)

    // The whole first budget was spent on the move, and the second arrived.
    expect(afterWhiteFirst.whiteMs).toBe(60_000)
    // Both budgets fully paced out by the second (final) white move.
    expect(afterAllFour.whiteMs).toBe(0)
  })
})
