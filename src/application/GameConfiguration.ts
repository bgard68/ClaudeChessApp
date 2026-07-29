import type { PieceColor } from '@domain/chess/Piece'
import type { TimeControl } from '@domain/clock/TimeControl'
import type { DifficultyLevel } from './Difficulty'

export type OpponentChoice = 'human' | 'computer'

/**
 * Everything a player picks before a game starts.
 *
 * `playerColor` means "the side you sit on". Against the computer it decides
 * which seat the engine takes; in pass-and-play both seats are human and it
 * only decides which way the board faces first.
 */
export interface GameConfiguration {
  readonly opponent: OpponentChoice
  readonly playerColor: PieceColor
  readonly timeControl: TimeControl
  readonly difficulty: DifficultyLevel
}
