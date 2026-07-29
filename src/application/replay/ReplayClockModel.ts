import type { ArchivedGame } from '@domain/archive/ArchivedGame'
import type { PieceColor } from '@domain/chess/Piece'
import { classical, type TimeControl, type TimeStage } from '@domain/clock/TimeControl'

export type ClockSource = 'recorded' | 'simulated'

export interface ReplayClockReading {
  readonly whiteMs: number | null
  readonly blackMs: number | null
  readonly source: ClockSource
}

/**
 * The control assumed when a game does not declare one. Two hours for the first
 * forty moves, then an hour for the rest, was the standard World Championship
 * control for most of the twentieth century.
 */
export const ASSUMED_CLASSICAL_CONTROL: TimeControl = classical(40, 120, 60)

/**
 * Supplies the clock readings shown during a replay.
 *
 * Worth stating plainly: per-move clock times were not recorded for historical
 * games. Only broadcast PGNs — a small and recent minority — carry `[%clk]`
 * annotations. For every other game this class produces an *estimate*, spending
 * each stage's budget at an even pace, and reports `source` as `'simulated'` so
 * the UI can label it rather than pass invention off as record.
 */
export class ReplayClockModel {
  private constructor(
    readonly source: ClockSource,
    /** The control the simulation assumed; `null` when readings are recorded. */
    readonly assumedControl: TimeControl | null,
    private readonly whiteByPly: readonly (number | null)[],
    private readonly blackByPly: readonly (number | null)[],
  ) {}

  static forGame(
    game: ArchivedGame,
    fallbackControl: TimeControl = ASSUMED_CLASSICAL_CONTROL,
  ): ReplayClockModel {
    const control = game.declaredTimeControl ?? fallbackControl

    if (game.hasRecordedClocks) {
      const startingMs = control.kind === 'unlimited' ? null : (control.stages[0]?.addedMs ?? null)
      return new ReplayClockModel(
        'recorded',
        null,
        recordedTimeline(game, 'white', startingMs),
        recordedTimeline(game, 'black', startingMs),
      )
    }

    return new ReplayClockModel(
      'simulated',
      control,
      simulatedTimeline(control, game, 'white'),
      simulatedTimeline(control, game, 'black'),
    )
  }

  /** `ply` 0 is the starting position, before either clock has run. */
  readingAt(ply: number): ReplayClockReading {
    return {
      whiteMs: readAt(this.whiteByPly, ply),
      blackMs: readAt(this.blackByPly, ply),
      source: this.source,
    }
  }
}

function readAt(timeline: readonly (number | null)[], ply: number): number | null {
  if (timeline.length === 0) return null
  const index = Math.max(0, Math.min(ply, timeline.length - 1))
  return timeline[index] ?? null
}

/**
 * Carries each recorded reading forward until that player moves again, so the
 * side waiting shows the time it actually had left rather than a blank.
 */
function recordedTimeline(
  game: ArchivedGame,
  color: PieceColor,
  startingMs: number | null,
): (number | null)[] {
  const timeline: (number | null)[] = [startingMs]
  let current: number | null = startingMs

  for (const move of game.moves) {
    if (move.color === color && move.recordedClockMs !== null) {
      current = move.recordedClockMs
    }
    timeline.push(current)
  }
  return timeline
}

function paceForStage(
  stage: TimeStage,
  movesRemainingInGame: number,
): number {
  const movesCovered = stage.movesToComplete ?? Math.max(1, movesRemainingInGame)
  return stage.addedMs / Math.max(1, movesCovered)
}

/**
 * Builds one player's clock readings indexed by ply.
 *
 * Spends each stage's budget at a constant pace fixed when the stage opens. A
 * deliberately plain model: variation invented here would imply knowledge of
 * how long a player actually thought, which nobody has.
 */
function simulatedTimeline(
  control: TimeControl,
  game: ArchivedGame,
  color: PieceColor,
): (number | null)[] {
  const totalPlies = game.moves.length
  const ownMoveCount = game.moves.filter((move) => move.color === color).length

  const firstStage = control.kind === 'unlimited' ? undefined : control.stages[0]
  if (firstStage === undefined) {
    return new Array<number | null>(totalPlies + 1).fill(null)
  }
  const stages = control.kind === 'unlimited' ? [] : control.stages

  const afterOwnMove: number[] = []
  let remaining = firstStage.addedMs
  let stageIndex = 0
  let movesInStage = 0
  let pace = paceForStage(firstStage, ownMoveCount)

  for (let moveIndex = 0; moveIndex < ownMoveCount; moveIndex += 1) {
    const stage = stages[stageIndex] ?? firstStage
    remaining = Math.max(0, remaining - pace) + stage.incrementMs
    movesInStage += 1

    if (stage.movesToComplete !== null && movesInStage >= stage.movesToComplete) {
      const nextStage = stages[stageIndex + 1]
      if (nextStage !== undefined) {
        stageIndex += 1
        movesInStage = 0
        remaining += nextStage.addedMs
        pace = paceForStage(nextStage, ownMoveCount - (moveIndex + 1))
      }
    }
    afterOwnMove.push(remaining)
  }

  // Expand "after my Nth move" into a per-ply timeline. White moves on odd
  // plies and Black on even, so Black's reading holds one extra ply at the
  // start while White thinks.
  const timeline: (number | null)[] = [firstStage.addedMs]
  if (color === 'black') timeline.push(firstStage.addedMs)

  for (const value of afterOwnMove) {
    timeline.push(value, value)
  }
  return timeline.slice(0, totalPlies + 1)
}
