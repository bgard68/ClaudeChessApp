import type { MoveIntent } from '@domain/chess/Move'
import type { ClockSnapshot } from '@domain/clock/Clock'
import type {
  ChessEngine,
  EngineConfiguration,
  EngineTimeBudget,
} from './ports/ChessEngine'
import type { MoveRequest, Opponent, OpponentKind } from './Opponent'

/**
 * Adapts a search engine to the opponent contract.
 *
 * Thin by design — logic accumulating here would mean the engine port was
 * leaking protocol details the application should not know about.
 */
export class EngineOpponent implements Opponent {
  readonly kind: OpponentKind = 'engine'

  private prepared = false

  constructor(
    private readonly engine: ChessEngine,
    private readonly configuration: EngineConfiguration,
    readonly name: string = 'Computer',
  ) {}

  async requestMove(request: MoveRequest): Promise<MoveIntent> {
    // Prepared on the first request rather than in the constructor, so that
    // difficulty is guaranteed to be set before the engine ever searches —
    // including when the computer has White and moves first.
    //
    // `newGame` comes first and `configure` second, in that order: the engine
    // clears what the last game left in its tables, and is then told how to
    // play this one.
    if (!this.prepared) {
      await this.engine.newGame()
      await this.engine.configure(this.configuration)
      this.prepared = true
    }
    return this.engine.chooseMove({
      position: request.position,
      history: request.history,
      timeBudget: timeBudgetFor(request.clock),
    })
  }

  cancel(): void {
    this.engine.stop()
  }

  dispose(): void {
    this.engine.dispose()
  }
}

/**
 * The clock as the engine needs it, or nothing at all.
 *
 * Nothing for an untimed game, which has no budget to divide, and nothing once
 * a side has run out — an engine told it has zero milliseconds answers with a
 * move chosen at no depth, which is a worse way to lose than being told to
 * think for the configured time and losing on the clock anyway.
 */
function timeBudgetFor(clock: ClockSnapshot): EngineTimeBudget | undefined {
  const whiteMs = spendable(clock.whiteMs)
  const blackMs = spendable(clock.blackMs)
  if (whiteMs === null || blackMs === null) return undefined

  return {
    whiteMs,
    blackMs,
    whiteIncrementMs: clock.whiteIncrementMs ?? 0,
    blackIncrementMs: clock.blackIncrementMs ?? 0,
  }
}

function spendable(remainingMs: number | null): number | null {
  if (remainingMs === null || !Number.isFinite(remainingMs) || remainingMs <= 0) return null
  return remainingMs
}
