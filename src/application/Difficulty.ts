import type { EngineConfiguration } from './ports/ChessEngine'

export interface DifficultyLevel {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly configuration: EngineConfiguration
}

/**
 * Difficulty comes from two dials: Stockfish's skill level, which makes it
 * choose deliberately worse moves, and a search depth cap, which makes it
 * shallow rather than merely fast.
 *
 * No Elo figures are quoted. The engine build in use has no strength-targeting
 * option, so any rating printed next to these labels would be a guess dressed
 * up as a measurement.
 */
export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Overlooks tactics and leaves pieces hanging.',
    configuration: { skillLevel: 0, searchLimits: { moveTimeMs: 300, maxDepth: 2 } },
  },
  {
    id: 'casual',
    label: 'Casual',
    description: 'Plays sensibly, misses deeper ideas.',
    configuration: { skillLevel: 4, searchLimits: { moveTimeMs: 500, maxDepth: 5 } },
  },
  {
    id: 'club',
    label: 'Club player',
    description: 'Punishes loose play and simple tactics.',
    configuration: { skillLevel: 9, searchLimits: { moveTimeMs: 800, maxDepth: 9 } },
  },
  {
    id: 'expert',
    label: 'Expert',
    description: 'Strong, consistent, and hard to outplay.',
    configuration: { skillLevel: 15, searchLimits: { moveTimeMs: 1_200, maxDepth: 14 } },
  },
  {
    id: 'maximum',
    label: 'Maximum',
    description: 'Full strength, capped only by thinking time.',
    configuration: { skillLevel: 20, searchLimits: { moveTimeMs: 2_000 } },
  },
]

export const DEFAULT_DIFFICULTY_ID = 'casual'

export function difficultyById(id: string): DifficultyLevel {
  const level = DIFFICULTY_LEVELS.find((candidate) => candidate.id === id)
  if (level === undefined) throw new Error(`Unknown difficulty level: "${id}"`)
  return level
}
