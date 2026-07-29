import type { MoveIntent } from '@domain/chess/Move'
import type { ChessEngine, EngineConfiguration } from './ports/ChessEngine'
import type { MoveRequest, Opponent, OpponentKind } from './Opponent'

/**
 * Adapts a search engine to the opponent contract.
 *
 * Thin by design — logic accumulating here would mean the engine port was
 * leaking protocol details the application should not know about.
 */
export class EngineOpponent implements Opponent {
  readonly kind: OpponentKind = 'engine'

  private configured = false

  constructor(
    private readonly engine: ChessEngine,
    private readonly configuration: EngineConfiguration,
    readonly name: string = 'Computer',
  ) {}

  async requestMove(request: MoveRequest): Promise<MoveIntent> {
    // Applied on the first request rather than in the constructor, so that
    // difficulty is guaranteed to be set before the engine ever searches —
    // including when the computer has White and moves first.
    if (!this.configured) {
      await this.engine.configure(this.configuration)
      this.configured = true
    }
    return this.engine.chooseMove(request.position)
  }

  cancel(): void {
    this.engine.stop()
  }

  dispose(): void {
    this.engine.dispose()
  }
}
