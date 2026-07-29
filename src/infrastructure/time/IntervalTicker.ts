import type { Ticker, TickListener } from '@domain/ports/Ticker'

const DEFAULT_INTERVAL_MS = 100

/**
 * Drives clocks from a timer.
 *
 * Reports the time that actually passed rather than the interval it asked for.
 * `setInterval` drifts under load and browsers throttle it hard in background
 * tabs, so a clock that assumed its nominal interval would quietly run slow —
 * and a player would lose time they never spent.
 */
export class IntervalTicker implements Ticker {
  private handle: ReturnType<typeof setInterval> | null = null
  private lastTickAt = 0

  constructor(
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get isRunning(): boolean {
    return this.handle !== null
  }

  start(onTick: TickListener): void {
    this.stop()
    this.lastTickAt = this.now()
    this.handle = setInterval(() => {
      const tickedAt = this.now()
      const elapsedMs = tickedAt - this.lastTickAt
      this.lastTickAt = tickedAt
      onTick(elapsedMs)
    }, this.intervalMs)
  }

  stop(): void {
    if (this.handle === null) return
    clearInterval(this.handle)
    this.handle = null
  }
}
