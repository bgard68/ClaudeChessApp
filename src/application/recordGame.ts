import type { LiveGameState } from './LiveGame'
import type { RecordedGame } from './ports/GameStore'

export interface RecordGameDetails {
  readonly whiteName: string
  readonly blackName: string
  readonly event: string
  readonly site: string
  /** Passed in rather than read from the clock, so this stays a pure function. */
  readonly at: Date
}

/**
 * Turns the state of a game in progress into something the library can store.
 *
 * Pure, so the mapping is testable without a database, a browser, or a clock.
 */
export function recordGame(
  state: LiveGameState,
  details: RecordGameDetails,
): RecordedGame {
  return {
    white: details.whiteName,
    black: details.blackName,
    event: details.event,
    site: details.site,
    playedOn: toPgnDate(details.at),
    outcome: state.outcome,
    timeControl: state.timeControl,
    moves: state.history,
    recordedAt: details.at.toISOString(),
  }
}

/** PGN dates are `YYYY.MM.DD`, in local time — the date the player saw. */
export function toPgnDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}
