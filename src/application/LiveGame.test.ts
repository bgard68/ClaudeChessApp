import { beforeEach, describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import { suddenDeath, UNLIMITED } from '@domain/clock/TimeControl'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { flushAsync, FakeTicker, ScriptedOpponent } from '../testing/fakes'
import { HumanOpponent } from './HumanOpponent'
import { LiveGame } from './LiveGame'

const rules = new ChessJsRules()

/** 1. f3 e5 2. g4 Qh4# — the fastest mate available. */
const FOOLS_MATE: readonly MoveIntent[] = [
  { from: 'f2', to: 'f3' },
  { from: 'e7', to: 'e5' },
  { from: 'g2', to: 'g4' },
  { from: 'd8', to: 'h4' },
]

describe('LiveGame', () => {
  let ticker: FakeTicker

  beforeEach(() => {
    ticker = new FakeTicker()
  })

  it('plays a scripted game through to checkmate', async () => {
    const white = new ScriptedOpponent('White', [FOOLS_MATE[0]!, FOOLS_MATE[2]!])
    const black = new ScriptedOpponent('Black', [FOOLS_MATE[1]!, FOOLS_MATE[3]!])
    const game = new LiveGame({ rules, ticker }, { white, black, timeControl: UNLIMITED })

    game.start()
    await flushAsync(12)

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
    expect(game.state.history.map((move) => move.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
  })

  it('treats both opponent kinds identically — a human move drives the same loop', async () => {
    const human = new HumanOpponent('You')
    const engine = new ScriptedOpponent('Computer', [{ from: 'e7', to: 'e5' }])
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: engine, timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()

    expect(game.submitMove({ from: 'e2', to: 'e4' })).toBe(true)
    await flushAsync(8)

    expect(game.state.history.map((move) => move.san)).toEqual(['e4', 'e5'])
  })

  it('refuses an illegal move without ending the game', async () => {
    const human = new HumanOpponent('You')
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: new HumanOpponent('Them'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()

    expect(game.submitMove({ from: 'e2', to: 'e5' })).toBe(false)
    expect(game.state.outcome.status).toBe('in_progress')
    expect(game.state.history).toHaveLength(0)
  })

  it('awards the game to the opponent when a clock runs out', async () => {
    const white = new HumanOpponent('Slow')
    const black = new HumanOpponent('Waiting')
    const game = new LiveGame(
      { rules, ticker },
      { white, black, timeControl: suddenDeath(1) },
    )

    game.start()
    await flushAsync()

    ticker.advance(61_000)
    await flushAsync()

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'timeout',
    })
    expect(ticker.isRunning).toBe(false)
  })

  it('ignores a move that arrives after the game has already ended', async () => {
    const white = new HumanOpponent('Slow')
    const game = new LiveGame(
      { rules, ticker },
      { white, black: new HumanOpponent('Them'), timeControl: suddenDeath(1) },
    )

    game.start()
    await flushAsync()
    ticker.advance(61_000)
    await flushAsync()

    expect(game.submitMove({ from: 'e2', to: 'e4' })).toBe(false)
    expect(game.state.history).toHaveLength(0)
  })

  it('records a resignation against the side that resigned', async () => {
    const game = new LiveGame(
      { rules, ticker },
      {
        white: new HumanOpponent('A'),
        black: new HumanOpponent('B'),
        timeControl: UNLIMITED,
      },
    )

    game.start()
    await flushAsync()
    game.resign('white')

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'resignation',
    })
  })

  it('stops the clock and the ticker once disposed', async () => {
    const game = new LiveGame(
      { rules, ticker },
      {
        white: new HumanOpponent('A'),
        black: new HumanOpponent('B'),
        timeControl: suddenDeath(5),
      },
    )

    game.start()
    await flushAsync()
    expect(ticker.isRunning).toBe(true)

    game.dispose()
    expect(ticker.isRunning).toBe(false)
  })
})
