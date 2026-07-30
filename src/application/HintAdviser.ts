import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ChessEngine, EngineConfiguration } from './ports/ChessEngine'

/**
 * Full strength with a short leash: a hint should be genuinely good whatever
 * the opponent is set to, and a second of search is plenty for advice — the
 * player wants a nudge now, not the best move ever found.
 */
export const HINT_CONFIGURATION: EngineConfiguration = {
  strength: { kind: 'full' },
  searchLimits: { moveTimeMs: 1_200 },
}

/**
 * Suggests the best move in a position, on request.
 *
 * Deliberately separate from the opponent's engine: hints must not inherit the
 * opponent's weakness, and asking the opponent's own search to briefly play
 * full strength would leave its state suspect mid-game. The price is a second
 * worker — created on the first hint rather than up front, so a player who
 * never asks never pays for it.
 */
export class HintAdviser {
  private engine: ChessEngine | null = null
  private configured = false

  constructor(private readonly createEngine: () => ChessEngine) {}

  async advise(position: Position): Promise<MoveIntent> {
    if (this.engine === null) {
      this.engine = this.createEngine()
      this.configured = false
    }
    if (!this.configured) {
      await this.engine.configure(HINT_CONFIGURATION)
      this.configured = true
    }
    return this.engine.chooseMove(position)
  }

  dispose(): void {
    this.engine?.dispose()
    this.engine = null
  }
}
