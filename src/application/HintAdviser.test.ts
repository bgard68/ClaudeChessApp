import { describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ChessEngine, EngineConfiguration } from './ports/ChessEngine'
import { HINT_CONFIGURATION, HintAdviser } from './HintAdviser'

class RecordingEngine implements ChessEngine {
  configurations: EngineConfiguration[] = []
  askedFens: string[] = []
  disposed = false

  init(): Promise<void> {
    return Promise.resolve()
  }

  configure(configuration: EngineConfiguration): Promise<void> {
    this.configurations.push(configuration)
    return Promise.resolve()
  }

  chooseMove(position: Position): Promise<MoveIntent> {
    this.askedFens.push(position.fen)
    return Promise.resolve({ from: 'e2', to: 'e4' })
  }

  stop(): void {}

  dispose(): void {
    this.disposed = true
  }
}

const position = { fen: 'start-fen' } as Position

describe('HintAdviser', () => {
  it('advise_BeforeFirstHint_CreatesNoEngine', () => {
    let created = 0
    void new HintAdviser(() => {
      created += 1
      return new RecordingEngine()
    })

    expect(created).toBe(0)
  })

  it('advise_TwoHints_ConfiguresOnceAndReusesTheEngine', async () => {
    const engine = new RecordingEngine()
    const adviser = new HintAdviser(() => engine)

    await adviser.advise(position)
    await adviser.advise(position)

    expect(engine.configurations).toEqual([HINT_CONFIGURATION])
    expect(engine.askedFens).toEqual(['start-fen', 'start-fen'])
  })

  it('dispose_ThenAdviseAgain_DisposesTheOldEngineAndConfiguresAFreshOne', async () => {
    const engines: RecordingEngine[] = []
    const adviser = new HintAdviser(() => {
      const engine = new RecordingEngine()
      engines.push(engine)
      return engine
    })

    await adviser.advise(position)
    adviser.dispose()
    await adviser.advise(position)

    expect(engines).toHaveLength(2)
    expect(engines[0]!.disposed).toBe(true)
    expect(engines[1]!.disposed).toBe(false)
    // The replacement engine was configured for itself, not trusted to inherit.
    expect(engines[1]!.configurations).toEqual([HINT_CONFIGURATION])
  })
})
