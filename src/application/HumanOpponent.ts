import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import {
  MoveRequestAbandoned,
  type InteractiveOpponent,
  type MoveRequest,
  type OpponentKind,
} from './Opponent'

interface PendingRequest {
  readonly legalMoves: readonly LegalMove[]
  readonly resolve: (intent: MoveIntent) => void
  readonly reject: (reason: Error) => void
}

/**
 * A person at the keyboard, presented to the turn loop as an ordinary opponent.
 *
 * The loop awaits `requestMove` exactly as it would for the engine; the promise
 * simply stays pending until the UI calls `offerMove`. That is what lets
 * pass-and-play and play-vs-computer share one implementation.
 */
export class HumanOpponent implements InteractiveOpponent {
  readonly kind: OpponentKind = 'human'

  private pending: PendingRequest | null = null

  constructor(readonly name: string = 'Player') {}

  requestMove(request: MoveRequest): Promise<MoveIntent> {
    this.cancel()
    return new Promise<MoveIntent>((resolve, reject) => {
      this.pending = { legalMoves: request.legalMoves, resolve, reject }
    })
  }

  /**
   * Submits a move on this player's behalf.
   *
   * Returns `false` — rather than throwing — when the move is illegal or no
   * move is being awaited, because a mis-dragged piece is an ordinary event the
   * board should simply refuse.
   */
  offerMove(intent: MoveIntent): boolean {
    const pending = this.pending
    if (pending === null) return false

    const matches = pending.legalMoves.filter(
      (move) => move.from === intent.from && move.to === intent.to,
    )
    if (matches.length === 0) return false

    // A pawn reaching the last rank yields four candidates; the caller must say
    // which piece it wants before the move is unambiguous.
    const chosen =
      matches.length === 1 && !matches[0]!.isPromotion
        ? matches[0]
        : matches.find((move) => move.promotion === intent.promotion)

    if (chosen === undefined) return false

    this.pending = null
    pending.resolve({ from: chosen.from, to: chosen.to, promotion: chosen.promotion })
    return true
  }

  /** Whether this player is currently on the move. */
  get isAwaitingMove(): boolean {
    return this.pending !== null
  }

  cancel(): void {
    const pending = this.pending
    this.pending = null
    pending?.reject(new MoveRequestAbandoned())
  }

  dispose(): void {
    this.cancel()
  }
}
