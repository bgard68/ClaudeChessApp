import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MoveList } from './MoveList'

const SCHOLARS = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']

describe('MoveList', () => {
  it('MoveList_BeforeTheFirstMove_SaysSoRatherThanShowingAnEmptyList', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={[]} />)
    expect(markup).toContain('No moves yet.')
    expect(markup).not.toContain('<ol')
  })

  it('MoveList_PairedMoves_ShareOneNumberEach', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={SCHOLARS} />)
    // Four rows for seven half-moves: the last one is White's alone.
    expect(markup.match(/move-list__row/g)).toHaveLength(4)
    expect(markup).toContain('>1.<')
    expect(markup).toContain('>4.<')
    expect(markup).toContain('Qxf7#')
  })

  // The row still needs its second cell, or the column collapses and the
  // board's last move sits under the wrong heading.
  it('MoveList_BlackHasNotReplied_LeavesAGap', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={SCHOLARS} />)
    expect(markup).toContain('<span class="move-list__cell"></span>')
  })

  it('MoveList_CurrentPosition_MarksExactlyOneMove', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={SCHOLARS} currentPly={3} />)
    expect(markup.match(/move-list__cell--current/g)).toHaveLength(1)
    // Ply 3 is White's second move — Bc4 in this line.
    const upTo = markup.slice(0, markup.indexOf('move-list__cell--current'))
    expect(upTo.split('Nc6').length - 1).toBe(0)
  })

  // Ply 0 is the starting position: a real value, and not a move to highlight.
  it('MoveList_StartingPosition_HighlightsNothing', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={SCHOLARS} currentPly={0} />)
    expect(markup).not.toContain('move-list__cell--current')
  })

  // Live play shows the moves; only replay lets you jump between them. Without
  // a handler every cell is disabled, so the list cannot imply an action it
  // will not perform.
  it('MoveList_NoJumpHandler_DisablesEveryMove', () => {
    const markup = renderToStaticMarkup(<MoveList sanMoves={SCHOLARS} />)
    expect(markup.match(/disabled=""/g)).toHaveLength(SCHOLARS.length)
  })

  it('MoveList_JumpHandlerGiven_EnablesTheMoves', () => {
    const markup = renderToStaticMarkup(
      <MoveList sanMoves={SCHOLARS} currentPly={1} onSelectPly={vi.fn()} />,
    )
    expect(markup).not.toContain('disabled=""')
  })
})
