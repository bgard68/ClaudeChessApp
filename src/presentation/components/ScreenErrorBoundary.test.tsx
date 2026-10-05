/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenErrorBoundary } from './ScreenErrorBoundary'

/*
 * In the jsdom suite because a boundary cannot be tested anywhere else: the
 * static suite's `renderToStaticMarkup` does not support error boundaries at
 * all — a throw propagates to the caller — and no browser script can make a
 * healthy screen throw. Render-time failure injection is this suite's charter.
 */

afterEach(cleanup)

function Bomb(): never {
  throw new Error('the archive data was malformed')
}

describe('ScreenErrorBoundary', () => {
  it('screenErrorBoundary_HealthyChildren_AreRenderedUntouched', () => {
    render(
      <ScreenErrorBoundary onReset={vi.fn()}>
        <p>the screen</p>
      </ScreenErrorBoundary>,
    )
    expect(screen.getByText('the screen')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /*
   * The before/after of this component existing. Before: any render throw
   * unmounted the entire tree — blank white page, no message, no navigation,
   * nothing to say what happened. After: an alert that names the error.
   */
  it('screenErrorBoundary_ChildThrowsWhileRendering_ShowsTheFaultInsteadOfNothing', () => {
    // React logs the throw it re-raises to the boundary; that noise is the
    // mechanism working, not a failure of the test.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ScreenErrorBoundary onReset={vi.fn()}>
        <Bomb />
      </ScreenErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    // The message, because it is the only clue available on a device nobody
    // can attach a debugger to.
    expect(screen.getByText(/the archive data was malformed/)).toBeTruthy()
    // And the reassurance that matters most in a local-first app.
    expect(screen.getByText(/saved games are stored on this device/)).toBeTruthy()
    logged.mockRestore()
  })

  it('screenErrorBoundary_ResetButton_CallsTheWayOut', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onReset = vi.fn()

    render(
      <ScreenErrorBoundary onReset={onReset}>
        <Bomb />
      </ScreenErrorBoundary>,
    )
    fireEvent.click(screen.getByText(/Start a new game/))

    expect(onReset).toHaveBeenCalledOnce()
    logged.mockRestore()
  })
})
