export const MS_PER_SECOND = 1_000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND

/**
 * One stage of a time control.
 *
 * `movesToComplete` is how many moves this player must finish before the next
 * stage begins; `null` marks the final stage, which runs to the end of the
 * game. `addedMs` is granted when the stage opens — for the first stage that is
 * simply the starting time.
 */
export interface TimeStage {
  readonly movesToComplete: number | null
  readonly addedMs: number
  readonly incrementMs: number
}

/**
 * A modern blitz control and a 1927-era adjournment control differ only in how
 * many stages they have, so both are expressed as one shape. That keeps `Clock`
 * from growing a branch per format.
 */
export type TimeControl =
  | { readonly kind: 'unlimited' }
  | { readonly kind: 'staged'; readonly stages: readonly TimeStage[] }

export const UNLIMITED: TimeControl = { kind: 'unlimited' }

/** A single-stage control: the familiar "5+3" of online play. */
export function suddenDeath(minutes: number, incrementSeconds = 0): TimeControl {
  return {
    kind: 'staged',
    stages: [
      {
        movesToComplete: null,
        addedMs: minutes * MS_PER_MINUTE,
        incrementMs: incrementSeconds * MS_PER_SECOND,
      },
    ],
  }
}

/** The classical shape used by most World Championship matches: a move quota
 *  at the first control, then a smaller budget for the rest. */
export function classical(
  firstStageMoves: number,
  firstStageMinutes: number,
  remainderMinutes: number,
  incrementSeconds = 0,
): TimeControl {
  const incrementMs = incrementSeconds * MS_PER_SECOND
  return {
    kind: 'staged',
    stages: [
      {
        movesToComplete: firstStageMoves,
        addedMs: firstStageMinutes * MS_PER_MINUTE,
        incrementMs,
      },
      { movesToComplete: null, addedMs: remainderMinutes * MS_PER_MINUTE, incrementMs },
    ],
  }
}

export interface TimeControlPreset {
  readonly id: string
  readonly label: string
  readonly category: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' | 'Untimed'
  readonly control: TimeControl
}

export const TIME_CONTROL_PRESETS: readonly TimeControlPreset[] = [
  { id: 'unlimited', label: 'No clock', category: 'Untimed', control: UNLIMITED },
  { id: '1+0', label: '1 min', category: 'Bullet', control: suddenDeath(1) },
  { id: '2+1', label: '2 | 1', category: 'Bullet', control: suddenDeath(2, 1) },
  { id: '3+0', label: '3 min', category: 'Blitz', control: suddenDeath(3) },
  { id: '3+2', label: '3 | 2', category: 'Blitz', control: suddenDeath(3, 2) },
  { id: '5+3', label: '5 | 3', category: 'Blitz', control: suddenDeath(5, 3) },
  { id: '10+0', label: '10 min', category: 'Rapid', control: suddenDeath(10) },
  { id: '15+10', label: '15 | 10', category: 'Rapid', control: suddenDeath(15, 10) },
  { id: '30+0', label: '30 min', category: 'Classical', control: suddenDeath(30) },
  { id: '90+30', label: '90 | 30', category: 'Classical', control: suddenDeath(90, 30) },
]

/** Total time a player is granted across every stage, assuming they reach the
 *  final one. Used to size a simulated replay clock. */
export function totalBudgetMs(control: TimeControl): number | null {
  if (control.kind === 'unlimited') return null
  return control.stages.reduce((sum, stage) => sum + stage.addedMs, 0)
}

/** Derived rather than stored, so a control can never disagree with its label. */
export function describeTimeControl(control: TimeControl): string {
  if (control.kind === 'unlimited') return 'No clock'

  return control.stages
    .map((stage) => {
      const minutes = Math.round(stage.addedMs / MS_PER_MINUTE)
      const increment = stage.incrementMs / MS_PER_SECOND
      const budget = increment > 0 ? `${minutes} min + ${increment}s` : `${minutes} min`
      return stage.movesToComplete === null
        ? budget
        : `${stage.movesToComplete} moves / ${budget}`
    })
    .join(', then ')
}
