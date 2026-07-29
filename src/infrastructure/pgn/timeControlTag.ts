import type { TimeControl, TimeStage } from '@domain/clock/TimeControl'

/**
 * Parses the PGN `TimeControl` tag.
 *
 * The format is colon-separated stages, each `moves/seconds`, `seconds`, or
 * `seconds+increment` — so "40/7200:1800" means forty moves in two hours, then
 * thirty minutes for the rest. Returns `null` for the unknown ("?") and
 * unspecified ("-") markers, and for anything malformed: a wrong clock is worse
 * than an honest absence.
 */
export function parseTimeControlTag(value: string | undefined): TimeControl | null {
  if (value === undefined) return null

  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '?' || trimmed === '-') return null

  const stages: TimeStage[] = []

  for (const section of trimmed.split(':')) {
    const stage = parseStage(section)
    if (stage === null) return null
    stages.push(stage)
  }

  if (stages.length === 0) return null

  // Whatever the tag says, the final stage runs to the end of the game.
  const lastIndex = stages.length - 1
  const lastStage = stages[lastIndex]
  if (lastStage !== undefined) {
    stages[lastIndex] = { ...lastStage, movesToComplete: null }
  }

  return { kind: 'staged', stages }
}

/**
 * The inverse of {@link parseTimeControlTag}, so a game this app saves reloads
 * with the control it was actually played under.
 */
export function formatTimeControlTag(control: TimeControl): string {
  if (control.kind === 'unlimited') return '-'

  return control.stages
    .map((stage) => {
      const seconds = Math.round(stage.addedMs / 1000)
      const increment = Math.round(stage.incrementMs / 1000)
      const budget = increment > 0 ? `${seconds}+${increment}` : `${seconds}`
      return stage.movesToComplete === null ? budget : `${stage.movesToComplete}/${budget}`
    })
    .join(':')
}

function parseStage(section: string): TimeStage | null {
  const [movesText, budgetText] = section.includes('/')
    ? section.split('/', 2)
    : [undefined, section]

  const [secondsText, incrementText] = (budgetText ?? '').split('+', 2)

  const seconds = Number.parseFloat(secondsText ?? '')
  if (!Number.isFinite(seconds) || seconds < 0) return null

  let movesToComplete: number | null = null
  if (movesText !== undefined) {
    const moves = Number.parseInt(movesText, 10)
    if (!Number.isFinite(moves) || moves <= 0) return null
    movesToComplete = moves
  }

  const increment =
    incrementText === undefined ? 0 : Number.parseFloat(incrementText)
  if (!Number.isFinite(increment) || increment < 0) return null

  return {
    movesToComplete,
    addedMs: Math.round(seconds * 1000),
    incrementMs: Math.round(increment * 1000),
  }
}
