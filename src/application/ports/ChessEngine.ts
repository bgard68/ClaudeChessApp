import type { MoveIntent, MoveSequence } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'

export interface EngineSearchLimits {
  /**
   * Thinking time for a position with no clock behind it — an untimed game, a
   * hint, a generated puzzle. Named for that, because it is the whole of what
   * it covers and a plainer name invited the reading that it governs every
   * search.
   *
   * Not used in a timed game. There the clock itself is sent and the engine
   * budgets its own thinking, because a fixed figure cannot: two seconds a move
   * forfeits a one-minute game on time around move thirty however good the
   * moves are, and spends two seconds a move in a ninety-minute game that was
   * asking for the engine's best.
   */
  readonly untimedMoveTimeMs: number
  /** Optional depth ceiling. Capping depth is what makes a weak level play
   *  shallowly rather than merely quickly, and it holds however much time the
   *  engine is given. */
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
 * What both sides have left, and what each gains per move.
 *
 * Handed over whole rather than as "my time" and "their time" because that is
 * what a time manager needs: an engine two moves from flagging against an
 * opponent with half an hour should play differently from one in a level race,
 * and it cannot know which it is in from its own clock alone.
 */
export interface EngineTimeBudget {
  readonly whiteMs: number
  readonly blackMs: number
  readonly whiteIncrementMs: number
  readonly blackIncrementMs: number
}

export interface EngineSearchRequest {
  readonly position: Position
  /**
   * The game that led to `position`.
   *
   * Absent for an isolated position — a hint on a loaded FEN, a composed
   * puzzle — and supplied for a game in progress, because a bare FEN carries no
   * repetition history and an engine given one cannot see that it is about to
   * repeat a position for the third time.
   */
  readonly history?: MoveSequence
  /** Absent when no clock is running, or when a side has already flagged.
   *  `searchLimits.untimedMoveTimeMs` is what gets used then. */
  readonly timeBudget?: EngineTimeBudget
}

/**
 * The engine cannot be reached: it failed to start, or the worker running it
 * died. Terminal — an errored worker cannot be restarted, only replaced.
 *
 * Declared beside the port rather than in the adapter so the application can
 * tell this apart from an abandoned search without importing infrastructure.
 * The distinction is the whole point: one means the game cannot continue and
 * must say so, the other is the ordinary result of pressing undo.
 */
export class EngineUnavailable extends Error {}

/** The search was given up on — superseded, cancelled, or disposed. */
export class SearchAbandoned extends Error {}

/**
 * A computer opponent's move-choosing ability.
 *
 * Narrow on purpose: the application needs a move, not evaluations, principal
 * variations, or UCI. Everything protocol-shaped stays in the adapter.
 */
export interface ChessEngine {
  init(): Promise<void>
  /**
   * Starts a new game, clearing whatever the last one left behind.
   *
   * Separate from `configure` because the two have different rhythms: a
   * difficulty is set once per game, while an engine playing both seats of a
   * self-play game is reconfigured every ply and must *not* lose its tables
   * each time. Only the caller knows which it is doing.
   */
  newGame(): Promise<void>
  configure(configuration: EngineConfiguration): Promise<void>
  /** Rejects with `SearchAbandoned` if the search is given up on, or
   *  `EngineUnavailable` if the engine has gone away. */
  chooseMove(request: EngineSearchRequest): Promise<MoveIntent>
  stop(): void
  dispose(): void
}
