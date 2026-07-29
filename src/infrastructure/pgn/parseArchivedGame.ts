import { Chess } from 'chess.js'
import type { ArchivedGame, RecordedMove } from '@domain/archive/ArchivedGame'
import {
  decisive,
  drawn,
  IN_PROGRESS,
  type DecisiveReason,
  type DrawReason,
  type GameOutcome,
} from '@domain/chess/GameOutcome'
import { Position } from '@domain/chess/Position'
import { toSquare } from '@domain/chess/Square'
import { promotionPieceFromSymbol } from '../chess/pieceMapping'
import { parseClockComment } from './clockComment'
import { headerOr, summarise } from './pgnHeaders'
import { parseTimeControlTag } from './timeControlTag'

/**
 * Turns one game's PGN into a fully resolved archived game.
 *
 * Returns `null` rather than throwing for unparseable input: real-world PGN
 * files contain the occasional malformed game, and one bad record should cost
 * that game, not the whole library.
 */
export function parseArchivedGame(pgn: string, id: string): ArchivedGame | null {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn, { strict: false })
  } catch {
    return null
  }

  const headers = chess.getHeaders()
  const history = chess.history({ verbose: true })

  // chess.js keys comments by the position they follow, which is exactly the
  // FEN each move produces.
  const clockByFen = new Map<string, number>()
  for (const { fen, comment } of chess.getComments()) {
    const clockMs = parseClockComment(comment)
    if (clockMs !== null) clockByFen.set(fen, clockMs)
  }

  const moves: RecordedMove[] = history.map((move, index) => ({
    ply: index + 1,
    color: move.color === 'w' ? 'white' : 'black',
    san: move.san,
    from: toSquare(move.from),
    to: toSquare(move.to),
    promotion: promotionPieceFromSymbol(move.promotion),
    positionBefore: Position.fromFen(move.before),
    positionAfter: Position.fromFen(move.after),
    recordedClockMs: clockByFen.get(move.after) ?? null,
  }))

  const summary = summarise(pgn, id)

  return {
    ...summary,
    // The index's estimates are replaced by exact counts now that the moves
    // have actually been played out.
    moveCount: Math.ceil(moves.length / 2),
    hasRecordedClocks: clockByFen.size > 0,
    site: headerOr(headers, 'Site', 'Unknown'),
    eco: headers['ECO'] ?? null,
    opening: headers['Opening'] ?? null,
    outcome: outcomeFrom(chess, summary.result, headers['Termination']),
    moves,
    declaredTimeControl: parseTimeControlTag(headers['TimeControl']),
  }
}

const DECISIVE_REASONS = new Set<string>(['checkmate', 'timeout', 'resignation'])
const DRAW_REASONS = new Set<string>([
  'stalemate',
  'insufficient_material',
  'threefold_repetition',
  'fifty_move_rule',
  'agreement',
])

/**
 * A PGN records who won, not why. Games this app saved say so in a
 * `Termination` tag, which is trusted when it names a reason we recognise;
 * otherwise only checkmate can be established, by looking at the final board.
 */
function outcomeFrom(
  chess: Chess,
  result: string,
  termination: string | undefined,
): GameOutcome {
  switch (result) {
    case '1-0':
      return decisive('white', decisiveReason(chess, termination))
    case '0-1':
      return decisive('black', decisiveReason(chess, termination))
    case '1/2-1/2':
      return drawn(drawReason(chess, termination))
    default:
      return IN_PROGRESS
  }
}

function decisiveReason(chess: Chess, termination: string | undefined): DecisiveReason {
  if (termination !== undefined && DECISIVE_REASONS.has(termination)) {
    return termination as DecisiveReason
  }
  return chess.isCheckmate() ? 'checkmate' : 'unknown'
}

function drawReason(chess: Chess, termination: string | undefined): DrawReason {
  if (termination !== undefined && DRAW_REASONS.has(termination)) {
    return termination as DrawReason
  }
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isInsufficientMaterial()) return 'insufficient_material'
  return 'agreement'
}
