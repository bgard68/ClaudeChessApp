import { describe, expect, it } from 'vitest'
import { parseArchivedGame } from '@infrastructure/pgn/parseArchivedGame'
import { classical, UNLIMITED } from '@domain/clock/TimeControl'
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

/** Clock readings, but no TimeControl tag to say what budget they came from. */
const CLOCKED_UNDECLARED_GAME = `[Event "Broadcast"]
[Date "2021.12.03"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 {[%clk 0:01:00]} e5 {[%clk 0:00:50]} *
`

function gameFrom(pgn: string) {
  const game = parseArchivedGame(pgn, 'test')
  if (game === null) throw new Error('fixture failed to parse')
  return game
}

describe('ReplayClockModel', () => {
  it('uses recorded readings when the PGN carries them', () => {
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

  it('falls back to a simulation, and says so, for games with no clock record', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME))

    expect(model.source).toBe('simulated')
    expect(model.assumedControl).not.toBeNull()
  })

  it('starts both simulated clocks at the full budget', () => {
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

  it('spends the first control at an even pace', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), classical(40, 120, 60))
    const perMove = (120 * 60_000) / 40

    expect(model.readingAt(1).whiteMs).toBe(120 * 60_000 - perMove)
    expect(model.readingAt(3).whiteMs).toBe(120 * 60_000 - 2 * perMove)
  })

  it('clamps requests beyond the end of the game', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME))
    expect(model.readingAt(999)).toEqual(model.readingAt(6))
  })

  it('clamps a negative ply back to the start', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME))
    expect(model.readingAt(-5)).toEqual(model.readingAt(0))
  })

  it('reports no reading at all under an unlimited control', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), UNLIMITED)

    // An untimed game has no budget to spend, so there is nothing to show —
    // and nothing invented in its place.
    expect(model.readingAt(0)).toEqual({ whiteMs: null, blackMs: null, source: 'simulated' })
    expect(model.readingAt(3).whiteMs).toBeNull()
  })

  it('reports no reading for a staged control that declares no stages', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), {
      kind: 'staged',
      stages: [],
    })

    expect(model.readingAt(1).whiteMs).toBeNull()
  })

  it('starts recorded readings from the declared control', () => {
    // The tag says two hours; the reading before either side has moved is
    // that, not a blank.
    const declared = ReplayClockModel.forGame(gameFrom(BROADCAST_GAME))

    expect(declared.readingAt(0).whiteMs).toBe(7_200_000)
    expect(declared.assumedControl).toBeNull()
  })

  it('leaves the opening reading blank when nothing says what the budget was', () => {
    // Clocks were recorded but no control was declared, and the fallback is
    // untimed — so there is no starting figure to show before the first move.
    const model = ReplayClockModel.forGame(gameFrom(CLOCKED_UNDECLARED_GAME), UNLIMITED)

    expect(model.source).toBe('recorded')
    expect(model.readingAt(0).whiteMs).toBeNull()
    // The readings themselves are still the ones the PGN recorded.
    expect(model.readingAt(1).whiteMs).toBe(60_000)
  })

  it('moves into the next stage once the quota is met, and picks up its budget', () => {
    // Two moves in stage one, then the rest: White's third move is paid for
    // out of the second stage's fresh budget.
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), {
      kind: 'staged',
      stages: [
        { movesToComplete: 1, addedMs: 60_000, incrementMs: 0 },
        { movesToComplete: null, addedMs: 600_000, incrementMs: 0 },
      ],
    })

    // After White's first move the first stage is spent and the second opens.
    expect(model.readingAt(1).whiteMs).toBe(600_000)
    expect(model.readingAt(3).whiteMs).toBeLessThan(600_000)
  })

  it('stays in the last stage when its quota is met and none follows', () => {
    // The tag declares a quota on the final stage; there is nowhere to move
    // into, so the pace simply carries on.
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), {
      kind: 'staged',
      stages: [{ movesToComplete: 2, addedMs: 60_000, incrementMs: 0 }],
    })

    // Two moves at half the budget each, then the quota is met with no stage
    // to move into — so the third move simply finds nothing left.
    expect(model.readingAt(1).whiteMs).toBe(30_000)
    expect(model.readingAt(3).whiteMs).toBe(0)
    expect(model.readingAt(5).whiteMs).toBe(0)
  })

  it('adds the increment each stage grants', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), {
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 60_000, incrementMs: 5_000 }],
    })

    // Three of White's moves, so the pace is a third of the budget, and each
    // move hands back five seconds.
    expect(model.readingAt(1).whiteMs).toBe(60_000 - 20_000 + 5_000)
  })

  it('spends an even pace across a game with no move quota', () => {
    const model = ReplayClockModel.forGame(gameFrom(HISTORIC_GAME), {
      kind: 'staged',
      stages: [{ movesToComplete: null, addedMs: 30_000, incrementMs: 0 }],
    })

    // Three White moves out of the six plies, so each costs a third.
    expect(model.readingAt(1).whiteMs).toBe(20_000)
    expect(model.readingAt(5).whiteMs).toBe(0)
  })

  it('has nothing to read for a game with no moves', () => {
    const empty = { ...gameFrom(HISTORIC_GAME), moves: [] }
    const model = ReplayClockModel.forGame(empty)

    expect(model.readingAt(0).whiteMs).toBe(7_200_000)
    expect(model.readingAt(4).whiteMs).toBe(7_200_000)
  })

  it('reads null from a staged control that declares no stages', () => {
    // Recorded clocks, but a control with no first stage to take a starting
    // figure from.
    const model = ReplayClockModel.forGame(gameFrom(CLOCKED_UNDECLARED_GAME), {
      kind: 'staged',
      stages: [],
    })

    expect(model.readingAt(0).whiteMs).toBeNull()
  })
})
