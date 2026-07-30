import type { PieceColor } from '@domain/chess/Piece'
import type { TimeControl } from '@domain/clock/TimeControl'
import type { DifficultyLevel } from './Difficulty'

export type OpponentChoice = 'human' | 'computer' | 'engines'

/**
 * Everything a player picks before a game starts.
 *
 * `playerColor` means "the side you sit on". Against the computer it decides
 * which seat the engine takes; in pass-and-play both seats are human and it
 * only decides which way the board faces first. In an `engines` game — the
 * computer playing itself — nobody sits anywhere, and it again only decides
 * which way the spectator faces the board.
 */
export interface GameConfiguration {
  readonly opponent: OpponentChoice
  readonly playerColor: PieceColor
  readonly timeControl: TimeControl
  readonly difficulty: DifficultyLevel
}
