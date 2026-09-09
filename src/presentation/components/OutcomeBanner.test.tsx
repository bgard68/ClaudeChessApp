import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { GameOutcome } from '@domain/chess/GameOutcome'
import { OutcomeBanner, describeOutcome } from './OutcomeBanner'

const drawn = (reason: string): GameOutcome =>
  ({ status: 'draw', reason }) as GameOutcome
const won = (winner: 'white' | 'black', reason: string): GameOutcome =>
  ({ status: 'decisive', winner, reason }) as GameOutcome

describe('describeOutcome', () => {
  it.each([
    ['stalemate', 'Draw — Stalemate'],
    ['insufficient_material', 'Draw — Insufficient material'],
    ['threefold_repetition', 'Draw — Threefold repetition'],
    ['fifty_move_rule', 'Draw — Fifty-move rule'],
    ['agreement', 'Draw — Agreement'],
  ])('describeOutcome_DrawBy%s_NamesTheReason', (reason, expected) => {
    expect(describeOutcome(drawn(reason))).toBe(expected)
  })

  it.each([
    ['white', 'checkmate', 'White won by checkmate'],
    ['black', 'timeout', 'Black won on time'],
    ['white', 'resignation', 'White won by resignation'],
  ] as const)('describeOutcome_DecisiveBy%s_Names%s', (winner, reason, expected) => {
    expect(describeOutcome(won(winner, reason))).toBe(expected)
  })

  // A PGN records the result, not how it was reached, so most archived wins
  // arrive with no reason at all. Saying "White won" is the honest sentence;
  // "White won by unknown" would be an admission dressed as a fact.
  it('describeOutcome_NoRecordedReason_SaysOnlyWhoWon', () => {
    expect(describeOutcome(won('black', 'unknown'))).toBe('Black won')
  })

  // A reason the app has not met yet is passed through rather than swallowed:
  // a blank banner would hide the outcome entirely.
  it('describeOutcome_UnrecognisedReason_FallsBackToTheRawText', () => {
    expect(describeOutcome(drawn('mutual_boredom'))).toBe('Draw — mutual_boredom')
  })

  it('describeOutcome_GameStillBeingPlayed_DescribesNothing', () => {
    expect(describeOutcome({ status: 'in_progress' } as GameOutcome)).toBe('')
  })
})

describe('OutcomeBanner', () => {
  it('OutcomeBanner_GameStillOn_RendersNothing', () => {
    const markup = renderToStaticMarkup(
      <OutcomeBanner outcome={{ status: 'in_progress' } as GameOutcome} />,
    )
    expect(markup).toBe('')
  })

  it('OutcomeBanner_ResultAppears_AnnouncesToAScreenReader', () => {
    const markup = renderToStaticMarkup(<OutcomeBanner outcome={won('white', 'checkmate')} />)
    // role="status" is what makes the result spoken rather than merely drawn.
    expect(markup).toContain('role="status"')
    expect(markup).toContain('White won by checkmate')
  })

  it('OutcomeBanner_NoNavigationTarget_OffersNoNewGameButton', () => {
    const withAction = renderToStaticMarkup(
      <OutcomeBanner outcome={drawn('stalemate')} onNewGame={vi.fn()} />,
    )
    const without = renderToStaticMarkup(<OutcomeBanner outcome={drawn('stalemate')} />)

    expect(withAction).toContain('New game')
    expect(without).not.toContain('New game')
  })

  it('OutcomeBanner_OwnActions_ComeBeforeTheNewGameButton', () => {
    const markup = renderToStaticMarkup(
      <OutcomeBanner outcome={won('white', 'checkmate')} onNewGame={vi.fn()}>
        <button type="button">Save game</button>
      </OutcomeBanner>,
    )
    // Saving the game you just played is the action worth reaching first.
    expect(markup.indexOf('Save game')).toBeLessThan(markup.indexOf('New game'))
  })
})
