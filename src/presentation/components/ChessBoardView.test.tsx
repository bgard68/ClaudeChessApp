import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LegalMove } from '@domain/chess/Move'
import { toSquare } from '@domain/chess/Square'
import { ChessBoardView } from './ChessBoardView'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const board = (over: Partial<Parameters<typeof ChessBoardView>[0]> = {}) =>
  renderToStaticMarkup(
    <ChessBoardView
      fen={START}
      orientation="white"
      interactive
      legalMoves={[]}
      {...over}
    />,
  )

/** The markup of one square, up to where the next square begins. */
const square = (markup: string, name: string): string => {
  const start = markup.indexOf(`data-square="${name}"`)
  if (start < 0) throw new Error(`no square ${name} in the rendered board`)
  const next = markup.indexOf('data-square=', start + 1)
  return markup.slice(start, next < 0 ? undefined : next)
}

describe('ChessBoardView', () => {
  it('ChessBoardView_AnyPosition_DrawsAFullBoard', () => {
    const markup = board()
    expect(markup.match(/data-square=/g)).toHaveLength(64)
    expect(markup.match(/data-contrast-piece=/g)).toHaveLength(32)
    expect(markup).toContain('var(--contrast-black-piece-fill, #111318)')
    expect(markup).toContain('var(--contrast-black-piece-outline, #f2f1ea)')
    expect(markup).toContain('var(--contrast-white-piece-outline, #17191d)')
  })

  // The first square written is the top-left one, which is the corner the
  // player is looking down the board from.
  it('ChessBoardView_Orientation_PutsA8TopForWhiteAndH1ForBlack', () => {
    expect(board({ orientation: 'white' })).toContain('data-square="a8"><')
    expect(board({ orientation: 'white' }).indexOf('data-square="a8"')).toBeLessThan(
      board({ orientation: 'white' }).indexOf('data-square="h1"'),
    )
    expect(board({ orientation: 'black' }).indexOf('data-square="h1"')).toBeLessThan(
      board({ orientation: 'black' }).indexOf('data-square="a8"'),
    )
  })

  /*
   * The board must occupy real dimensions on its first commit, before
   * useElementSize has measured anything.
   *
   * This is not styling. react-chessboard 5 mounted into a zero-sized or
   * later commit renders its wrappers and no squares, and never recovers —
   * which is why the size must not gate the mount. Under a server render
   * nothing is ever measured, so this is exactly that first commit.
   */
  it('ChessBoardView_BeforeBeingMeasured_FillsItsArea', () => {
    expect(board()).toContain('class="board" style="width:100%;height:100%"')
    expect(board().match(/data-square=/g)).toHaveLength(64)
  })

  describe('the last move played', () => {
    const lastMove = { from: toSquare('e2'), to: toSquare('e4') }

    it('ChessBoardView_LastMove_MarksBothSquaresItTouched', () => {
      const markup = board({ lastMove })
      expect(square(markup, 'e2')).toContain('rgba(255, 213, 79')
      expect(square(markup, 'e4')).toContain('rgba(255, 213, 79')
    })

    // Where the piece landed matters more than where it left, and the two
    // shades are the only thing that says which is which.
    it('ChessBoardView_LastMove_MarksTheDestinationMoreStronglyThanTheOrigin', () => {
      const markup = board({ lastMove })
      expect(square(markup, 'e2')).toContain('0.45)')
      expect(square(markup, 'e4')).toContain('0.55)')
    })

    it('ChessBoardView_StartOfGame_MarksNothing', () => {
      expect(board({ lastMove: null })).not.toContain('rgba(255, 213, 79')
    })
  })

  describe('a hint', () => {
    // Drawn as an arrow rather than played: advice the player can ignore.
    it('ChessBoardView_HintHighlight_UsesTheAdviceColourNotATheme', () => {
      const markup = board({ hint: { from: toSquare('g1'), to: toSquare('f3') } })
      expect(markup).toContain('<svg')
      expect(markup).toContain('#5896ff')
    })

    it('ChessBoardView_NoHint_LeavesTheBoardClean', () => {
      expect(board({ hint: null })).not.toContain('#5896ff')
    })
  })

  // The library's own coordinate labels take its walnut palette whatever the
  // squares are, which several themes wash out entirely. These two neutrals
  // are legible on every theme the app offers.
  it('ChessBoardView_Coordinates_UseNeutralInkOnBothSquareShades', () => {
    const markup = board()
    expect(markup).toContain('color:#f7f6f2') // on dark squares
    expect(markup).toContain('color:#3a3833') // on light squares
  })

  // Nothing is selected until it is clicked, so a board at rest offers no
  // destination dots and no dialog.
  it('ChessBoardView_AtRest_ShowsNoMoveHintsAndNoPromotionDialog', () => {
    const legalMoves: readonly LegalMove[] = [
      { from: toSquare('e2'), to: toSquare('e4') } as LegalMove,
    ]
    const markup = board({ legalMoves })
    expect(markup).not.toContain('radial-gradient')
    expect(markup).not.toContain('role="dialog"')
  })
})
