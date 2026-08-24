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

  it('has nothing to undo before a move is played', async () => {
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

  it('takes back one ply in pass-and-play and hands the turn back', async () => {
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

  it('gives back the time the taken-back move was charged', async () => {
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

  it('resurrects a finished game, clearing the outcome', async () => {
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

  it('builds its state on demand before the game starts', () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    expect(game.state.history).toHaveLength(0)
    expect(game.state.awaiting).toBeNull()
    expect(game.state.canUndo).toBe(false)
  })

  it('notifies subscribers, and stops after unsubscribe', async () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )
    const seen: string[] = []
    const unsubscribe = game.subscribe((state) => seen.push(state.awaiting?.name ?? '-'))

    game.start()
    await flushAsync()
    expect(seen.length).toBeGreaterThan(0)

    const count = seen.length
    unsubscribe()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync()
    expect(seen.length).toBe(count)
  })

  it('ignores a second start, and a start after dispose', async () => {
    const white = new HumanOpponent('A')
    const game = new LiveGame(
      { rules, ticker },
      { white, black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    // A second loop would issue a second move request and cancel the first.
    game.start()
    await flushAsync()
    expect(game.submitMove({ from: 'e2', to: 'e4' })).toBe(true)
    await flushAsync()
    expect(game.state.history.map((move) => move.san)).toEqual(['e4'])

    game.dispose()
    game.start()
    await flushAsync()
    // Disposed stays disposed: no loop resumes, so the board is refused and
    // the history cannot grow.
    expect(game.submitMove({ from: 'e7', to: 'e5' })).toBe(false)
    expect(game.state.history.map((move) => move.san)).toEqual(['e4'])
  })

  it("refuses a board move while it is the engine's turn", async () => {
    // A scripted opponent with no script: an engine still thinking.
    const engine = new ScriptedOpponent('Computer', [])
    const game = new LiveGame(
      { rules, ticker },
      { white: engine, black: new HumanOpponent('You'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()

    expect(game.submitMove({ from: 'e2', to: 'e4' })).toBe(false)
    game.dispose()
  })

  it('lets the first result stand when resign or draw arrives late', async () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.resign('white')

    game.resign('black')
    game.agreeDraw('fifty_move_rule')

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'resignation',
    })
  })

  it('records an agreed draw', async () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.agreeDraw()

    expect(game.state.outcome).toEqual({ status: 'draw', reason: 'agreement' })
  })

  it('keeps charging the clock after an undo restarts the ticker', async () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: suddenDeath(5) },
    )

    game.start()
    await flushAsync()
    game.submitMove({ from: 'e2', to: 'e4' })
    await flushAsync()
    game.undo()
    await flushAsync()

    ticker.advance(10_000)
    await flushAsync()
    expect(game.state.clock.whiteMs).toBe(290_000)
  })

  it('survives a second dispose', () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.dispose()
    game.dispose()
    expect(game.state.canUndo).toBe(false)
  })

  it('ignores a tick that moved no clock', async () => {
    const game = new LiveGame(
      { rules, ticker },
      { white: new HumanOpponent('A'), black: new HumanOpponent('B'), timeControl: suddenDeath(5) },
    )
    game.start()
    await flushAsync()

    const seen: number[] = []
    game.subscribe((state) => seen.push(state.clock.whiteMs ?? -1))

    // Zero elapsed charges nothing, so nothing should be published either.
    ticker.advance(0)
    await flushAsync()
    expect(seen).toHaveLength(0)
    game.dispose()
  })

  it('discards a move that resolves after the game was settled', async () => {
    // An opponent whose search cannot be cancelled: the promise survives the
    // game ending, exactly like a worker that answers after the flag fell.
    let deliver: ((intent: MoveIntent) => void) | null = null
    const stubborn = {
      kind: 'engine' as const,
      name: 'Stubborn',
      requestMove: () =>
        new Promise<MoveIntent>((resolve) => {
          deliver = resolve
        }),
      cancel: () => {},
      dispose: () => {},
    }
    const game = new LiveGame(
      { rules, ticker },
      { white: stubborn, black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync()
    game.agreeDraw()

    deliver!({ from: 'e2', to: 'e4' })
    await flushAsync(8)

    expect(game.state.history).toHaveLength(0)
    expect(game.state.outcome).toEqual({ status: 'draw', reason: 'agreement' })
  })

  it('forfeits an engine that proposes an illegal move', async () => {
    const engine = new ScriptedOpponent('Broken', [{ from: 'e2', to: 'e5' }])
    const game = new LiveGame(
      { rules, ticker },
      { white: engine, black: new HumanOpponent('B'), timeControl: UNLIMITED },
    )

    game.start()
    await flushAsync(8)

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'resignation',
    })
    expect(game.state.history).toHaveLength(0)
  })
})
