import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntervalTicker } from './IntervalTicker'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('IntervalTicker', () => {
  it('reports the time that actually passed, not the interval it asked for', () => {
    // A clock the test controls stands in for performance.now, so throttling
    // and drift can be simulated exactly.
    let nowMs = 0
    const elapsed: number[] = []
    const ticker = new IntervalTicker(100, () => nowMs)

    ticker.start((elapsedMs) => elapsed.push(elapsedMs))
    expect(ticker.isRunning).toBe(true)

    // The browser fired late — 250ms of wall time across one 100ms interval.
    nowMs = 250
    vi.advanceTimersByTime(100)
    expect(elapsed).toEqual([250])

    // The next tick charges only what passed since the last one.
    nowMs = 300
    vi.advanceTimersByTime(100)
    expect(elapsed).toEqual([250, 50])
  })

  it('stops cleanly and tolerates stopping twice', () => {
    const ticker = new IntervalTicker(50, () => 0)
    const onTick = vi.fn()

    // Stopping before ever starting must be a no-op, not a crash.
    ticker.stop()

    ticker.start(onTick)
    ticker.stop()
    expect(ticker.isRunning).toBe(false)

    vi.advanceTimersByTime(500)
    expect(onTick).not.toHaveBeenCalled()

    ticker.stop()
    expect(ticker.isRunning).toBe(false)
  })

  it('replaces the previous schedule when started again', () => {
    let nowMs = 0
    const elapsed: number[] = []
    const ticker = new IntervalTicker(100, () => nowMs)

    ticker.start((elapsedMs) => elapsed.push(elapsedMs))
    ticker.start((elapsedMs) => elapsed.push(1000 + elapsedMs))

    nowMs = 100
    vi.advanceTimersByTime(100)
    // Only the second listener fires; the first schedule was cleared.
    expect(elapsed).toEqual([1100])
  })

  it('runs on its defaults against the real performance clock', () => {
    const ticker = new IntervalTicker()
    const onTick = vi.fn()

    ticker.start(onTick)
    vi.advanceTimersByTime(100)
    ticker.stop()

    expect(onTick).toHaveBeenCalledTimes(1)
    // Fake timers advance the scheduler, not performance.now, so the honest
    // assertion is that a number came through, not which number.
    expect(onTick).toHaveBeenCalledWith(expect.any(Number))
  })
})
