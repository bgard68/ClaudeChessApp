import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ChessRules } from '@domain/ports/ChessRules'

/**
 * Forced-mate reasoning over the rules port.
 *
 * This is what checks a puzzle answer, powers the puzzle hint, and picks the
 * defender's replies. Small closed searches — a puzzle is mate in one or two —
 * so the rules engine is fast enough and no search engine is involved.
 */

function isMate(rules: ChessRules, position: Position): boolean {
  const outcome = rules.outcome(position, [position])
  return outcome.status === 'decisive' && outcome.reason === 'checkmate'
}

/** Every move that delivers mate on the spot. */
export function matingMoves(rules: ChessRules, position: Position): readonly LegalMove[] {
  return rules.legalMoves(position).filter((move) => {
    const played = rules.play(position, move)
    return played !== null && isMate(rules, played.position)
  })
}

/**
 * Whether this move mates within `movesLeft` attacker moves against every
 * defence. Mating early counts: a one-move mate is a fine answer to a
 * two-move puzzle.
 */
export function solvesMateWithin(
  rules: ChessRules,
  position: Position,
  intent: MoveIntent,
  movesLeft: number,
): boolean {
  const played = rules.play(position, intent)
  if (played === null) return false
  if (isMate(rules, played.position)) return true
  if (movesLeft <= 1) return false

  const replies = rules.legalMoves(played.position)
  if (replies.length === 0) return false

  return replies.every((reply) => {
    const defended = rules.play(played.position, reply)
    if (defended === null) return false
    return rules
      .legalMoves(defended.position)
      .some((answer) => solvesMateWithin(rules, defended.position, answer, movesLeft - 1))
  })
}

/** A move that starts a forced mate — the hint, and the proof one exists. */
export function mateStartingMove(
  rules: ChessRules,
  position: Position,
  moves: number,
): LegalMove | null {
  return (
    rules
      .legalMoves(position)
      .find((move) => solvesMateWithin(rules, position, move, moves)) ?? null
  )
}

/**
 * The defence that resists hardest: the reply leaving the attacker the fewest
 * immediate mates. Losing is certain — the puzzle was verified — but the
 * defender should not roll over when a tougher stand exists.
 */
export function toughestDefence(rules: ChessRules, position: Position): LegalMove | null {
  let best: LegalMove | null = null
  let fewestMates = Number.POSITIVE_INFINITY

  for (const reply of rules.legalMoves(position)) {
    const played = rules.play(position, reply)
    if (played === null) continue
    const mates = matingMoves(rules, played.position).length
    if (mates < fewestMates) {
      fewestMates = mates
      best = reply
    }
  }
  return best
}
