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
})
