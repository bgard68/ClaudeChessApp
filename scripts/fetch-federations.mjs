/**
 * Builds public/games/player-federations.json from FIDE's rating list.
 *
 * PGN carries no nationality, so federations were previously a hand-kept list
 * of about 140 players. FIDE publishes federation, title and rating for every
 * registered player; this intersects that list with the players who actually
 * appear in the library, so the file shipped to the browser stays small.
 *
 * A player is only recorded when the match is unambiguous. Surname plus initial
 * is not unique across half a million people, and labelling the wrong Smith
 * with a flag is worse than showing none.
 *
 * Run with `npm run fetch-federations`.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZipEntries } from './lib/unzip.mjs'

const LIST_URL = 'https://ratings.fide.com/download/standard_rating_list.zip'
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const libraryDir = join(projectRoot, 'library')
const targetFile = join(projectRoot, 'public', 'games', 'player-federations.json')

/** Surname plus first initial — the same rule the app's player index uses. */
function identityKey(name) {
  const cleaned = name.toLowerCase().replace(/[^a-z, ]/g, ' ')
  const [surnamePart = '', restPart = ''] = cleaned.split(',')
  const surname = surnamePart.trim().replace(/\s+/g, ' ')
  const initial = restPart.trim().charAt(0)
  return initial === '' ? surname : `${surname} ${initial}`
}

/** Full name, punctuation and spacing normalised — a far stronger match. */
function fullKey(name) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

const MIN_FORENAME = 3

/** Points between our games and FIDE beyond which it must be someone else. */
const RATING_TOLERANCE = 400

/**
 * Whether a name carries a real forename rather than an initial.
 *
 * Matching on surname plus initial was tried and produced confidently wrong
 * data: "Anand,V" found a 1494-rated namesake, "Kasparov,G" a 1644, and
 * "Botvinnik,M" a living Israeli player rather than the Soviet champion who
 * died in 1995. Across 559,305 registered players a surname and one letter
 * identifies nobody, so only full forenames are trusted.
 */
function hasForename(name) {
  const forename = (name.split(',')[1] ?? '').trim().replace(/[^A-Za-z]/g, '')
  return forename.length >= MIN_FORENAME
}

/**
 * Every player in the library, with the best rating their own games record.
 *
 * That rating is the check on a name match: an exact namesake exists for
 * "Kasparov, Gary", rated 1644, and only the games themselves say the Kasparov
 * we mean was 2800.
 */
async function playersInLibrary() {
  const peak = new Map()
  const files = existsSync(libraryDir)
    ? (await readdir(libraryDir)).filter((f) => f.endsWith('.pgn'))
    : []

  for (const file of files) {
    const text = await readFile(join(libraryDir, file), 'utf8')
    for (const game of text.split(/(?=\[Event )/)) {
      for (const colour of ['White', 'Black']) {
        const name = new RegExp(`^\\[${colour} "([^"]*)"\\]`, 'm').exec(game)?.[1]
        if (!name) continue
        const elo = Number.parseInt(
          new RegExp(`^\\[${colour}Elo "(\\d+)"\\]`, 'm').exec(game)?.[1] ?? '',
          10,
        )
        const best = peak.get(name) ?? null
        peak.set(name, Number.isFinite(elo) ? Math.max(best ?? 0, elo) : best)
      }
    }
  }
  return peak
}

function columnsOf(header) {
  const at = (label) => header.indexOf(label)
  return {
    name: [at('Name'), at('Fed')],
    fed: [at('Fed'), at('Sex')],
    title: [at('Tit'), at('WTit')],
    rating: [at('FOA') + 4, at('Gms')],
  }
}

async function main() {
  if (process.env.FORCE !== '1' && existsSync(targetFile) && statSync(targetFile).size > 0) {
    console.log('Federations already present. FORCE=1 to refresh.')
    return
  }

  const ourNames = await playersInLibrary()
  if (ourNames.size === 0) {
    console.error('No library found. Run "npm run build-library" first.')
    process.exit(1)
  }
  console.log(`${ourNames.size.toLocaleString()} players in the library`)

  const wantedByKey = new Map()
  const wantedByFull = new Map()
  const peakByKey = new Map()
  for (const [name, elo] of ourNames) {
    const key = identityKey(name)
    if (!wantedByKey.has(key)) wantedByKey.set(key, [])
    wantedByKey.get(key).push(name)
    wantedByFull.set(fullKey(name), key)
    if (elo !== null) peakByKey.set(key, Math.max(peakByKey.get(key) ?? 0, elo))
  }

  console.log('downloading FIDE rating list…')
  const response = await fetch(LIST_URL)
  if (!response.ok) throw new Error(`FIDE list -> ${response.status}`)
  const entry = readZipEntries(Buffer.from(await response.arrayBuffer())).find((e) =>
    e.name.endsWith('.txt'),
  )
  if (entry === undefined) throw new Error('no .txt in the FIDE archive')

  const lines = entry.read().toString('utf8').split(/\r?\n/)
  const cols = columnsOf(lines[0] ?? '')
  const slice = (line, [from, to]) => line.slice(from, to).trim()

  // Collect every FIDE player whose key we might want, so ambiguity is visible.
  const byKey = new Map()
  const byFull = new Map()

  for (const line of lines.slice(1)) {
    if (line.length < cols.fed[1]) continue
    const name = slice(line, cols.name)
    if (name === '') continue

    const key = identityKey(name)
    if (!wantedByKey.has(key) && !wantedByFull.has(fullKey(name))) continue

    const record = {
      fed: slice(line, cols.fed),
      title: slice(line, cols.title),
      elo: Number.parseInt(slice(line, cols.rating), 10) || null,
    }
    if (record.fed === '') continue

    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(record)
    byFull.set(fullKey(name), record)
  }

  const federations = {}
  let matched = 0
  let noForename = 0
  let notFound = 0
  let mismatched = 0

  for (const [key, names] of wantedByKey) {
    /*
     * Only an exact full-name match, and only where both sides spell a real
     * forename. One identity may hold several spellings — "Anand,V" and
     * "Anand, Viswanathan" — so it is enough that any one of them matches:
     * the abbreviation inherits the federation the full name established.
     */
    const usable = names.filter(hasForename)
    if (usable.length === 0) {
      noForename += 1
      continue
    }

    const found = usable.map((name) => byFull.get(fullKey(name))).find(Boolean)
    if (found === undefined) {
      notFound += 1
      continue
    }

    // A namesake rated hundreds of points apart is a different person.
    const ourPeak = peakByKey.get(key)
    if (
      ourPeak !== undefined &&
      found.elo !== null &&
      Math.abs(ourPeak - found.elo) > RATING_TOLERANCE
    ) {
      mismatched += 1
      continue
    }

    federations[key] = found
    matched += 1
  }

  await mkdir(dirname(targetFile), { recursive: true })
  const json = JSON.stringify(federations)
  await writeFile(targetFile, json, 'utf8')

  console.log(`\nmatched  ${matched.toLocaleString()} of ${wantedByKey.size.toLocaleString()} identities`)
  console.log(`  skipped, only an initial to go on : ${noForename.toLocaleString()}`)
  console.log(`  skipped, not in the FIDE list     : ${notFound.toLocaleString()}`)
  console.log(`  skipped, rating says another person: ${mismatched.toLocaleString()}`)
  console.log(`\nwrote ${(json.length / 1024).toFixed(0)} KB to public/games/player-federations.json`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
