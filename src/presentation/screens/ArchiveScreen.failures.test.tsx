/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { installDomStubs } from '../../test-support/dom'
import { ServicesProvider } from '../ServicesContext'
import { ArchiveScreen } from './ArchiveScreen'

/*
 * What the archive says when the library will not answer.
 *
 * These are the error paths TESTING.md listed as uncovered, and they were
 * uncovered for a structural reason rather than an oversight: the node suite
 * renders one static commit and never runs the effect that queries, and the
 * browser scripts get the real database, which succeeds. Neither can be *told*
 * to fail.
 *
 * The seam they go through already existed and was unused — `ServicesProvider`
 * takes a `value` prop documented as "stand-in services, for tests". All this
 * needed was an environment where effects run.
 */

// The master/detail pane is gated on a media query. True here so the screen
// renders its full desktop layout, which is the one with the most to go wrong.
installDomStubs({ matchMedia: true })

/** An archive that answers however the test says, and nothing else. */
const archiveThat = (over: Record<string, unknown>) =>
  ({
    services: {
      archive: {
        facets: () => Promise.resolve({ totalGames: 1, events: [], years: [] }),
        list: () => Promise.resolve({ games: [], total: 0 }),
        load: () => Promise.reject(new Error('not asked for')),
        suggestPlayers: () => Promise.resolve([]),
        exportPgn: () => Promise.resolve(''),
        ...over,
      },
      store: { remove: vi.fn() },
    },
    factory: {},
  }) as never

const show = (services: never) =>
  render(
    <ServicesProvider value={services}>
      <ArchiveScreen scope="reference" onOpenGame={vi.fn()} />
    </ServicesProvider>,
  )

describe('the archive when the library fails', () => {
  /*
   * The message has to be the one the library gave, not a generic apology.
   * "Something went wrong" is unactionable; the storage layer's own reason is
   * the only clue available on a device nobody can attach a debugger to.
   */
  it('archiveScreen_QueryRejects_ShowsWhatTheLibrarySaid', async () => {
    show(
      archiveThat({
        list: () => Promise.reject(new Error('the game library is unreachable')),
      }),
    )

    await waitFor(() =>
      expect(screen.getByText(/the game library is unreachable/)).toBeTruthy(),
    )
  })

  // A rejected query must not also read as an empty library: one is a fault to
  // retry, the other is a state to explain, and they need different words.
  it('archiveScreen_QueryRejects_OffersAWayBack', async () => {
    show(archiveThat({ list: () => Promise.reject(new Error('disk gone')) }))

    await waitFor(() => expect(screen.getByText(/disk gone/)).toBeTruthy())
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull()
  })

  /*
   * Not covered here, and recorded rather than quietly dropped: the preview
   * pane's *failed* caption.
   *
   * It can be driven to the failed state — `load` rejects, the effect's catch
   * runs with `cancelled` false, and `GamePreview` re-renders returning "This
   * game could not be loaded." That was confirmed by instrumenting the render.
   * The update then does not reach the DOM, and neither `waitFor` nor an
   * explicit `act` flush moves it.
   *
   * Narrow, and not a general jsdom limitation: `PlayScreen.failures.test.tsx`
   * asserts against state that changes after its first commit and passes. So it
   * is something about this subtree — the board the preview mounts is the
   * obvious suspect, since react-chessboard is the one thing in it that jsdom
   * cannot give real geometry to. Not chased further; it is a test-environment
   * problem rather than a fault in the screen, and the screen's own decision is
   * covered below.
   *
   * So the failed caption is covered by `previewCaption`'s own unit tests over
   * its four states, and the path that reaches it is not covered end to end.
   * Written down because a missing test that nobody can see is how
   * "assertions that survive the bug they exist to catch" happened here before.
   */
})
