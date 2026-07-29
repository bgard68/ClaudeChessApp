import type { GameOutcome } from '../chess/GameOutcome'
import type { PieceColor, PromotionPiece } from '../chess/Piece'
import type { Position } from '../chess/Position'
import type { Square } from '../chess/Square'
import type { TimeControl } from '../clock/TimeControl'

export interface RecordedMove {
  readonly ply: number
  readonly color: PieceColor
  readonly san: string
  readonly from: Square
  readonly to: Square
  readonly promotion?: PromotionPiece
  readonly positionBefore: Position
  readonly positionAfter: Position
  /**
   * The mover's clock reading after this move, in milliseconds, when the source
   * PGN carried a `[%clk]` annotation. `null` for the overwhelming majority of
   * historical games, whose clock readings were simply never written down.
   */
  readonly recordedClockMs: number | null
}

/**
 * A game as it was actually played and recorded, distinct from a game in
 * progress: its moves are fixed and its result is already known.
 */
export interface ArchivedGame extends ArchivedGameSummary {
  readonly site: string
  readonly eco: string | null
  readonly opening: string | null
  readonly outcome: GameOutcome
  readonly moves: readonly RecordedMove[]
  /** Parsed from the PGN `TimeControl` tag when present. */
  readonly declaredTimeControl: TimeControl | null
}

/**
 * The subset a browsing list needs. Kept separate so rendering an index of
 * thousands of games does not require materialising every move of every one.
 */
/** Where a game in the library came from. */
export type GameOrigin = 'championship' | 'famous' | 'career' | 'played' | 'imported'

export interface ArchivedGameSummary {
  readonly id: string
  readonly origin: GameOrigin
  readonly white: string
  readonly black: string
  readonly event: string
  readonly date: string
  readonly round: string
  /** The PGN result tag, e.g. "1-0". */
  readonly result: string
  readonly moveCount: number
  readonly hasRecordedClocks: boolean
  /** A celebrated game's popular name, e.g. "The Immortal Game". */
  readonly nickname: string | null
}

/** PGN dates are often partial ("1972.??.??"); show only what is known. */
export function displayYear(date: string): string {
  const year = date.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : '????'
}
