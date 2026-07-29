import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { insertStatement } from './gameRow'
import { gameKey } from './gameKey'
import { splitPgnGames } from '../pgn/splitPgnGames'
import { summarise } from '../pgn/pgnHeaders'

/**
 * Guards the two promises the library makes: every game is a real, playable
 * game, and no game is stored twice. Run against the built collections rather
 * than a fixture — historical PGN is messy, and this is what catches the game
 * nobody imagined.
 */
const LIBRARY_DIR = join(process.cwd(), 'public', 'games')

const files = readdirSync(LIBRARY_DIR).filter((name) => name.endsWith('.pgn'))
const games = files.flatMap((file) =>
  splitPgnGames(readFileSync(join(LIBRARY_DIR, file), 'utf8')).map((pgn) => ({ pgn, file })),
)

const tagOf = (pgn: string, name: string): string =>
  new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(pgn)?.[1] ?? ''

const normalisedMoves = (pgn: string): string =>
  pgn
    .replace(/^\s*\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

describe('bundled game library', () => {
  it('ships more than one collection, all non-empty', () => {
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(games.length).toBeGreaterThan(2_000)
  })

  /**
   * A sample, not the whole set: replaying all 245,000 half-moves takes half a
   * minute, which does not belong in a suite meant to run constantly. Every
   * game is validated where it matters — `build-library` refuses to write one
   * that will not play, and `npm run audit-library` re-checks all of them.
   */
  it('contains only games that actually play out', () => {
    const sample = games.filter((_, index) => index % 7 === 0)
    const unplayable: string[] = []

    expect(sample.length).toBeGreaterThan(300)

    for (const { pgn, file } of sample) {
      const chess = new Chess()
      try {
        chess.loadPgn(pgn, { strict: false })
        if (chess.history().length === 0) {
          unplayable.push(`${file}: ${tagOf(pgn, 'White')} v ${tagOf(pgn, 'Black')} (no moves)`)
        }
      } catch (error) {
        unplayable.push(
          `${file}: ${tagOf(pgn, 'White')} v ${tagOf(pgn, 'Black')} — ${String(error)}`,
        )
      }
    }

    expect(unplayable.slice(0, 5)).toEqual([])
    // Explicit budget: replaying several hundred games sits close to the 5s
    // default on its own, and tips over it when the suite competes for CPU.
    // It was failing on timing, never on a bad game.
  }, 30_000)

  it('holds no game twice, within a file or across them', () => {
    const seen = new Map<string, string>()
    const repeated: string[] = []

    for (const { pgn, file } of games) {
      const key = gameKey(pgn)
      const first = seen.get(key)
      if (first === undefined) seen.set(key, file)
      else repeated.push(`${tagOf(pgn, 'White')} v ${tagOf(pgn, 'Black')}: ${file} and ${first}`)
    }

    expect(repeated.slice(0, 5)).toEqual([])
  })

  it('holds no game that is a truncated copy of another', () => {
    // Same players, same year, one move list a prefix of the other.
    const byPairing = new Map<string, string[]>()

    for (const { pgn } of games) {
      const key = [
        tagOf(pgn, 'White').toLowerCase(),
        tagOf(pgn, 'Black').toLowerCase(),
        tagOf(pgn, 'Date').slice(0, 4),
      ].join('|')
      const list = byPairing.get(key) ?? []
      list.push(normalisedMoves(pgn))
      byPairing.set(key, list)
    }

    let truncated = 0
    for (const list of byPairing.values()) {
      const ordered = [...list].sort((a, b) => b.length - a.length)
      for (let i = 0; i < ordered.length; i += 1) {
        for (let j = i + 1; j < ordered.length; j += 1) {
          if (ordered[i]!.startsWith(ordered[j]!)) truncated += 1
        }
      }
    }

    expect(truncated).toBe(0)
  })

  it('names every famous game and no other', () => {
    const named = games.filter(({ pgn }) => tagOf(pgn, 'Nickname') !== '')

    expect(named.length).toBeGreaterThanOrEqual(15)
    expect(named.every(({ file }) => file.includes('famous'))).toBe(true)
    expect(named.map(({ pgn }) => tagOf(pgn, 'Nickname'))).toContain('The Immortal Game')
  })

  it('spans the whole history of the title, 1886 to the present', () => {
    const years = games
      .map(({ pgn }) => Number.parseInt(tagOf(pgn, 'Date').slice(0, 4), 10))
      .filter((year) => Number.isFinite(year))

    expect(Math.min(...years)).toBeLessThanOrEqual(1886)
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2024)
  })

  it('includes every title match played since 2008', () => {
    const years = new Set(
      games.map(({ pgn }) => Number.parseInt(tagOf(pgn, 'Date').slice(0, 4), 10)),
    )

    // Anand's defences, the Carlsen era, Ding, and Gukesh.
    for (const year of [2010, 2012, 2013, 2014, 2016, 2018, 2021, 2023, 2024]) {
      expect(years.has(year), `no games from the ${year} match`).toBe(true)
    }
  })

  it('builds a database row for every game that satisfies the schema', () => {
    for (const { pgn } of games) {
      const bind = insertStatement(pgn, 'championship').bind!

      expect(typeof bind[1]).toBe('string') // white
      expect(typeof bind[2]).toBe('string') // black
      expect(['1-0', '0-1', '1/2-1/2', '*']).toContain(bind[10])
      expect(['decisive', 'draw', 'in_progress']).toContain(bind[11])
      expect(bind[19]).toBeTypeOf('string') // game_key, never null for bundled games
    }
  })

  it('indexes every game with players and a date', () => {
    const summaries = games.map(({ pgn }, index) => summarise(pgn, `game-${index}`))

    expect(summaries.every((summary) => summary.white !== 'Unknown')).toBe(true)
    expect(summaries.every((summary) => /^\d{4}/.test(summary.date))).toBe(true)
  })
})
