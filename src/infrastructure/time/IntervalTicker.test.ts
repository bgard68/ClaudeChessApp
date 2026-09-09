import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntervalTicker } from './IntervalTicker'

/*
 * The ticker exists to report the time that *actually* passed, not the interval
 * it asked for. `setInterval` drifts under load and browsers throttle it hard
 * in a background tab, so a ticker that trusted its nominal interval would hand
 * a player back time they had already spent. These tests drive a fake clock and
 * a fake timer independently, which is the only way to tell the two apart.
 */

/** A clock the test moves by hand, so "elapsed" is never the wall clock. */
class StubClock {
  private value = 0

  readonly now = (): number => this.value

  advanceTo(ms: number): void {
    this.value = ms
  }
}

describe('IntervalTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('start_BeforeTheFirstInterval_ReportsNothing', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()

    ticker.start(onTick)

    expect(onTick).not.toHaveBeenCalled()
    expect(ticker.isRunning).toBe(true)
  })

  it('start_OneIntervalElapsed_ReportsTheMeasuredTimeNotTheNominalInterval', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    clock.advanceTo(137)
    vi.advanceTimersByTime(100)

    expect(onTick).toHaveBeenCalledTimes(1)
    expect(onTick).toHaveBeenCalledWith(137)
  })

  /*
   * The throttled-tab case: the timer fires once after a long stall, and the
   * whole stall has to be charged. Reporting the nominal 100ms here would give
   * the player back nearly five seconds they spent thinking.
   */
  it('start_TimerStalledInABackgroundTab_ChargesTheWholeStall', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    clock.advanceTo(5_000)
    vi.advanceTimersByTime(100)

    expect(onTick).toHaveBeenCalledWith(5_000)
  })

  it('start_SeveralIntervals_ReportsEachGapRatherThanTheRunningTotal', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    clock.advanceTo(100)
    vi.advanceTimersByTime(100)
    clock.advanceTo(250)
    vi.advanceTimersByTime(100)
    clock.advanceTo(400)
    vi.advanceTimersByTime(100)

    expect(onTick.mock.calls).toEqual([[100], [150], [150]])
  })

  it('start_ClockThatDidNotMove_ReportsZeroRatherThanTheInterval', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    vi.advanceTimersByTime(100)

    expect(onTick).toHaveBeenCalledWith(0)
  })

  it('start_CalledTwice_ReplacesTheFirstListenerInsteadOfRunningBoth', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const first = vi.fn()
    const second = vi.fn()
    ticker.start(first)

    ticker.start(second)
    clock.advanceTo(100)
    vi.advanceTimersByTime(100)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('start_RestartedAfterADelay_MeasuresFromTheRestartNotTheOriginalStart', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(vi.fn())

    clock.advanceTo(9_000)
    ticker.start(onTick)
    clock.advanceTo(9_100)
    vi.advanceTimersByTime(100)

    expect(onTick).toHaveBeenCalledWith(100)
  })

  it('stop_WhileRunning_SilencesTheListener', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(100, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    ticker.stop()
    clock.advanceTo(500)
    vi.advanceTimersByTime(500)

    expect(onTick).not.toHaveBeenCalled()
    expect(ticker.isRunning).toBe(false)
  })

  it('stop_CalledTwice_DoesNotThrow', () => {
    const ticker = new IntervalTicker(100, new StubClock().now)
    ticker.start(vi.fn())

    ticker.stop()
    const stoppingAgain = () => ticker.stop()

    expect(stoppingAgain).not.toThrow()
  })

  it('stop_BeforeEverStarting_ReportsNotRunning', () => {
    const ticker = new IntervalTicker(100, new StubClock().now)

    ticker.stop()

    expect(ticker.isRunning).toBe(false)
  })

  it('start_CustomInterval_FiresOnThatIntervalRatherThanTheDefault', () => {
    const clock = new StubClock()
    const ticker = new IntervalTicker(250, clock.now)
    const onTick = vi.fn()
    ticker.start(onTick)

    vi.advanceTimersByTime(240)

    expect(onTick).not.toHaveBeenCalled()
  })
})
