/**
 * One day's puzzle, composed on this device by the engine playing itself.
 * Nothing is shipped for this feature but code: the position comes out of a
 * game generated locally — a decision, not an accident; see PuzzleGenerator.
 */
export interface GeneratedPuzzle {
  readonly fen: string
  /** Attacker moves to mate — verified before the puzzle is offered. */
  readonly mateIn: number
  /** Which move of the source game the mate fell on, for the caption. */
  readonly mateOnMove: number
}

/**
 * The seed a given calendar day gets.
 *
 * Local date, deliberately: the puzzle should turn over at the player's own
 * midnight. With the engine held to a fixed depth on the single-threaded
 * build, the same seed replays the same game on any device — best effort, not
 * a guarantee, and nothing depends on it being exact.
 */
export function dailySeed(today: Date): number {
  return Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000,
  )
}
