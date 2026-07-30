import { describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import { UNLIMITED } from '@domain/clock/TimeControl'
import { difficultyById } from '@application/Difficulty'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { ChessEngine, EngineConfiguration } from '@application/ports/ChessEngine'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { FakeTicker, flushAsync } from '../testing/fakes'
import { GameFactory } from './GameFactory'
import type { AppServices } from './services'

/** Deals out scripted moves; which seat asks is what the factory decides. */
class ScriptedEngine implements ChessEngine {
  configured: EngineConfiguration | null = null
  private index = 0

  constructor(private readonly moves: readonly MoveIntent[] = []) {}

  init(): Promise<void> {
    return Promise.resolve()
  }

  configure(configuration: EngineConfiguration): Promise<void> {
    this.configured = configuration
    return Promise.resolve()
  }

  chooseMove(): Promise<MoveIntent> {
    const move = this.moves[this.index]
    this.index += 1
    // Out of script: still thinking, which is a promise that never settles.
    return move === undefined ? new Promise<never>(() => {}) : Promise.resolve(move)
  }

  stop(): void {}
  dispose(): void {}
}

/** Services that hand out the given engines in order, and nothing else. */
function servicesWithEngines(engines: readonly ChessEngine[]): AppServices {
  let next = 0
  return {
    rules: new ChessJsRules(),
    archive: null as never,
    store: null as never,
    createTicker: () => new FakeTicker(),
    createEngine: () => {
      const engine = engines[next]
      next += 1
      if (engine === undefined) throw new Error('More engines requested than provided')
      return engine
    },
  }
}

const configuration = (overrides: Partial<GameConfiguration>): GameConfiguration => ({
  opponent: 'computer',
  playerColor: 'white',
  timeControl: UNLIMITED,
  difficulty: difficultyById('casual'),
  ...overrides,
})

describe('GameFactory', () => {
  it('seats an engine on both sides of a computer-vs-computer game', async () => {
    // Fool's mate, dealt to the seats it belongs to: the game only finishes if
    // each colour's moves really came from its own engine.
    const white = new ScriptedEngine([
      { from: 'f2', to: 'f3' },
      { from: 'g2', to: 'g4' },
    ])
    const black = new ScriptedEngine([
      { from: 'e7', to: 'e5' },
      { from: 'd8', to: 'h4' },
    ])
    const factory = new GameFactory(servicesWithEngines([white, black]))

    const game = factory.createLiveGame(configuration({ opponent: 'engines' }))
    game.start()
    await flushAsync(20)

    expect(game.state.outcome).toEqual({
      status: 'decisive',
      winner: 'black',
      reason: 'checkmate',
    })
    expect(game.state.history.map((move) => move.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    // Each seat got its own engine, both configured at the chosen difficulty.
    expect(white.configured).toEqual(difficultyById('casual').configuration)
    expect(black.configured).toEqual(difficultyById('casual').configuration)
    game.dispose()
  })

  it('names the engine seats by the colour they play', () => {
    const factory = new GameFactory(
      servicesWithEngines([new ScriptedEngine(), new ScriptedEngine()]),
    )

    const game = factory.createLiveGame(configuration({ opponent: 'engines' }))
    game.start()

    expect(game.state.awaiting).toMatchObject({ kind: 'engine', name: 'Stockfish (White)' })
    game.dispose()
  })

  it('still seats the person opposite the engine in an ordinary computer game', async () => {
    const engine = new ScriptedEngine([{ from: 'e2', to: 'e4' }])
    const factory = new GameFactory(servicesWithEngines([engine]))

    const game = factory.createLiveGame(configuration({ playerColor: 'black' }))
    game.start()
    await flushAsync(8)

    // The engine took White and has moved; the person is on the move as Black.
    expect(game.state.history.map((move) => move.san)).toEqual(['e4'])
    expect(game.state.awaiting).toMatchObject({ kind: 'human' })
    game.dispose()
  })
})
