import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import type { PieceColor, PromotionPiece } from '@domain/chess/Piece'
import { toSquare, type Square } from '@domain/chess/Square'
import { destinationsFrom, promotionChoices } from '@application/selectors'
import { currentBoardTheme } from '../boardThemes'
import { useElementSize } from '../hooks/useElementSize'
import { OUTLINED_PIECES } from './outlinedPieces'

interface ChessBoardViewProps {
  readonly fen: string
  readonly orientation: PieceColor
  readonly interactive: boolean
  readonly legalMoves: readonly LegalMove[]
  readonly lastMove?: { readonly from: Square; readonly to: Square } | null
  /** A suggested move to draw as an arrow, without playing it. */
  readonly hint?: { readonly from: Square; readonly to: Square } | null
  readonly onMove?: (intent: MoveIntent) => boolean
}

/** The same blue as a selected square, so advice reads as UI rather than as a
 *  played move — and it clears every board theme, which no theme colour does. */
const HINT_ARROW_COLOR = '#5896ff'

/**
 * For a board nobody can move on.
 *
 * Shared rather than written `legalMoves={[]}` at each call site, because an
 * array literal in JSX is a new array on every render of the parent, and this
 * prop is a dependency of the memo below — see the long note on it. A board
 * with nothing to offer should not be the thing that invalidates it.
 */
export const NO_MOVES: readonly LegalMove[] = []

/** Order they are offered in — a promotion is a queen nearly always. */
const PROMOTION_ORDER: readonly PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight']

const PROMOTION_GLYPH: Readonly<Record<PromotionPiece, string>> = {
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
}

/**
 * The board.
 *
 * Renders and collects input, and nothing else — it never decides whether a
 * move is legal, only asks. The legal-move list it highlights from is the same
 * one the game validates against, so the two cannot disagree.
 *
 * The promotion chooser is ours. react-chessboard 5 dropped the built-in dialog
 * along with its onPromotionCheck/onPromotionPieceSelect pair, so the choice is
 * offered here instead — from `promotionChoices`, which means the pieces shown
 * are the ones the rules actually allow rather than a fixed four.
 */
