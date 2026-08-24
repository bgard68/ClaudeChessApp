import { describe, expect, it, vi } from 'vitest'
import type { ArchivedGame } from '@domain/archive/ArchivedGame'
import type { MoveIntent } from '@domain/chess/Move'
import { UNLIMITED } from '@domain/clock/TimeControl'
import { difficultyById } from '@application/Difficulty'
import type { GameConfiguration } from '@application/GameConfiguration'
import { HINT_CONFIGURATION } from '@application/HintAdviser'
import type { ChessEngine, EngineConfiguration } from '@application/ports/ChessEngine'
import { PuzzleGenerator } from '@application/puzzle/PuzzleGenerator'
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

  it('seats two people by the colours they play in pass-and-play', () => {
    const factory = new GameFactory(servicesWithEngines([]))

    const white = factory.createLiveGame(configuration({ opponent: 'human' }))
    white.start()
    expect(white.state.awaiting).toMatchObject({ kind: 'human', name: 'White' })
    white.dispose()

    // Sitting on black only turns the board round; the seats keep their names.
    const black = factory.createLiveGame(
      configuration({ opponent: 'human', playerColor: 'black' }),
    )
    black.start()
    expect(black.state.awaiting).toMatchObject({ kind: 'human', name: 'White' })
    black.dispose()
  })

  it('names the person "You" when the opponent is the computer', () => {
    const factory = new GameFactory(servicesWithEngines([new ScriptedEngine()]))

    const game = factory.createLiveGame(configuration({ playerColor: 'white' }))
    game.start()

    expect(game.state.awaiting).toMatchObject({ kind: 'human', name: 'You' })
    game.dispose()
  })

  it('builds a replay session over an archived game', () => {
    const factory = new GameFactory(servicesWithEngines([]))
    const archived = {
      white: 'Fischer',
      black: 'Spassky',
      moves: [],
      declaredTimeControl: null,
      hasRecordedClocks: false,
    } as unknown as ArchivedGame

    const session = factory.createReplaySession(archived)

    expect(session.state.totalPlies).toBe(0)
    expect(session.state.game).toBe(archived)
  })

  it('builds a hint adviser that takes an engine of its own', async () => {
    // The hint must not inherit the opponent's weakness, so it gets its own
    // engine rather than borrowing the one playing the game.
    const hintEngine = new ScriptedEngine([{ from: 'e2', to: 'e4' }])
    const factory = new GameFactory(servicesWithEngines([hintEngine]))

    const adviser = factory.createHintAdviser()
    const rules = new ChessJsRules()

    await expect(adviser.advise(rules.initialPosition())).resolves.toEqual({
      from: 'e2',
      to: 'e4',
    })
    expect(hintEngine.configured).toEqual(HINT_CONFIGURATION)
    adviser.dispose()
  })

  it('builds a puzzle generator that takes an engine of its own', async () => {
    // An engine that abandons every search: the generator should give up
    // cleanly and dispose the engine it asked for, rather than hanging.
    const failing = new ScriptedEngine()
    failing.chooseMove = () => Promise.reject(new Error('search abandoned'))
    const disposed = vi.spyOn(failing, 'dispose')

    const factory = new GameFactory(servicesWithEngines([failing]))
    const generator = factory.createPuzzleGenerator()

    expect(generator).toBeInstanceOf(PuzzleGenerator)
    await expect(generator.generate(1)).rejects.toThrow('could not compose a puzzle')
    expect(disposed).toHaveBeenCalled()
  })
})
