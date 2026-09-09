import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTY_LEVELS,
  MINIMUM_RATED_ELO,
  difficultyById,
} from './Difficulty'

/*
 * The list is partitioned once here, rather than filtered inside each test.
 *
 * These used to be `for` loops with an `if` in them, which is a shape that
 * passes when the filter matches nothing: had every level become full
 * strength, "never asks below the floor" would have gone green while asserting
 * nothing at all. Partitioning up front makes each case a named row, and the
 * two guards below fail loudly if either half ever empties.
 */
const RATED_LEVELS = DIFFICULTY_LEVELS.flatMap((level) =>
  level.configuration.strength.kind === 'rated'
    ? [
        [
          level.id,
          level.configuration.strength.elo,
          level.rating,
          level.configuration.searchLimits.maxDepth,
        ] as const,
      ]
    : [],
)

const FULL_STRENGTH_LEVELS = DIFFICULTY_LEVELS.flatMap((level) =>
  level.configuration.strength.kind === 'full'
    ? [[level.id, level.rating, level.configuration.searchLimits.maxDepth] as const]
    : [],
)

const EVERY_LEVEL = DIFFICULTY_LEVELS.map(
  (level) => [level.id, level.label, level.description] as const,
)

describe('difficultyById', () => {
  it('finds each level by its id', () => {
    expect(difficultyById('club').label).toBe('Club player')
    expect(difficultyById('maximum').label).toBe('Maximum')
  })

  /*
   * Throwing rather than falling back to a default: the id comes from the
   * setup screen's own list, so an unknown one means the two have drifted
   * apart, and quietly playing at some other strength would hide that.
   */
  it('refuses an id it does not know, and says which', () => {
    expect(() => difficultyById('grandmaster')).toThrow('Unknown difficulty level: "grandmaster"')
  })
})

describe('DEFAULT_DIFFICULTY_ID', () => {
  it('names a level that exists', () => {
    expect(() => difficultyById(DEFAULT_DIFFICULTY_ID)).not.toThrow()
  })

  // The default a first-time player meets should not be the hardest or the
  // most artificial — it sits in the middle on purpose.
  it('is neither the weakest nor the strongest', () => {
    const index = DIFFICULTY_LEVELS.findIndex((level) => level.id === DEFAULT_DIFFICULTY_ID)
    expect(index).toBeGreaterThan(0)
    expect(index).toBeLessThan(DIFFICULTY_LEVELS.length - 1)
  })
})

describe('the levels', () => {
  it('each have a distinct id', () => {
    const ids = DIFFICULTY_LEVELS.map((level) => level.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The list is presented in order, so it has to read as one.
  it('get stronger from one to the next', () => {
    const elos = DIFFICULTY_LEVELS.map((level) =>
      level.configuration.strength.kind === 'rated'
        ? level.configuration.strength.elo
        : Number.POSITIVE_INFINITY,
    )
    expect([...elos]).toEqual([...elos].sort((a, b) => a - b))
  })

  it('give the engine longer to think as they get harder', () => {
    const times = DIFFICULTY_LEVELS.map((level) => level.configuration.searchLimits.moveTimeMs)
    expect([...times]).toEqual([...times].sort((a, b) => a - b))
  })

  /*
   * Stockfish will not aim below 1320 — its own floor, not a choice made
   * here. Claiming a lower rating would be quoting a number the engine does
   * not deliver, so the easiest level sits at the floor and uses a shallow
   * depth cap to be beatable.
   */
  // Guards for the two tables below: an empty table asserts nothing, and does
  // it silently. Both halves of the list have to stay populated.
  it('has at least one level of each kind to check', () => {
    expect(RATED_LEVELS.length).toBeGreaterThan(0)
    expect(FULL_STRENGTH_LEVELS.length).toBeGreaterThan(0)
    expect(RATED_LEVELS.length + FULL_STRENGTH_LEVELS.length).toBe(DIFFICULTY_LEVELS.length)
  })

  it.each(RATED_LEVELS)('never asks the engine to play %s below its rating floor', (_id, elo) => {
    expect(elo).toBeGreaterThanOrEqual(MINIMUM_RATED_ELO)
  })

  it('makes the easiest level beatable with depth rather than a false rating', () => {
    const beginner = difficultyById('beginner')
    expect(beginner.configuration.strength).toEqual({ kind: 'rated', elo: MINIMUM_RATED_ELO })
    expect(beginner.configuration.searchLimits.maxDepth).toBeLessThanOrEqual(2)
  })

  /*
   * Full strength has no rating to quote — what it would reach depends on the
   * machine and the time it is given — so it claims none rather than printing
   * a number it cannot stand behind.
   */
  it.each(FULL_STRENGTH_LEVELS)(
    'quotes no rating for %s, and lets it search as deep as it likes',
    (_id, rating, maxDepth) => {
      expect(rating).toBeNull()
      expect(maxDepth).toBeUndefined()
    },
  )

  // The rating beside the label is what a player chooses on, so it has to be
  // the number actually sent to the engine — not merely some four-digit figure.
  it.each(RATED_LEVELS)('prints the rating it actually asks for at %s', (_id, elo, rating) => {
    expect(rating).toBe(`~${elo}`)
  })

  it.each(EVERY_LEVEL)('describes %s in a sentence', (_id, label, description) => {
    expect(label.length).toBeGreaterThan(0)
    expect(description).toMatch(/\.$/)
  })
})
