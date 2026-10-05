/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LegalMove } from '@domain/chess/Move'
import type { PromotionPiece } from '@domain/chess/Piece'
import { installDomStubs } from '../../test-support/dom'
import { ChessBoardView, NO_MOVES } from './ChessBoardView'

/*
 * The promotion chooser, driven.
 *
 * §9 of ARCHITECTURE-AND-REVIEW listed this as never exercised: "the promotion
 * chooser needs a game reaching a seventh-rank pawn". That is why it stayed
 * untested — the static suite cannot click, and reaching a promotion in a real
 * browser means playing twenty-odd moves through an engine.
 *
 * It deserves covering more than most of this component, because it is *ours*:
 * react-chessboard 5 dropped its built-in dialog along with the
 * onPromotionCheck/onPromotionPieceSelect pair, so this is hand-written
 * replacement UI for a feature the library used to provide. The rules it offers
 * come from `promotionChoices`, which has its own tests; what is unverified is
 * that a click actually reaches them and that choosing a piece plays the move
 * carrying it.
 *
 * On the environment rule in TESTING.md: this is an interaction test, not a
 * failure-injection one, so it broadens the rule written alongside that suite.
 * The bar it still has to clear is both halves of the reason — unreachable from
 * the static suite, and impractical in a browser. A promotion is both. A test
 * that is merely more convenient here than in Chrome is not.
 */

installDomStubs()

/*
 * Unmounts between tests, explicitly.
 *
 * Testing Library only registers its own cleanup when the test globals are
 * injected, and this suite imports from 'vitest' instead. Without this every
 * render stays in the document, so a `document.querySelector` finds the previous
 * test's board and a click lands on a component nobody is asserting about —
 * which is how three of these passed while testing the wrong tree.
 */
afterEach(cleanup)

/** A pawn on e7 that may promote, and one ordinary move for contrast. */
const PROMOTIONS: readonly LegalMove[] = (
  ['queen', 'rook', 'bishop', 'knight'] as readonly PromotionPiece[]
).map(
  (promotion) =>
    ({
      from: 'e7',
      to: 'e8',
      promotion,
      san: `e8=${promotion[0]!.toUpperCase()}`,
      piece: 'pawn',
      isCapture: false,
      isPromotion: true,
    }) as unknown as LegalMove,
)

const QUIET_MOVE = {
  from: 'a2',
  to: 'a3',
  san: 'a3',
  piece: 'pawn',
  isCapture: false,
  isPromotion: false,
} as unknown as LegalMove

/** White pawn on e7, kings only otherwise — a position that really promotes. */
const BEFORE_PROMOTION = '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1'

const board = (onMove: (intent: unknown) => boolean, legalMoves = PROMOTIONS) =>
  render(
    <ChessBoardView
      fen={BEFORE_PROMOTION}
      orientation="white"
      interactive
      legalMoves={legalMoves}
      onMove={onMove}
    />,
  )

const square = (name: string) => document.querySelector(`[data-square="${name}"]`)!

describe('the promotion chooser', () => {
  it('chessBoardView_PromotingMove_AsksBeforePlayingIt', () => {
    const onMove = vi.fn(() => true)
    board(onMove)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e8'))

    // The dialog opens and the move is withheld until a piece is chosen.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onMove).not.toHaveBeenCalled()
  })

  // The pieces offered are the ones the rules allow, not a fixed four — which is
  // the whole reason the choice is built from `promotionChoices`.
  it('chessBoardView_PromotionDialog_OffersOnlyWhatTheRulesAllow', () => {
    const onMove = vi.fn(() => true)
    board(onMove, [PROMOTIONS[0]!, PROMOTIONS[3]!]) // queen and knight only

    fireEvent.click(square('e7'))
    fireEvent.click(square('e8'))

    expect(screen.getByLabelText('queen')).toBeTruthy()
    expect(screen.getByLabelText('knight')).toBeTruthy()
    expect(screen.queryByLabelText('rook')).toBeNull()
    expect(screen.queryByLabelText('bishop')).toBeNull()
  })

  it('chessBoardView_ChoosingAPiece_PlaysTheMoveCarryingIt', () => {
    const onMove = vi.fn(() => true)
    board(onMove)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e8'))
    fireEvent.click(screen.getByLabelText('knight'))

    expect(onMove).toHaveBeenCalledWith({ from: 'e7', to: 'e8', promotion: 'knight' })
  })

  // Cancelling must leave the position alone. A dialog that plays a queen when
  // dismissed would be worse than one that never opened.
  it('chessBoardView_CancellingThePromotion_PlaysNothing', () => {
    const onMove = vi.fn(() => true)
    board(onMove)

    fireEvent.click(square('e7'))
    fireEvent.click(square('e8'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('chessBoardView_OrdinaryMove_PlaysWithoutAsking', () => {
    const onMove = vi.fn(() => true)
    board(onMove, [QUIET_MOVE])

    fireEvent.click(square('a2'))
    fireEvent.click(square('a3'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onMove).toHaveBeenCalledWith({ from: 'a2', to: 'a3' })
  })

  it('chessBoardView_NotInteractive_IgnoresClicksEntirely', () => {
    const onMove = vi.fn(() => true)
    render(
      <ChessBoardView
        fen={BEFORE_PROMOTION}
        orientation="white"
        interactive={false}
        legalMoves={NO_MOVES}
        onMove={onMove}
      />,
    )

    fireEvent.click(square('e7'))
    fireEvent.click(square('e8'))

    expect(onMove).not.toHaveBeenCalled()
  })
})
