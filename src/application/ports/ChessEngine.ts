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

/**
 * How strong the opponent should be.
 *
 * A rating rather than a skill dial, because Stockfish can now be asked for one
 * directly. The old 0–20 skill scale made the engine pick deliberately inferior
 * moves without saying how much weaker that made it, so a difficulty level could
 * never honestly quote a number.
 *
 * `full` is not "very high elo" — it is the absence of any limit, which is a
 * different thing and worth keeping distinguishable.
 */
export type EngineStrength =
  | { readonly kind: 'rated'; readonly elo: number }
  | { readonly kind: 'full' }

export interface EngineConfiguration {
  readonly strength: EngineStrength
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
