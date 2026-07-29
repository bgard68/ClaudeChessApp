import { Chess, type Move as ChessJsMove, type Square as ChessJsSquare } from 'chess.js'
import {
  decisive,
  drawn,
  IN_PROGRESS,
  type GameOutcome,
} from '@domain/chess/GameOutcome'
import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import { opposite } from '@domain/chess/Piece'
import { Position } from '@domain/chess/Position'
import { toSquare, type Square } from '@domain/chess/Square'
import type { ChessRules, MoveResult } from '@domain/ports/ChessRules'
import {
  PIECE_TYPE_BY_SYMBOL,
  promotionPieceFromSymbol,
  SYMBOL_BY_PROMOTION_PIECE,
} from './pieceMapping'

/** Half-moves without a capture or pawn move that trigger the fifty-move rule. */
const FIFTY_MOVE_HALFMOVES = 100
const REPETITIONS_FOR_DRAW = 3

/**
 * Implements the rules port on top of chess.js.
 *
 * A fresh `Chess` is built per query from the caller's FEN. That is a deliberate
 * trade: it costs a board setup per call, and in exchange no caller can leave
 * shared engine state mutated for the next one — the bug class that makes
 * live play, replay, and analysis interfere in the first place.
 */
export class ChessJsRules implements ChessRules {
  initialPosition(): Position {
    return Position.initial()
  }

  positionFromFen(fen: string): Position {
    // Constructing validates: chess.js throws on a FEN it cannot load.
    const chess = new Chess(fen)
    return Position.fromFen(chess.fen())
  }

  legalMoves(position: Position): readonly LegalMove[] {
    return this.boardAt(position)
      .moves({ verbose: true })
      .map(toLegalMove)
  }

  legalMovesFrom(position: Position, from: Square): readonly LegalMove[] {
    return this.boardAt(position)
      .moves({ square: from as ChessJsSquare, verbose: true })
      .map(toLegalMove)
  }

  play(position: Position, intent: MoveIntent): MoveResult | null {
    const chess = this.boardAt(position)
    try {
      const move = chess.move({
        from: intent.from,
        to: intent.to,
        promotion:
          intent.promotion === undefined
            ? undefined
            : SYMBOL_BY_PROMOTION_PIECE[intent.promotion],
      })
      return { move: toLegalMove(move), position: Position.fromFen(chess.fen()) }
    } catch {
      // chess.js signals an illegal move by throwing; the port reports it as a
      // value, because being asked for an illegal move is expected, not
      // exceptional.
      return null
    }
  }

  isCheck(position: Position): boolean {
    return this.boardAt(position).isCheck()
  }

  outcome(position: Position, history: readonly Position[]): GameOutcome {
    const chess = this.boardAt(position)

    if (chess.isCheckmate()) {
      return decisive(opposite(position.sideToMove), 'checkmate')
    }
    if (chess.isStalemate()) return drawn('stalemate')
    if (chess.isInsufficientMaterial()) return drawn('insufficient_material')
    if (position.halfMoveClock >= FIFTY_MOVE_HALFMOVES) return drawn('fifty_move_rule')
    if (countRepetitions(position, history) >= REPETITIONS_FOR_DRAW) {
      return drawn('threefold_repetition')
    }
    return IN_PROGRESS
  }

  private boardAt(position: Position): Chess {
    return new Chess(position.fen)
  }
}

function toLegalMove(move: ChessJsMove): LegalMove {
  return {
    from: toSquare(move.from),
    to: toSquare(move.to),
    promotion: promotionPieceFromSymbol(move.promotion),
    san: move.san,
    piece: PIECE_TYPE_BY_SYMBOL[move.piece],
    isCapture: move.isCapture(),
    isPromotion: move.isPromotion(),
  }
}

/**
 * chess.js can only judge repetition from moves it made itself. Because
 * positions here are standalone values, the count is taken over the history the
 * caller supplies, comparing board state while ignoring the move counters.
 */
function countRepetitions(position: Position, history: readonly Position[]): number {
  return history.reduce(
    (count, seen) => (seen.isSameBoard(position) ? count + 1 : count),
    0,
  )
}
