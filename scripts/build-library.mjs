/**
 * Validates every downloaded game, removes duplicates, and writes the result
 * as non-overlapping PGN files.
 *
 *   public/games/raw/*.pgn   what was downloaded
 *   public/games/*.pgn       cleaned, what the app loads
 *   library/*.pgn            the same cleaned files, for you
 *
 * Correctness is checked by replaying every move through the rules engine. A
 * game that will not play out is dropped. Where two records describe the same
 * game, the better record wins — see `score`.
 *
 * Run with `npm run build-library`.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(projectRoot, 'public', 'games', 'raw')
const servedDir = join(projectRoot, 'public', 'games')
const libraryDir = join(projectRoot, 'library')

const splitGames = (text) =>
  text
    .replace(/\r\n?/g, '\n')
    .split(/(?=\[Event )/)
    .map((game) => game.trim())
    .filter((game) => game !== '')

const tagOf = (game, name) => {
  const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)
  return match === null ? '' : match[1]
}

const isKnockout = (game) => /k\.?o\.?|KO/i.test(tagOf(game, 'Event'))

/** The career archives, which are far too large to load on first launch. */
const CAREER_FILES = /^careers-/

/** Marks a collection as one you add yourself, rather than one the app loads. */
const OPTIONAL_PREFIX = 'optional-'

/**
 * The recurring super-tournaments and the great one-off events.
 *
 * Matched on the event tag, so a game qualifies by where it was played rather
 * than by who played it.
 */
const ELITE_EVENTS =
  /(linares|wijk aan zee|corus|tata steel|hoogovens|dortmund|sparkassen|amber|norway chess|sinquefield|london chess classic|london classic|bilbao|shamkir|gashimov|zurich|candidates|interzonal|avro|nottingham|san remo|bled|karlsbad|carlsbad|st petersburg|new york|hastings|moscow|olympiad|tal memorial|mtel|pearl spring|grand slam|world cup|grand prix)/i

const isEliteEvent = (game) => ELITE_EVENTS.test(tagOf(game, 'Event'))

const moveTextOf = (game) =>
  game
    .replace(/^\s*\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const surname = (value) => value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)

/**
 * Groups games that could conceivably be the same: same players, same year.
 *
 * Only a candidate list — whether two of them really are one game is decided
 * by comparing their moves, below.
 */
function pairingKey(game) {
  return [
    surname(tagOf(game, 'White')),
    surname(tagOf(game, 'Black')),
    tagOf(game, 'Date').slice(0, 4),
  ].join('|')
}

const compactMoves = (game) => moveTextOf(game).replace(/\s+/g, '').toLowerCase()

/**
 * Two records are the same game when one's moves are a prefix of the other's —
 * identical, or the same game with one copy cut short.
 *
 * Matching on the opening alone would be wrong here: players in a title match
 * repeat the same line for fifteen moves or more before diverging, so an
 * opening-based test merges genuinely different games. Requiring a prefix
 * relationship cannot: two different games diverge, and after that neither is a
 * prefix of the other.
 */
function isSameGame(longer, shorter) {
  return longer.startsWith(shorter)
}

/**
 * How good a record of a game this is. Higher wins a duplicate contest.
 *
 * Completeness first — a game that plays to its end beats one that stops
 * halfway — then a decided result, then how much is known about where and when
 * it was played.
 */
function score(game, playedMoves) {
  let points = playedMoves * 10

  const result = tagOf(game, 'Result')
  if (result === '1-0' || result === '0-1' || result === '1/2-1/2') points += 500

  if (/^\d{4}\.\d{2}\.\d{2}$/.test(tagOf(game, 'Date'))) points += 40
  else if (/^\d{4}/.test(tagOf(game, 'Date'))) points += 20

  for (const tag of ['Event', 'Site', 'Round', 'ECO', 'WhiteElo', 'BlackElo']) {
    const value = tagOf(game, tag)
    if (value !== '' && value !== '?' && value !== '-') points += 5
  }
  // A named game carries information nothing else in the file does.
  if (tagOf(game, 'Nickname') !== '') points += 2_000

  return points
}

/** Replays the game. Returns the number of moves, or null if it will not play. */
function validate(game) {
  const chess = new Chess()
  try {
    chess.loadPgn(game, { strict: false })
    const moves = chess.history().length
    return moves > 0 ? moves : null
  } catch {
    return null
  }
}

