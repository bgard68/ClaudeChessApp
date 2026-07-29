import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'

export interface EngineSearchLimits {
  /** Hard cap on thinking time. Present at every difficulty so the UI stays
   *  responsive even at full strength. */
  readonly moveTimeMs: number
  /** Optional depth ceiling. Capping depth is what makes a weak level play
   *  shallowly rather than merely quickly. */
  readonly maxDepth?: number
}

export interface EngineConfiguration {
  /**
   * Stockfish's own 0–20 skill scale, where lower levels deliberately pick
   * inferior moves. Combined with a depth cap this is the whole difficulty
   * mechanism — the engine build in use has no Elo-targeting option.
   */
  readonly skillLevel: number
  readonly searchLimits: EngineSearchLimits
}

/**
 * A computer opponent's move-choosing ability.
 *
 * Narrow on purpose: the application needs a move, not evaluations, principal
 * variations, or UCI. Everything protocol-shaped stays in the adapter.
 */
export interface ChessEngine {
  init(): Promise<void>
  configure(configuration: EngineConfiguration): Promise<void>
  /** Rejects if the search is abandoned via `stop()` or `dispose()`. */
  chooseMove(position: Position): Promise<MoveIntent>
  stop(): void
  dispose(): void
}
