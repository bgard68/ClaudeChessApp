import { beforeEach, describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import { suddenDeath, UNLIMITED } from '@domain/clock/TimeControl'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { flushAsync, FakeTicker, ScriptedOpponent } from '../testing/fakes'
import { HumanOpponent } from './HumanOpponent'
import { LiveGame } from './LiveGame'
import { EngineUnavailable } from './ports/ChessEngine'
import type { Opponent, OpponentKind } from './Opponent'

const rules = new ChessJsRules()

/**
 * A seat whose engine has gone — a worker that failed to start, or died mid
 * search.
 *
 * Distinct from `ScriptedOpponent` running out of script, which stalls. That is
 * the difference the game has to tell: a request nobody will answer because it
 * was abandoned is ordinary, and one nobody will answer because the engine is
 * gone has to be said out loud.
 */
class BrokenEngineOpponent implements Opponent {
  readonly kind: OpponentKind = 'engine'

  constructor(readonly name = 'Computer') {}

  requestMove(): Promise<MoveIntent> {
    return Promise.reject(new EngineUnavailable('The engine stopped responding: out of memory'))
  }

  cancel(): void {}
  dispose(): void {}
}

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

  it('start_ScriptedFoolsMate_PlaysThroughToCheckmate', async () => {
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

  it('offerMove_HumanSeat_DrivesTheSameLoopAsAnEngineSeat', async () => {
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

  it('offerMove_IllegalMove_IsRefusedWithoutEndingTheGame', async () => {
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

  it('advance_ClockRunsOut_AwardsTheGameToTheOpponent', async () => {
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

  it('offerMove_AfterTheGameEnded_IsIgnored', async () => {
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

  it('resign_BySide_RecordsTheLossAgainstThatSide', async () => {
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

  it('dispose_MidGame_StopsTheClockAndTheTicker', async () => {
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

  it('undo_BeforeAnyMove_HasNothingToTakeBack', async () => {
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

    expect(game.state.canUndo).toBe(false)
    expect(game.undo()).toBe(false)
  })

  it('undo_PassAndPlay_TakesBackOnePlyAndHandsTheTurnBack', async () => {
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
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync()
    expect(game.state.canUndo).toBe(true)

    expect(game.undo()).toBe(true)
    await flushAsync()

    expect(game.state.history).toHaveLength(0)
    expect(game.state.position.sideToMove).toBe('white')
    expect(game.state.canUndo).toBe(false)
    // The board must accept the retry, which means the loop is running again.
    expect(game.submitMove({ from: 'd2', to: 'd4' })).toBe(true)
    await flushAsync()
    expect(game.state.history.map((move) => move.san)).toEqual(['d4'])
  })

  it("takes back the engine's reply too, so it is the person's turn again", async () => {
    const human = new HumanOpponent('You')
    const engine = new ScriptedOpponent('Computer', [
      { from: 'e7', to: 'e5' },
      { from: 'd7', to: 'd5' },
    ])
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: engine, timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync(8)
    expect(game.state.history.map((move) => move.san)).toEqual(['e4', 'e5'])

    expect(game.undo()).toBe(true)
    await flushAsync(8)

    // Both plies go: stopping after one would hand the board to the engine.
    expect(game.state.history).toHaveLength(0)
    expect(game.state.position.sideToMove).toBe('white')
    expect(game.state.awaiting?.kind).toBe('human')
  })

  it('undo_ChargedMove_GivesBackTheTimeItCost', async () => {
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

    ticker.advance(30_000)
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync()
    expect(game.state.clock.whiteMs).toBe(270_000)

    game.undo()
    await flushAsync()

    expect(game.state.clock.whiteMs).toBe(300_000)
    expect(ticker.isRunning).toBe(true)
  })

  it('undo_FinishedGame_ResurrectsItAndClearsTheOutcome', async () => {
    const white = new ScriptedOpponent('White', [FOOLS_MATE[0]!, FOOLS_MATE[2]!])
    const black = new ScriptedOpponent('Black', [FOOLS_MATE[1]!, FOOLS_MATE[3]!])
    const game = new LiveGame({ rules, ticker }, { white, black, timeControl: UNLIMITED })

    game.start()
    await flushAsync(12)
    expect(game.state.outcome.status).toBe('decisive')

    expect(game.undo()).toBe(true)
    await flushAsync()

    expect(game.state.outcome.status).toBe('in_progress')
    expect(game.state.history.map((move) => move.san)).toEqual(['f3', 'e5'])
  })
})

/*
 * Added by the mutation audit. Two behaviours had no witness: the state
 * snapshot's memoised identity, and the undo depth in a pass-and-play game.
 */
describe('LiveGame state identity and pass-and-play undo', () => {
  it('state_ReadTwiceWithNothingBetween_ReturnsTheSameSnapshotInstance', () => {
    const game = new LiveGame(
      { rules, ticker: new FakeTicker() },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    const first = game.state
    const second = game.state

    // Identity, not equality: React bails out of re-rendering on the same
    // reference, so a getter that rebuilt every read would repaint every tick.
    // The content check guards the other failure: a cache that "hits" by
    // returning nothing at all would still satisfy an identity comparison.
    expect(second).toBe(first)
    expect(first.history).toEqual([])
    expect(first.outcome).toEqual({ status: 'in_progress' })
    game.dispose()
  })

  it('undo_PassAndPlayGame_TakesBackExactlyOnePly', async () => {
    const white = new HumanOpponent('A')
    const black = new HumanOpponent('B')
    const game = new LiveGame(
      { rules, ticker: new FakeTicker() },
      { white, black, timeControl: UNLIMITED },
    )
    game.start()
    await flushAsync()
    white.offerMove({ from: 'e2', to: 'e4' })
    await flushAsync()
    black.offerMove({ from: 'e7', to: 'e5' })
    await flushAsync()

    const undone = game.undo()
    await flushAsync()

    // Both seats are people, so one press takes back one move — the opponent
    // whose move vanished is a person who can simply move again.
    expect(undone).toBe(true)
    expect(game.state.history.map((move) => move.san)).toEqual(['e4'])
    game.dispose()
  })
})

describe('LiveGame when the engine goes away', () => {
  let ticker: FakeTicker

  beforeEach(() => {
    ticker = new FakeTicker()
  })

  /*
   * The defect this covers.
   *
   * `EngineUnavailable` and an abandoned request both reach the turn loop as a
   * rejection, and the loop caught both the same way: it returned, `awaiting`
   * stayed set, and the screen said the computer was thinking until the page
   * was reloaded. No error, no outcome, nothing to retry.
   */
  it('engineFails_MidGame_SaysSoRatherThanWaitingForever', async () => {
    const human = new HumanOpponent('You')
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: new BrokenEngineOpponent(), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync(8)

    expect(game.state.engineFailure).toMatch(/stopped responding/i)
    expect(game.state.awaiting).toBeNull()
    game.dispose()
  })

  /*
   * A crashed worker is not a chess result. Recording one would write a game
   * the player never lost into their own permanent archive, so the game stays
   * in progress — unplayable, and honest about why.
   */
  it('engineFails_MidGame_RecordsNoResultAndKeepsTheMovesSaveable', async () => {
    const human = new HumanOpponent('You')
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: new BrokenEngineOpponent(), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync(8)

    expect(game.state.outcome.status).toBe('in_progress')
    expect(game.state.history.map((move) => move.san)).toEqual(['e4'])
    expect(game.state.canUndo).toBe(true)
    game.dispose()
  })

  /*
   * The part that costs a game if it is missed: a clock left running charges the
   * player for the engine's failure, and they flag against a dead worker.
   */
  it('engineFails_TimedGame_StopsTheClockRatherThanFlaggingThePlayer', async () => {
    const human = new HumanOpponent('You')
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: new BrokenEngineOpponent(), timeControl: suddenDeath(1) },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync(8)

    expect(ticker.isRunning).toBe(false)
    const stoppedAt = game.state.clock
    ticker.advance(90_000) // Longer than the whole game, had anything been live.

    expect(game.state.clock).toEqual(stoppedAt)
    expect(game.state.outcome.status).toBe('in_progress')
    game.dispose()
  })

  // Terminal: the worker cannot be restarted, so undo must not quietly resume a
  // game that still has nobody to play the other side.
  it('undo_AfterTheEngineFailed_DoesNotRestartTheClockOrTheLoop', async () => {
    const human = new HumanOpponent('You')
    const game = new LiveGame(
      { rules, ticker },
      { white: human, black: new BrokenEngineOpponent(), timeControl: suddenDeath(1) },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync(8)

    expect(game.undo()).toBe(true)
    await flushAsync(8)

    expect(ticker.isRunning).toBe(false)
    expect(game.state.engineFailure).toMatch(/stopped responding/i)
    game.dispose()
  })
})
