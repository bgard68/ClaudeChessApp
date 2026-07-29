import type { PieceColor } from './Piece'

export type DrawReason =
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'agreement'

/**
 * `unknown` exists for archived games. A PGN records that White won, not
 * whether Black resigned, lost on time, or failed to appear — and guessing
 * would put a fact in the UI that the source never contained.
 */
export type DecisiveReason = 'checkmate' | 'timeout' | 'resignation' | 'unknown'

/**
 * Modelled as a discriminated union so an unreachable state — a winner on a
 * draw, a drawn checkmate — cannot be constructed in the first place.
 */
export type GameOutcome =
  | { readonly status: 'in_progress' }
  | { readonly status: 'decisive'; readonly winner: PieceColor; readonly reason: DecisiveReason }
  | { readonly status: 'draw'; readonly reason: DrawReason }

export const IN_PROGRESS: GameOutcome = { status: 'in_progress' }

export function decisive(winner: PieceColor, reason: DecisiveReason): GameOutcome {
  return { status: 'decisive', winner, reason }
}

export function drawn(reason: DrawReason): GameOutcome {
  return { status: 'draw', reason }
}

export function isOver(outcome: GameOutcome): boolean {
  return outcome.status !== 'in_progress'
}

/** The PGN result tag for a finished game, or "*" for one still running. */
export function toResultTag(outcome: GameOutcome): string {
  switch (outcome.status) {
    case 'in_progress':
      return '*'
    case 'draw':
      return '1/2-1/2'
    case 'decisive':
      return outcome.winner === 'white' ? '1-0' : '0-1'
  }
}
