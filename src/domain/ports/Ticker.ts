export type TickListener = (elapsedMs: number) => void

/**
 * A source of elapsed time.
 *
 * Clocks are the part of a chess app most likely to be subtly wrong, and are
 * untestable when wired straight to `Date.now()`. Behind this port a test can
 * advance five minutes instantly and assert on flag-fall.
 */
export interface Ticker {
  readonly isRunning: boolean
  start(onTick: TickListener): void
  stop(): void
}