export function ChessBoardView({
  fen,
  orientation,
  interactive,
  legalMoves,
  lastMove,
  hint,
  onMove,
}: ChessBoardViewProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()

  /*
   * A click half-made, and the position it was made in.
   *
   * Both are stamped with the FEN they belong to and read back only for that
   * FEN, because neither survives the position changing underneath it: an
   * undo, or the other player moving, leaves a selected square whose piece has
   * gone — highlighted blue, with no destination dots, because the legal-move
   * list no longer mentions it.
   *
   * Derived on the way out rather than cleared in an effect. An effect would
   * commit the stale frame first and clear it on the next one, which is the
   * flicker it exists to prevent.
   */
  const [selection, setSelection] = useState<{ fen: string; square: Square } | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{
    fen: string
    from: Square
    to: Square
  } | null>(null)

  const selected = selection !== null && selection.fen === fen ? selection.square : null
  const promotion =
    pendingPromotion !== null && pendingPromotion.fen === fen ? pendingPromotion : null

  const select = (square: Square | null) =>
    setSelection(square === null ? null : { fen, square })

  // The largest square that fits the space the layout gave us, in both
  // directions. Taking the width alone is what pushes the board off the bottom
  // of a short laptop screen.
  const boardSize = Math.floor(Math.min(area.width, area.height || area.width))
  const sized = boardSize > 0

  const submit = (intent: MoveIntent): boolean => {
    select(null)
    return onMove?.(intent) ?? false
  }

  /** True when the move needs a piece chosen, in which case the dialog opens. */
  const opensPromotion = (from: Square, to: Square): boolean => {
    if (promotionChoices(legalMoves, from, to).length === 0) return false
    setPendingPromotion({ fen, from, to })
    return true
  }

  const handleDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string
    targetSquare: string | null
  }): boolean => {
    // Dragged off the board entirely: nothing to do, and no move to reject.
    if (!interactive || targetSquare === null) return false

    const from = toSquare(sourceSquare)
    const to = toSquare(targetSquare)

    // The piece must go back while the choice is pending, so this reports the
    // drop as rejected and the dialog commits the move instead.
    if (opensPromotion(from, to)) return false

    return submit({ from, to })
  }

  const handleSquareClick = ({ square }: { square: string }) => {
    if (!interactive) return

    const clicked = toSquare(square)

    if (selected !== null && selected !== clicked) {
      if (opensPromotion(selected, clicked)) return
      if (submit({ from: selected, to: clicked })) return
    }

    // Select a square that has somewhere to go; anything else clears. Whether
    // a piece stands there is implied by the legal-move list, so there is no
    // need to depend on the board reporting one.
    select(legalMoves.some((move) => move.from === clicked) ? clicked : null)
  }

  const choosePromotion = (piece: PromotionPiece) => {
    if (promotion === null) return
    const { from, to } = promotion
    setPendingPromotion(null)
    submit({ from, to, promotion: piece })
  }

  /*
   * The options object is memoised because its identity matters to the board.
   *
   * The play screen re-renders on every clock tick. An options object built
   * inline is therefore a new object several times a second, and
   * react-chessboard 5 treats each new one as a reconfiguration — it never gets
   * from "measuring" to "drawn" before being reset. That is the whole mystery of
   * the board that rendered on the (static) setup screen and came up empty in a
   * game: same component, same values, different re-render cadence.
   *
   * The handlers ride in a ref so the memo does not have to be invalidated to
   * keep them current — they close over `selected` and `legalMoves`, which
   * change with play.
   *
   * Updated in an effect rather than during render. A render may be thrown away
   * — StrictMode discards one deliberately, and a concurrent render can be
   * abandoned — and writing a ref from a render that never commits publishes
   * handlers closed over state the committed tree does not have. The effect runs
   * after the commit, which is still before any click can reach the board.
   */
  const handlers = useRef({ handleDrop, handleSquareClick })
  useEffect(() => {
    handlers.current = { handleDrop, handleSquareClick }
  })

  // Read fresh each render rather than passed as a prop: the preference is set
  // on the setup screen, whose own re-render is what brings the new colours to
  // its preview, and every other screen mounts after the choice was made.
  // Cached by `currentBoardTheme`, so the identity below is stable.
  const theme = currentBoardTheme()

  /*
   * Unpacked to squares before the memo, and this is the whole point of it.
   *
   * `lastMove` and `hint` are objects their callers build inline in JSX — the
   * play screen's `lastMove={lastMove ? { from, to } : null}` is a *new object
   * every render*, and that screen re-renders on every clock tick, ten times a
   * second. Listing the objects as dependencies therefore invalidated this memo
   * ten times a second and reconfigured the board on each one, which is exactly
   * the failure the note below describes: the memo was here, and bought nothing.
   *
   * Squares are strings. Equal squares are equal dependencies however many
   * objects were allocated to carry them.
   */
  const lastMoveFrom = lastMove?.from ?? null
  const lastMoveTo = lastMove?.to ?? null
  const hintFrom = hint?.from ?? null
  const hintTo = hint?.to ?? null

  const boardOptions = useMemo(
    () => ({
      position: fen,
      pieces: OUTLINED_PIECES,
      boardOrientation: orientation,
      allowDragging: interactive,
      onPieceDrop: (args: { piece: unknown; sourceSquare: string; targetSquare: string | null }) =>
        handlers.current.handleDrop(args),
      onSquareClick: (args: { piece: unknown; square: string }) =>
        handlers.current.handleSquareClick(args),
      squareStyles: squareStyles(
        selected,
        legalMoves,
        lastMoveFrom !== null && lastMoveTo !== null
          ? { from: lastMoveFrom, to: lastMoveTo }
          : null,
      ),
      boardStyle: { borderRadius: '6px' },
      darkSquareStyle: { backgroundColor: theme.dark },
      lightSquareStyle: { backgroundColor: theme.light },
      // The library's coordinate labels default to its own walnut palette
      // whatever the squares are, which most themes wash out. Neutral ink
      // instead of theme colours: near-white on dark squares and near-black on
      // light ones clears every scheme, where tone-on-tone cleared none.
      darkSquareNotationStyle: { color: '#f7f6f2', fontWeight: 600 },
      lightSquareNotationStyle: { color: '#3a3833', fontWeight: 600 },
      animationDurationInMs: 180,
      arrows:
        hintFrom !== null && hintTo !== null
          ? [{ startSquare: hintFrom, endSquare: hintTo, color: HINT_ARROW_COLOR }]
          : [],
      // Hand-drawn arrows are a study tool this app does not offer, and drawing
      // one by accident with the right button is confusing.
      allowDrawingArrows: false,
    }),
    [
      fen,
      orientation,
      interactive,
      selected,
      legalMoves,
      lastMoveFrom,
      lastMoveTo,
      hintFrom,
      hintTo,
      theme,
    ],
  )

  const offered =
    promotion === null ? [] : promotionChoices(legalMoves, promotion.from, promotion.to)

  /*
   * The board mounts with the component's first commit, never later.
   *
   * react-chessboard 5 has a mount-timing sensitivity: mounted in a commit
   * after its screen's, while an ancestor is re-rendering (the play screen
   * ticks with the clock), it renders its wrappers and no squares, and never
   * recovers. Mounted in the first commit it is fine — including under the same
   * re-render load. Bisected empirically: a bare board and one with churning
   * options both survived on the play screen; an identical board mounted one
   * setTimeout later died, exactly like the size-gated original.
   *
   * So the measured size must not gate mounting. Until it lands, the container
   * fills the area it was given — real dimensions either way — and is pinned to
   * the fitted square one commit later.
   */
  return (
    <div className="board-area" ref={areaRef}>
      <div
        className="board"
        style={
          sized
            ? { width: boardSize, height: boardSize }
            : { width: '100%', height: '100%' }
        }
      >
        <Chessboard options={boardOptions} />

        {promotion !== null && offered.length > 0 ? (
          <div className="promotion" role="dialog" aria-label="Choose a piece">
            {PROMOTION_ORDER.filter((piece) => offered.includes(piece)).map((piece) => (
              <button
                key={piece}
                type="button"
                className="promotion__choice"
                aria-label={piece}
                onClick={() => choosePromotion(piece)}
              >
                <span aria-hidden="true">{PROMOTION_GLYPH[piece]}</span>
              </button>
            ))}
            <button
              type="button"
              className="promotion__cancel"
              onClick={() => setPendingPromotion(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function squareStyles(
  selected: Square | null,
  legalMoves: readonly LegalMove[],
  lastMove: { from: Square; to: Square } | null | undefined,
): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {}

  if (lastMove) {
    styles[lastMove.from] = { backgroundColor: 'rgba(255, 213, 79, 0.45)' }
    styles[lastMove.to] = { backgroundColor: 'rgba(255, 213, 79, 0.55)' }
  }

  if (selected !== null) {
    styles[selected] = { backgroundColor: 'rgba(88, 150, 255, 0.55)' }
    for (const target of destinationsFrom(legalMoves, selected)) {
      styles[target] = {
        background:
          'radial-gradient(circle, rgba(20, 20, 20, 0.35) 22%, transparent 24%)',
      }
    }
  }
  return styles
}
