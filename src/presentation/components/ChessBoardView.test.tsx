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
  it('draws a full board', () => {
    expect(board().match(/data-square=/g)).toHaveLength(64)
  })

  // The first square written is the top-left one, which is the corner the
  // player is looking down the board from.
  it('puts a8 at the top for White and h1 for Black', () => {
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
  it('fills its area before it has been measured', () => {
    expect(board()).toContain('class="board" style="width:100%;height:100%"')
    expect(board().match(/data-square=/g)).toHaveLength(64)
  })

  describe('the last move played', () => {
    const lastMove = { from: toSquare('e2'), to: toSquare('e4') }

    it('marks both squares it touched', () => {
      const markup = board({ lastMove })
      expect(square(markup, 'e2')).toContain('rgba(255, 213, 79')
      expect(square(markup, 'e4')).toContain('rgba(255, 213, 79')
    })

    // Where the piece landed matters more than where it left, and the two
    // shades are the only thing that says which is which.
    it('marks the destination more strongly than the origin', () => {
      const markup = board({ lastMove })
      expect(square(markup, 'e2')).toContain('0.45)')
      expect(square(markup, 'e4')).toContain('0.55)')
    })

    it('marks nothing at the start of a game', () => {
      expect(board({ lastMove: null })).not.toContain('rgba(255, 213, 79')
    })
  })

  describe('a hint', () => {
    // Drawn as an arrow rather than played: advice the player can ignore.
    it('is drawn in the advice colour, not a theme colour', () => {
      const markup = board({ hint: { from: toSquare('g1'), to: toSquare('f3') } })
      expect(markup).toContain('<svg')
      expect(markup).toContain('#5896ff')
    })

    it('leaves the board clean when there is none', () => {
      expect(board({ hint: null })).not.toContain('#5896ff')
    })
  })

  // The library's own coordinate labels take its walnut palette whatever the
  // squares are, which several themes wash out entirely. These two neutrals
  // are legible on every theme the app offers.
  it('labels coordinates in neutral ink on both square shades', () => {
    const markup = board()
    expect(markup).toContain('color:#f7f6f2') // on dark squares
    expect(markup).toContain('color:#3a3833') // on light squares
  })

  // Nothing is selected until it is clicked, so a board at rest offers no
  // destination dots and no dialog.
  it('shows no move hints and no promotion dialog at rest', () => {
    const legalMoves: readonly LegalMove[] = [
      { from: toSquare('e2'), to: toSquare('e4') } as LegalMove,
    ]
    const markup = board({ legalMoves })
    expect(markup).not.toContain('radial-gradient')
    expect(markup).not.toContain('role="dialog"')
  })
})
