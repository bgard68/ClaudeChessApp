/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameConfiguration } from '@application/GameConfiguration'
import type { LiveGame } from '@application/LiveGame'
import { suddenDeath } from '@domain/clock/TimeControl'
import { installDomStubs } from '../../test-support/dom'
import { ServicesProvider } from '../ServicesContext'
import { PlayScreen } from './PlayScreen'

/*
 * What the play screen says when saving fails.
 *
 * The companion to `PlayScreen.test.tsx`, which renders one static commit and
 * therefore cannot click anything. Saving is a click, and its failure branch is
 * reachable only by a store that refuses — which is what the `ServicesProvider`
 * injection point is for.
 */

installDomStubs()

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const RAPID = suddenDeath(10)

/** One move played, so there is something to save and the button is live. */
const game = (): LiveGame =>
  ({
    subscribe: () => () => {},
    submitMove: vi.fn(),
    undo: vi.fn(),
    resign: vi.fn(),
    agreeDraw: vi.fn(),
    state: {
      position: { fen: START, sideToMove: 'white' },
      legalMoves: [],
      history: [{ san: 'e4', from: 'e2', to: 'e4', color: 'white', ply: 1 }],
      outcome: { status: 'in_progress' },
      awaiting: { kind: 'human', name: 'You' },
      isCheck: false,
      canUndo: true,
      timeControl: RAPID,
      clock: { whiteMs: 600_000, blackMs: 600_000, running: 'white' },
    },
  }) as unknown as LiveGame

const configuration = {
  opponent: 'computer',
  playerColor: 'white',
  difficulty: { label: 'Club' },
  timeControl: RAPID,
} as unknown as GameConfiguration

const servicesWhere = (save: () => Promise<void>) =>
  ({
    services: {
      // Never settles: the durability warning is not what these are about, and
      // a resolved one would add a second message to read past.
      archive: { durability: () => new Promise(() => {}) },
      store: { save },
      rules: { play: () => null },
    },
    factory: { createHintAdviser: () => ({ advise: () => new Promise(() => {}) }) },
  }) as never

const show = (save: () => Promise<void>) =>
  render(
    <ServicesProvider value={servicesWhere(save)}>
      <PlayScreen game={game()} configuration={configuration} onNewGame={vi.fn()} />
    </ServicesProvider>,
  )

/** There are two Save buttons — the panel's and the mobile menu's. */
const clickSave = () => fireEvent.click(screen.getAllByText(/Save game/)[0]!)

describe('the play screen when saving fails', () => {
  it('playScreen_StoreRejects_SaysTheGameWasNotSaved', async () => {
    // Logged by the screen, which is correct and not what is under test.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    show(() => Promise.reject(new Error('the database is full')))

    clickSave()

    await waitFor(() =>
      expect(screen.getByText(/could not be saved/)).toBeTruthy(),
    )
    logged.mockRestore()
  })

  /*
   * A failed save must leave the button usable.
   *
   * It reads "Retry save" afterwards, and the disabled condition covers only
   * `saving` and `saved` — so the retry is genuinely offered rather than being
   * a label on a dead control. Worth asserting because the states are now
   * stamped with the ply they cover, and a mistake there would disable the
   * button on the wrong comparison.
   */
  it('playScreen_SaveFailed_OffersARetryThatIsNotDisabled', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    show(() => Promise.reject(new Error('the database is full')))

    clickSave()

    const retry = await waitFor(() => {
      const button = screen.getAllByText(/Retry save/)[0]?.closest('button')
      if (button === null || button === undefined) throw new Error('no retry yet')
      return button
    })
    expect(retry.disabled).toBe(false)
    logged.mockRestore()
  })
})
