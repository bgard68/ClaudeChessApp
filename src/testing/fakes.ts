import type { MoveIntent } from '@domain/chess/Move'
import type { Ticker, TickListener } from '@domain/ports/Ticker'
import { MoveRequestAbandoned, type Opponent, type OpponentKind } from '@application/Opponent'

/**
 * A ticker driven by the test rather than by wall time. Advancing five minutes
 * takes no time at all, which is the entire reason `Ticker` is a port.
 */
export class FakeTicker implements Ticker {
  private listener: TickListener | null = null

  get isRunning(): boolean {
    return this.listener !== null
  }

  start(onTick: TickListener): void {
    this.listener = onTick
  }

  stop(): void {
    this.listener = null
  }

  advance(elapsedMs: number): void {
    this.listener?.(elapsedMs)
  }
}

/**
 * Plays a fixed list of moves, then stalls — standing in for a player who is
 * still thinking, which is what a timeout test needs.
 */
export class ScriptedOpponent implements Opponent {
  readonly kind: OpponentKind = 'engine'

  private index = 0
  private abandon: (() => void) | null = null

  constructor(
    readonly name: string,
    private readonly moves: readonly MoveIntent[],
  ) {}

  requestMove(): Promise<MoveIntent> {
    const move = this.moves[this.index]
    this.index += 1

    if (move !== undefined) return Promise.resolve(move)

    return new Promise<MoveIntent>((_resolve, reject) => {
      this.abandon = () => reject(new MoveRequestAbandoned())
    })
  }

  cancel(): void {
    const abandon = this.abandon
    this.abandon = null
    abandon?.()
  }

  dispose(): void {
    this.cancel()
  }
}

/** Lets queued promise callbacks run, so an in-flight turn loop can settle. */
export async function flushAsync(times = 4): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}
