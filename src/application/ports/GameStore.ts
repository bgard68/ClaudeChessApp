import type { GameOutcome } from '@domain/chess/GameOutcome'
import type { PlayedMove } from '@domain/chess/Move'
import type { TimeControl } from '@domain/clock/TimeControl'

/** A game this app played, ready to be written to the library. */
export interface RecordedGame {
  readonly white: string
  readonly black: string
  readonly event: string
  readonly site: string
  /** PGN date format: `YYYY.MM.DD`. */
  readonly playedOn: string
  readonly outcome: GameOutcome
  readonly timeControl: TimeControl
  readonly moves: readonly PlayedMove[]
  /** ISO timestamp, for ordering a player's own games. */
  readonly recordedAt: string
}

/**
 * Writing to the library.
 *
 * Split from `GameArchive` rather than bolted onto it: the replay browser and
 * the archive list only ever read, and shouldn't be handed the ability to
 * delete. One adapter implements both.
 */
export interface GameStore {
  /** Returns the id of the stored game. */
  save(game: RecordedGame): Promise<string>
  remove(id: string): Promise<void>
}
