/**
 * Downloads the world champions' full careers, and the elite players who make
 * up the fields of the great tournaments.
 *
 * These are large — far larger than the championship collection — so they are
 * written as optional collections the app offers to add, rather than games it
 * loads on first launch.
 *
 * Run with `npm run fetch-careers`. Output is gitignored.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZipEntries } from './lib/unzip.mjs'

const BASE_URL = 'https://www.pgnmentor.com/players'
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(projectRoot, 'public', 'games', 'raw')

/** Every undisputed champion, plus those who held the FIDE title during the split. */
const CHAMPIONS = [
  'Steinitz', 'Lasker', 'Capablanca', 'Alekhine', 'Euwe', 'Botvinnik',
  'Smyslov', 'Tal', 'Petrosian', 'Spassky', 'Fischer', 'Karpov',
  'Kasparov', 'Kramnik', 'Anand', 'Carlsen', 'Ding', 'Gukesh',
  'Khalifman', 'Ponomariov', 'Kasimdzhanov', 'Topalov',
]

/** Never champions, but present at the top for decades — without them the
 *  tournament fields have holes where their games should be. */
const ELITE = [
  'Korchnoi', 'Keres', 'Bronstein', 'Larsen', 'Reshevsky', 'Geller',
  'Polugaevsky', 'Portisch', 'Timman', 'Ivanchuk', 'Shirov', 'Gelfand',
  'Leko', 'Svidler', 'Grischuk', 'Aronian', 'Nakamura', 'Caruana',
  'Nepomniachtchi', 'Giri', 'So', 'Firouzja', 'Rubinstein', 'Nimzowitsch',
]

async function fetchPlayer(name) {
  const response = await fetch(`${BASE_URL}/${name}.zip`)
  if (!response.ok) return null

  const buffer = Buffer.from(await response.arrayBuffer())
  const entry = readZipEntries(buffer).find((file) => file.name.endsWith('.pgn'))
  return entry === null || entry === undefined ? null : entry.read().toString('utf8')
}

async function collect(label, names, file) {
  const target = join(rawDir, file)
  if (process.env.FORCE !== '1' && existsSync(target) && statSync(target).size > 0) {
    process.stdout.write(
      `${label}: already present (${(statSync(target).size / 1_048_576).toFixed(1)} MB). FORCE=1 to refresh.\n`,
    )
    return
  }

  process.stdout.write(`${label}\n`)
  const parts = []
  const missing = []

  for (const name of names) {
    const text = await fetchPlayer(name)
    if (text === null) {
      missing.push(name)
      continue
    }
    parts.push(text.trim())
    process.stdout.write(`  ${name}\n`)
  }

  const merged = `${parts.join('\n\n')}\n`
  await mkdir(rawDir, { recursive: true })
  await writeFile(target, merged, 'utf8')

  const games = (merged.match(/^\[Event /gm) ?? []).length
  process.stdout.write(
    `  -> ${games.toLocaleString()} games, ${(merged.length / 1_048_576).toFixed(1)} MB\n`,
  )
  if (missing.length > 0) process.stdout.write(`  not found: ${missing.join(', ')}\n`)
}

async function main() {
  await collect('World champions', CHAMPIONS, 'careers-champions.pgn')
  await collect('Elite players', ELITE, 'careers-elite.pgn')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
