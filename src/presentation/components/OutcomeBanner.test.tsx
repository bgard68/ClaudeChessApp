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
  ])('names the draw reason %s', (reason, expected) => {
    expect(describeOutcome(drawn(reason))).toBe(expected)
  })

  it.each([
    ['white', 'checkmate', 'White won by checkmate'],
    ['black', 'timeout', 'Black won on time'],
    ['white', 'resignation', 'White won by resignation'],
  ] as const)('names a decisive result: %s %s', (winner, reason, expected) => {
    expect(describeOutcome(won(winner, reason))).toBe(expected)
  })

  // A PGN records the result, not how it was reached, so most archived wins
  // arrive with no reason at all. Saying "White won" is the honest sentence;
  // "White won by unknown" would be an admission dressed as a fact.
  it('says only who won when the reason was never recorded', () => {
    expect(describeOutcome(won('black', 'unknown'))).toBe('Black won')
  })

  // A reason the app has not met yet is passed through rather than swallowed:
  // a blank banner would hide the outcome entirely.
  it('falls back to the raw reason it does not recognise', () => {
    expect(describeOutcome(drawn('mutual_boredom'))).toBe('Draw — mutual_boredom')
  })

  it('describes a game still being played as nothing', () => {
    expect(describeOutcome({ status: 'in_progress' } as GameOutcome)).toBe('')
  })
})

describe('OutcomeBanner', () => {
  it('renders nothing while the game is still on', () => {
    const markup = renderToStaticMarkup(
      <OutcomeBanner outcome={{ status: 'in_progress' } as GameOutcome} />,
    )
    expect(markup).toBe('')
  })

  it('announces the result to a screen reader when it appears', () => {
    const markup = renderToStaticMarkup(<OutcomeBanner outcome={won('white', 'checkmate')} />)
    // role="status" is what makes the result spoken rather than merely drawn.
    expect(markup).toContain('role="status"')
    expect(markup).toContain('White won by checkmate')
  })

  it('offers a new game only when there is somewhere to go', () => {
    const withAction = renderToStaticMarkup(
      <OutcomeBanner outcome={drawn('stalemate')} onNewGame={vi.fn()} />,
    )
    const without = renderToStaticMarkup(<OutcomeBanner outcome={drawn('stalemate')} />)

    expect(withAction).toContain('New game')
    expect(without).not.toContain('New game')
  })

  it('places its own actions before the new-game button', () => {
    const markup = renderToStaticMarkup(
      <OutcomeBanner outcome={won('white', 'checkmate')} onNewGame={vi.fn()}>
        <button type="button">Save game</button>
      </OutcomeBanner>,
    )
    // Saving the game you just played is the action worth reaching first.
    expect(markup.indexOf('Save game')).toBeLessThan(markup.indexOf('New game'))
  })
})
