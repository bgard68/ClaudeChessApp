/**
 * Builds public/games/famous-games.pgn from a curated list of celebrated games.
 *
 * pgnmentor.com publishes per-player collections but no "famous games" file, so
 * each game is located by its players and year inside the relevant player's
 * archive. Games that cannot be found are reported and skipped — a named game
 * pointing at the wrong moves would be worse than a missing one.
 *
 * Run with `npm run fetch-famous`. Output is gitignored.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZipEntries } from './lib/unzip.mjs'

const BASE_URL = 'https://www.pgnmentor.com/players'
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetFile = join(projectRoot, 'public', 'games', 'raw', 'famous-games.pgn')

/**
 * `from` names the pgnmentor collection to search. `opening` disambiguates when
 * the same pair met more than once in a year.
 */
const FAMOUS_GAMES = [
  { nickname: 'The Immortal Game', result: '1-0', white: 'Anderssen', black: 'Kieseritzky', year: 1851, from: 'Anderssen', opening: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+' },
  { nickname: 'The Evergreen Game', result: '1-0', white: 'Anderssen', black: 'Dufresne', year: 1852, from: 'Anderssen', opening: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4' },
  { nickname: 'The Opera Game', result: '1-0', white: 'Morphy', black: 'Isouard', year: 1858, from: 'Morphy', opening: '1. e4 e5 2. Nf3 d6 3. d4 Bg4' },
  { nickname: 'Zukertort – Blackburne', result: '1-0', white: 'Zukertort', black: 'Blackburne', year: 1883, from: 'Blackburne' },
  { nickname: "Lasker's Double Bishop Sacrifice", result: '1-0', white: 'Lasker', black: 'Bauer', year: 1889, from: 'Lasker' },
  { nickname: "Steinitz's King Hunt", result: '1-0', white: 'Steinitz', black: 'Bardeleben', year: 1895, from: 'Steinitz' },
  { nickname: 'Pillsbury – Lasker, St Petersburg', result: '0-1', white: 'Pillsbury', black: 'Lasker', year: 1896, from: 'Pillsbury' },
  { nickname: "Rubinstein's Immortal", result: '0-1', white: 'Rotlewi', black: 'Rubinstein', year: 1907, from: 'Rubinstein', opening: '1.d4 d5 2.Nf3 e6 3.e3 c5 4.c4 Nc6 5.Nc3 Nf6 6.dxc5 Bxc5 7.a3' },
  { nickname: 'The Gold Coins Game', result: '0-1', white: 'Levitsky', black: 'Marshall', year: 1912, from: 'Marshall' },
  { nickname: 'Lasker – Capablanca, St Petersburg', result: '1-0', white: 'Lasker', black: 'Capablanca', year: 1914, from: 'Lasker' },
  { nickname: 'The Marshall Attack', result: '1-0', white: 'Capablanca', black: 'Marshall', year: 1918, from: 'Capablanca' },
  { nickname: 'Bogoljubov – Alekhine, Hastings', result: '0-1', white: 'Bogoljubov', black: 'Alekhine', year: 1922, from: 'Alekhine' },
  { nickname: 'The Immortal Zugzwang Game', result: '0-1', white: 'Samisch', black: 'Nimzowitsch', year: 1923, from: 'Nimzowitsch' },
  { nickname: 'Réti – Bogoljubov, New York', result: '1-0', white: 'Reti', black: 'Bogoljubov', year: 1924, from: 'Reti' },
  { nickname: 'Botvinnik – Capablanca, AVRO', result: '1-0', white: 'Botvinnik', black: 'Capablanca', year: 1938, from: 'Botvinnik' },
  { nickname: 'Averbakh – Kotov, Zurich', result: '0-1', white: 'Averbakh', black: 'Kotov', year: 1953, from: 'Kotov' },
  { nickname: 'Geller – Euwe, Zurich', result: '0-1', white: 'Geller', black: 'Euwe', year: 1953, from: 'Euwe' },
  { nickname: 'The Game of the Century', result: '0-1', white: 'Byrne', black: 'Fischer', year: 1956, from: 'Fischer' },
  { nickname: 'Polugaevsky – Nezhmetdinov', result: '0-1', white: 'Polugaevsky', black: 'Nezhmetdinov', year: 1958, from: 'Polugaevsky' },
  { nickname: 'Spassky – Bronstein', result: '1-0', white: 'Spassky', black: 'Bronstein', year: 1960, from: 'Spassky' },
  { nickname: 'Fischer – Benko', result: '1-0', white: 'Fischer', black: 'Benko', year: 1963, from: 'Fischer' },
  { nickname: 'Tal – Larsen', result: '1-0', white: 'Tal', black: 'Larsen', year: 1965, from: 'Tal' },
  { nickname: 'Fischer – Myagmarsuren', result: '1-0', white: 'Fischer', black: 'Myagmarsuren', year: 1967, from: 'Fischer' },
  { nickname: 'Larsen – Spassky', result: '0-1', white: 'Larsen', black: 'Spassky', year: 1970, from: 'Spassky', opening: '1.b3 e5 2.Bb2 Nc6 3.c4 Nf6 4.Nf3 e4' },
  { nickname: 'Bronstein – Ljubojevic', result: '1-0', white: 'Bronstein', black: 'Ljubojevic', year: 1973, from: 'Bronstein' },
  { nickname: "Short's King Walk", result: '1-0', white: 'Short', black: 'Timman', year: 1991, from: 'Short' },
  { nickname: 'Ivanchuk – Yusupov', result: '0-1', white: 'Ivanchuk', black: 'Yusupov', year: 1991, from: 'Ivanchuk' },
  { nickname: 'Karpov – Topalov, Linares', result: '1-0', white: 'Karpov', black: 'Topalov', year: 1994, from: 'Karpov' },
  { nickname: 'Topalov – Shirov', result: '0-1', white: 'Topalov', black: 'Shirov', year: 1998, from: 'Shirov' },
  { nickname: "Kasparov's Immortal", result: '1-0', white: 'Kasparov', black: 'Topalov', year: 1999, from: 'Kasparov' },
]

async function main() {
  if (process.env.FORCE !== '1' && existsSync(targetFile) && statSync(targetFile).size > 0) {
    process.stdout.write('Famous games already present. FORCE=1 to refresh.\n')
    return
  }

  const collections = new Map()
  for (const name of new Set(FAMOUS_GAMES.map((game) => game.from))) {
    process.stdout.write(`  fetching ${name}\n`)
    collections.set(name, await fetchCollection(name))
  }

  const found = []
  const missing = []
  const ambiguous = []

  for (const wanted of FAMOUS_GAMES) {
    const games = collections.get(wanted.from) ?? []
    const candidates = games.filter((game) => matches(game, wanted))

    if (candidates.length === 0) {
      missing.push(wanted.nickname)
      continue
    }

    const chosen = pickBest(candidates, wanted)
    if (chosen === null) {
      ambiguous.push(`${wanted.nickname} (${candidates.length} candidates)`)
      continue
    }
    found.push(withNickname(chosen, wanted.nickname))
  }

  await mkdir(dirname(targetFile), { recursive: true })
  await writeFile(targetFile, `${found.join('\n\n')}\n`, 'utf8')

  process.stdout.write(`\nWrote ${found.length} of ${FAMOUS_GAMES.length} games\n`)
  if (ambiguous.length > 0) process.stdout.write(`Several candidates: ${ambiguous.join(', ')}\n`)
  if (missing.length > 0) process.stdout.write(`Not found: ${missing.join(', ')}\n`)
}

async function fetchCollection(name) {
  const response = await fetch(`${BASE_URL}/${name}.zip`)
  if (!response.ok) throw new Error(`${name}.zip -> ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const entry = readZipEntries(buffer).find((candidate) => candidate.name.endsWith('.pgn'))
  if (entry === undefined) throw new Error(`${name}.zip contains no .pgn`)

  return entry
    .read()
    .toString('utf8')
    .split(/(?=\[Event )/)
    .filter((game) => game.trim() !== '')
}

const tagOf = (game, name) =>
  new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)?.[1] ?? ''

function matches(game, wanted) {
  return (
    tagOf(game, 'White').toLowerCase().includes(wanted.white.toLowerCase()) &&
    tagOf(game, 'Black').toLowerCase().includes(wanted.black.toLowerCase()) &&
    tagOf(game, 'Date').startsWith(String(wanted.year)) &&
    // The result is the strongest available filter: the same pair often met
    // several times in a year, and only one of those games is the famous one.
    (wanted.result === undefined || tagOf(game, 'Result') === wanted.result)
  )
}

/** These archives write "1.e4", not "1. e4", so all spacing is discarded. */
const compact = (text) => text.replace(/\s+/g, '')

const SHORTEST_REAL_GAME = 10

/**
 * Picks the intended game, or `null` if it cannot be established.
 *
 * Returning null matters more than it looks. These players met many times, and
 * the tie-breaks that seem reasonable — first match, longest game — each
 * silently attached a famous name to the wrong moves during development. A game
 * is only accepted when a single candidate survives, or when an opening hint
 * identifies one outright.
 */
function pickBest(candidates, wanted) {
  const real = candidates.filter((game) => lastMoveNumber(game) >= SHORTEST_REAL_GAME)
  const usable = real.length > 0 ? real : candidates

  if (wanted.opening !== undefined) {
    const byOpening = usable.find((game) =>
      compact(moveTextOf(game)).startsWith(compact(wanted.opening)),
    )
    if (byOpening !== undefined) return byOpening
  }

  return usable.length === 1 ? usable[0] : null
}

function moveTextOf(game) {
  return game.replace(/^\[.*\]$/gm, '').trim()
}

function lastMoveNumber(game) {
  let highest = 0
  for (const match of moveTextOf(game).matchAll(/(\d+)\s*\./g)) {
    const value = Number.parseInt(match[1], 10)
    if (value > highest) highest = value
  }
  return highest
}

function withNickname(game, nickname) {
  const trimmed = game.trim()
  return trimmed.replace(
    /^(\[Event "[^"]*"\])/m,
    `$1\n[Nickname "${nickname.replace(/"/g, "'")}"]`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