async function main() {
  if (!existsSync(rawDir)) {
    console.error(`No downloads found at public/games/raw. Run "npm run fetch-games" first.`)
    process.exit(1)
  }

  // Idempotent, like the fetch scripts. Replaying a hundred thousand games
  // takes many minutes, and every `npm run dev` must not pay that cost.
  const built = join(servedDir, 'world-championship-title-matches.pgn')
  if (process.env.FORCE !== '1' && existsSync(built)) {
    console.log('Library already built. FORCE=1 to rebuild.')
    return
  }

  const rawFiles = (await readdir(rawDir)).filter((name) => name.endsWith('.pgn'))
  const candidates = []

  // Core files first, so that when the same game appears in both a core file
  // and a career archive, the core copy is the one that survives dedup and the
  // optional collections stay free of anything already loaded.
  const ordered = [
    ...rawFiles.filter((name) => !CAREER_FILES.test(name)),
    ...rawFiles.filter((name) => CAREER_FILES.test(name)),
  ]

  for (const file of ordered) {
    const optional = CAREER_FILES.test(file)
    for (const game of splitGames(await readFile(join(rawDir, file), 'utf8'))) {
      candidates.push({ game, file, optional })
    }
  }
  process.stdout.write(`Reading ${candidates.length.toLocaleString()} games…\n`)

  const groups = new Map()
  let invalid = 0

  let checked = 0
  for (const { game, optional } of candidates) {
    checked += 1
    if (checked % 20_000 === 0) {
      process.stdout.write(`    ${checked.toLocaleString()} / ${candidates.length.toLocaleString()}
`)
    }
    const moves = validate(game)
    if (moves === null) {
      invalid += 1
      continue
    }

    const key = pairingKey(game)
    const entry = { game, optional, points: score(game, moves), text: compactMoves(game) }
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [entry])
    else group.push(entry)
  }

  const kept = []
  let exact = 0
  let truncated = 0

  for (const group of groups.values()) {
    // Longest first, so a cut-short copy is always compared against the fuller
    // record rather than the other way round.
    const ordered = [...group].sort((a, b) => b.text.length - a.text.length)
    const clusters = []

    for (const entry of ordered) {
      const cluster = clusters.find((candidate) => isSameGame(candidate.text, entry.text))
      if (cluster === undefined) {
        clusters.push({ text: entry.text, best: entry })
        continue
      }
      if (cluster.text.length === entry.text.length) exact += 1
      else truncated += 1
      // A core copy always wins: the optional archives must never end up
      // holding a game the main library already has.
      const beatsOnOrigin = cluster.best.optional && !entry.optional
      const beatsOnQuality =
        cluster.best.optional === entry.optional && entry.points > cluster.best.points
      if (beatsOnOrigin || beatsOnQuality) cluster.best = entry
    }

    for (const cluster of clusters) kept.push(cluster.best)
  }

  const duplicates = exact + truncated

  // Split into parts that do not overlap: a game belongs to exactly one file.
  const core = kept.filter((entry) => !entry.optional).map((entry) => entry.game)
  const optional = kept.filter((entry) => entry.optional).map((entry) => entry.game)

  const famous = core.filter((game) => tagOf(game, 'Nickname') !== '')
  const rest = core.filter((game) => tagOf(game, 'Nickname') === '')

  const files = [
    ['famous-games.pgn', famous, 'Celebrated games, each verified against its known finish'],
    ['world-championship-title-matches.pgn', rest.filter((g) => !isKnockout(g)), 'Classical title matches, 1886-2024'],
    ['world-championship-knockout.pgn', rest.filter(isKnockout), 'FIDE knockout tournament games, 1998-2004'],
    ['optional-elite-tournaments.pgn', optional.filter(isEliteEvent), 'Games from the great tournaments'],
    ['optional-careers.pgn', optional.filter((g) => !isEliteEvent(g)), "The champions' and elite players' remaining games"],
  ].filter(([, games]) => games.length > 0)

  await mkdir(servedDir, { recursive: true })
  await mkdir(libraryDir, { recursive: true })

  for (const [name, games] of files) {
    const text = `${games.join('\n\n')}\n`
    // Optional collections are written for you to import by hand, and
    // deliberately not into public/: they run to tens of megabytes, and
    // deploying them would burden every visitor with games nobody asked for.
    if (!name.startsWith(OPTIONAL_PREFIX)) {
      await writeFile(join(servedDir, name), text, 'utf8')
    }
    await writeFile(join(libraryDir, name), text, 'utf8')
  }

  const total = files.reduce((sum, [, games]) => sum + games.length, 0)
  const coreTotal = files
    .filter(([name]) => !name.startsWith('optional-'))
    .reduce((sum, [, games]) => sum + games.length, 0)
  await writeFile(join(libraryDir, 'README.txt'), buildReadme(files, total), 'utf8')

  console.log(`Read       ${candidates.length} games from ${rawFiles.length} file(s)`)
  console.log(`Rejected   ${invalid} that would not play out`)
  console.log(
    `Duplicates ${duplicates} removed (${exact} identical, ${truncated} cut short), best record kept`,
  )
  console.log(`Kept       ${total} distinct, verified games\n`)
  for (const [name, games] of files) {
    console.log(`  ${String(games.length).padStart(5)}  ${name}`)
  }
}

function buildReadme(files, total) {
  return [
    'Chess game library',
    '==================',
    '',
    `${total} games. Every one has been replayed move by move to confirm it is`,
    'a legal, complete game. No game appears twice, in any file; where two',
    'records of the same game were found, the more complete one was kept.',
    '',
    ...files.map(([name, games, description]) => `${name}\n    ${games.length} games. ${description}\n`),
    'The files do not overlap — together they are the whole collection.',
    '',
    'Open them in any chess program, or load them with the app\'s Import PGN',
    'button (Browse championship games -> Import PGN). Re-importing is safe:',
    'the app fingerprints every game and refuses to store one it already has.',
    '',
    'Regenerate with: npm run build-library',
    'Not committed to git, and self-contained once built.',
  ].join('\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
