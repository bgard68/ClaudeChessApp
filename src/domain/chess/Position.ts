import type { PieceColor } from './Piece'

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * An immutable board position, identified by its FEN.
 *
 * The rules engine (chess.js) is mutable and stateful; representing positions
 * as values keeps live play, replay, and engine analysis from corrupting one
 * another's state. FEN is a notation standard rather than a library detail, so
 * reading side-to-move and move number from it stays inside the domain.
 */
export class Position {
  private constructor(
    readonly fen: string,
    readonly sideToMove: PieceColor,
    readonly fullMoveNumber: number,
    readonly halfMoveClock: number,
  ) {}

  static fromFen(fen: string): Position {
    const fields = fen.trim().split(/\s+/)
    const [placement, activeColor, , , halfMove, fullMove] = fields

    if (fields.length < 4 || !placement || !activeColor) {
      throw new Error(`Malformed FEN: "${fen}"`)
    }
    if (activeColor !== 'w' && activeColor !== 'b') {
      throw new Error(`FEN has an invalid side-to-move field: "${activeColor}"`)
    }

    return new Position(
      fen,
      activeColor === 'w' ? 'white' : 'black',
      Number.parseInt(fullMove ?? '1', 10) || 1,
      Number.parseInt(halfMove ?? '0', 10) || 0,
    )
  }

  static initial(): Position {
    return Position.fromFen(STARTING_FEN)
  }

  equals(other: Position): boolean {
    return this.fen === other.fen
  }

  /** Ignores the halfmove and fullmove counters, so repetition-equivalent
   *  positions compare equal. */
  isSameBoard(other: Position): boolean {
    return this.fen.split(' ').slice(0, 4).join(' ') ===
      other.fen.split(' ').slice(0, 4).join(' ')
  }
}
