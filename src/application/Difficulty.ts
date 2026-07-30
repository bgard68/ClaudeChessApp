import type { EngineConfiguration } from './ports/ChessEngine'

export interface DifficultyLevel {
  readonly id: string
  readonly label: string
  readonly description: string
  /** What to print beside the label. Null where no rating is claimed. */
  readonly rating: string | null
  readonly configuration: EngineConfiguration
}

/**
 * The lowest rating Stockfish will play at.
 *
 * Its own floor, not a choice made here: below this the engine stops honouring
 * the target and plays at whatever strength it happens to reach. Quoting a lower
 * number would be quoting one the engine does not deliver.
 */
export const MINIMUM_RATED_ELO = 1320

/**
 * Difficulty is a rating the engine is asked to play at, plus a search cap.
 *
 * The ratings are real in the sense that matters: Stockfish's own
 * `UCI_LimitStrength` target, not a guess mapped from its skill dial. They are
 * still the engine's estimate of its own strength rather than a FIDE rating
 * earned over a board, and its floor of 1320 is well above a beginner — which is
 * why the easiest level leans on a shallow depth cap for the rest.
 */
export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Overlooks tactics and leaves pieces hanging.',
    // The engine will not aim lower than 1320, so the depth cap does the rest.
    rating: `~${MINIMUM_RATED_ELO}`,
    configuration: {
      strength: { kind: 'rated', elo: MINIMUM_RATED_ELO },
      searchLimits: { moveTimeMs: 300, maxDepth: 2 },
    },
  },
  {
    id: 'casual',
    label: 'Casual',
    description: 'Plays sensibly, misses deeper ideas.',
    rating: '~1500',
    configuration: {
      strength: { kind: 'rated', elo: 1500 },
      searchLimits: { moveTimeMs: 500, maxDepth: 8 },
    },
  },
  {
    id: 'club',
    label: 'Club player',
    description: 'Punishes loose play and simple tactics.',
    rating: '~1800',
    configuration: {
      strength: { kind: 'rated', elo: 1800 },
      searchLimits: { moveTimeMs: 800, maxDepth: 12 },
    },
  },
  {
    id: 'expert',
    label: 'Expert',
    description: 'Strong, consistent, and hard to outplay.',
    rating: '~2200',
    configuration: {
      strength: { kind: 'rated', elo: 2200 },
      searchLimits: { moveTimeMs: 1_200, maxDepth: 16 },
    },
  },
  {
    id: 'maximum',
    label: 'Maximum',
    description: 'Full strength, capped only by thinking time.',
    // No figure: unlimited strength has no rating to quote, and the number it
    // would reach depends on the machine and the time it is given.
    rating: null,
    configuration: {
      strength: { kind: 'full' },
      searchLimits: { moveTimeMs: 2_000 },
    },
  },
]

export const DEFAULT_DIFFICULTY_ID = 'casual'

export function difficultyById(id: string): DifficultyLevel {
  const level = DIFFICULTY_LEVELS.find((candidate) => candidate.id === id)
  if (level === undefined) throw new Error(`Unknown difficulty level: "${id}"`)
  return level
}
