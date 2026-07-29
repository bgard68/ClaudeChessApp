import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import type { PromotionPieceOption, Square as BoardSquare } from 'react-chessboard/dist/chessboard/types'
import type { LegalMove, MoveIntent } from '@domain/chess/Move'
import type { PieceColor, PromotionPiece } from '@domain/chess/Piece'
import { toSquare, type Square } from '@domain/chess/Square'
import { destinationsFrom, promotionChoices } from '@application/selectors'
import { useElementSize } from '../hooks/useElementSize'

interface ChessBoardViewProps {
  readonly fen: string
  readonly orientation: PieceColor
  readonly interactive: boolean
  readonly legalMoves: readonly LegalMove[]
  readonly lastMove?: { readonly from: Square; readonly to: Square } | null
  readonly onMove?: (intent: MoveIntent) => boolean
}

const PROMOTION_BY_OPTION: Readonly<Record<string, PromotionPiece>> = {
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
}

/**
 * The board.
 *
 * Renders and collects input, and nothing else — it never decides whether a
 * move is legal, only asks. The legal-move list it highlights from is the same
 * one the game validates against, so the two cannot disagree.
 */
export function ChessBoardView({
  fen,
  orientation,
  interactive,
  legalMoves,
  lastMove,
  onMove,
}: ChessBoardViewProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotionFrom, setPromotionFrom] = useState<Square | null>(null)
  const [promotionTo, setPromotionTo] = useState<Square | null>(null)

  const submit = (intent: MoveIntent): boolean => {
    setSelected(null)
    return onMove?.(intent) ?? false
  }

  const clearPromotion = () => {
    setPromotionFrom(null)
    setPromotionTo(null)
  }

  const handleDrop = (from: BoardSquare, to: BoardSquare): boolean => {
    if (!interactive) return false
    return submit({ from: toSquare(from), to: toSquare(to) })
  }

  /** Tells the board whether this move needs the promotion chooser. */
  const needsPromotion = (from: BoardSquare, to: BoardSquare): boolean => {
    if (!interactive) return false
    const isPromotion = promotionChoices(legalMoves, toSquare(from), toSquare(to)).length > 0
    if (isPromotion) {
      setPromotionFrom(toSquare(from))
      setPromotionTo(toSquare(to))
    }
    return isPromotion
  }

  const handlePromotionSelect = (
    option?: PromotionPieceOption,
    fromSquare?: BoardSquare,
    toSquare_?: BoardSquare,
  ): boolean => {
    // The board omits the squares when the dialog was opened by click-to-move,
    // so fall back to the pair recorded when the move was started.
    const from = fromSquare === undefined ? promotionFrom : toSquare(fromSquare)
    const to = toSquare_ === undefined ? promotionTo : toSquare(toSquare_)
    clearPromotion()

    if (option === undefined || from === null || to === null) return false

    const promotion = PROMOTION_BY_OPTION[option.charAt(1)]
    if (promotion === undefined) return false

    return submit({ from, to, promotion })
  }

  const handleSquareClick = (square: BoardSquare) => {
    if (!interactive) return

    const clicked = toSquare(square)

    if (selected !== null && selected !== clicked) {
      const promotions = promotionChoices(legalMoves, selected, clicked)
      if (promotions.length > 0) {
        setPromotionFrom(selected)
        setPromotionTo(clicked)
        return
      }
      if (submit({ from: selected, to: clicked })) return
    }

    // Select a square that has somewhere to go; anything else clears. Whether
    // a piece stands there is implied by the legal-move list, so there is no
    // need to depend on the board reporting one.
    setSelected(legalMoves.some((move) => move.from === clicked) ? clicked : null)
  }

  // The largest square that fits the space the layout gave us, in both
  // directions. Taking the width alone is what pushes the board off the bottom
  // of a short laptop screen.
  const boardSize = Math.floor(Math.min(area.width, area.height || area.width))

  return (
    <div className="board-area" ref={areaRef}>
      {boardSize > 0 ? (
        <div className="board" style={{ width: boardSize, height: boardSize }}>
          <Chessboard
            boardWidth={boardSize}
            position={fen}
            boardOrientation={orientation}
            arePiecesDraggable={interactive}
            onPieceDrop={handleDrop}
            onPromotionCheck={needsPromotion}
            onPromotionPieceSelect={handlePromotionSelect}
            onSquareClick={handleSquareClick}
            showPromotionDialog={promotionTo !== null}
            promotionToSquare={promotionTo}
            customSquareStyles={squareStyles(selected, legalMoves, lastMove)}
            customBoardStyle={{ borderRadius: '6px' }}
            customDarkSquareStyle={{ backgroundColor: '#6d8a58' }}
            customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
            animationDuration={180}
          />
        </div>
      ) : null}
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
