/**
 * Fetches World Championship matches played after 2008, which the older
 * collection stops short of.
 *
 * Four players cover every match since then, because each was one of the two
 * contestants. Games are identified by their event tag rather than guessed at,
 * so nothing here relies on knowing who played whom.
 *
 * Run with `npm run fetch-modern`. Output is gitignored.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZipEntries } from './lib/unzip.mjs'

const BASE_URL = 'https://www.pgnmentor.com/players'
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetFile = join(projectRoot, 'public', 'games', 'raw', 'modern-championships.pgn')

/**
 * Between them these four played in every title match since 2008:
 * Anand (2010, 2012, 2013), Carlsen (2013–2021), Ding (2023, 2024),
 * Gukesh (2024). Overlapping copies are removed by `build-library`.
 */
const PLAYERS = ['Anand', 'Carlsen', 'Ding', 'Gukesh']

/**
 * "WCh 2021", "WCh Rapid TB 2018", and plain "WCh" — the 2010 match carries no
 * year in its event tag, so the year is read from the date instead. Anchored,
 * so exhibitions with championship-sounding names are not swept in.
 */
const CHAMPIONSHIP_EVENT = /^WCh(?: Rapid TB)?(?: 20\d{2})?$/i

const FIRST_YEAR = 2009

const tagOf = (game, name) => {
  const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)
  return match === null ? '' : match[1]
}

async function main() {
  if (process.env.FORCE !== '1' && existsSync(targetFile) && statSync(targetFile).size > 0) {
    process.stdout.write('Modern championship games already present. FORCE=1 to refresh.\n')
    return
  }

  const collected = []
  const byMatch = new Map()

  for (const player of PLAYERS) {
    process.stdout.write(`  fetching ${player}\n`)

    const response = await fetch(`${BASE_URL}/${player}.zip`)
    if (!response.ok) throw new Error(`${player}.zip -> ${response.status}`)

    const buffer = Buffer.from(await response.arrayBuffer())
    const entry = readZipEntries(buffer).find((file) => file.name.endsWith('.pgn'))
    if (entry === undefined) throw new Error(`${player}.zip contains no .pgn`)

    const games = entry
      .read()
      .toString('utf8')
      .split(/(?=\[Event )/)
      .filter((game) => game.trim() !== '')

    for (const game of games) {
      const event = tagOf(game, 'Event')
      if (!CHAMPIONSHIP_EVENT.test(event)) continue

      const year = Number(tagOf(game, 'Date').slice(0, 4))
      if (!Number.isFinite(year) || year < FIRST_YEAR) continue

      collected.push(game.trim())
      const label = /20\d{2}/.test(event) ? event : `${event} ${year}`
      byMatch.set(label, (byMatch.get(label) ?? 0) + 1)
    }
  }

  if (collected.length === 0) {
    console.error('No post-2008 championship games found; the source may have changed.')
    process.exit(1)
  }

  await mkdir(dirname(targetFile), { recursive: true })
  await writeFile(targetFile, `${collected.join('\n\n')}\n`, 'utf8')

  process.stdout.write(`\nWrote ${collected.length} games (duplicates removed later)\n`)
  for (const [event, count] of [...byMatch].sort()) {
    process.stdout.write(`  ${String(count).padStart(3)}  ${event}\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
