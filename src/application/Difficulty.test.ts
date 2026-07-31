import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTY_LEVELS,
  MINIMUM_RATED_ELO,
  difficultyById,
} from './Difficulty'

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
  it('never asks the engine for a rating below its floor', () => {
    for (const level of DIFFICULTY_LEVELS) {
      if (level.configuration.strength.kind === 'rated') {
        expect(level.configuration.strength.elo).toBeGreaterThanOrEqual(MINIMUM_RATED_ELO)
      }
    }
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
  it('quotes a rating for every capped level, and none for full strength', () => {
    for (const level of DIFFICULTY_LEVELS) {
      if (level.configuration.strength.kind === 'full') {
        expect(level.rating).toBeNull()
        expect(level.configuration.searchLimits.maxDepth).toBeUndefined()
      } else {
        expect(level.rating).toMatch(/^~\d{4}$/)
      }
    }
  })

  // The rating beside the label is what a player chooses on, so it has to be
  // the number actually sent to the engine.
  it('prints the rating it actually asks for', () => {
    for (const level of DIFFICULTY_LEVELS) {
      if (level.configuration.strength.kind === 'rated') {
        expect(level.rating).toBe(`~${level.configuration.strength.elo}`)
      }
    }
  })

  it('describes each level in a sentence', () => {
    for (const level of DIFFICULTY_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0)
      expect(level.description).toMatch(/\.$/)
    }
  })
})
