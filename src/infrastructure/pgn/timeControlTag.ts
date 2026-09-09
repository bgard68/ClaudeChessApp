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

/**
 * One stage: `moves/seconds`, `seconds`, or `seconds+increment`.
 *
 * Anchored, so the whole section has to be consumed. Splitting and then calling
 * `Number.parseFloat` did not do that: both parsers stop at the first character
 * they cannot use and report what they read up to it, and `split('+', 2)`
 * discards anything past the second field rather than objecting to it. So
 * `40abc/7200` was read as forty moves and `300+3+5` quietly became `300+3` —
 * a clock the tag does not describe, which is the one outcome this module
 * promises not to produce.
 */
const STAGE_PATTERN = /^(?:(\d+)\/)?(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/

function parseStage(section: string): TimeStage | null {
  const match = STAGE_PATTERN.exec(section.trim())
  if (match === null) return null

  const [, movesText, secondsText, incrementText] = match

  // A quota of zero moves is a stage nobody can complete: malformed, not empty.
  const movesToComplete = movesText === undefined ? null : Number.parseInt(movesText, 10)
  if (movesToComplete !== null && movesToComplete <= 0) return null

  return {
    movesToComplete,
    addedMs: Math.round(Number.parseFloat(secondsText ?? '') * 1000),
    incrementMs:
      incrementText === undefined ? 0 : Math.round(Number.parseFloat(incrementText) * 1000),
  }
}
