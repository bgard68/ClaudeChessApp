/**
 * Collapses a directory of PGN collections into one file holding each game once.
 *
 * The archive's collections overlap heavily by construction, and two of them
 * repeat games inside themselves: the career files are per-player collections
 * concatenated, so a game between two listed players arrives twice. Neither is a
 * conflict — a shared identity means the same players and the same moves — but
 * it does mean the archive states the same game up to three times.
 *
 *   npm run dedupe-pgn                 # reads pgn/, writes pgn/all-games.pgn
 *   npm run dedupe-pgn -- src out.pgn
 *
 * First occurrence wins, and files are read in a fixed order so the output is
 * reproducible. Provenance is recorded in a [Source] tag rather than discarded,
 * so a game can still be traced back to the collection it came from.
 *
 * Identity matches src/infrastructure/archive/gameKey.ts and audit-pgn-archive.mjs.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { gameIdentity as identity, tagOf as tag } from './lib/gameKey.mjs'

const DIR = process.argv[2] ?? 'pgn'
const OUT = process.argv[3] ?? join(DIR, 'all-games.pgn')

if (!existsSync(DIR)) {
  console.error(`No such directory: ${DIR}`)
  process.exit(1)
}

/**
 * Processed collections before the raw sources they were derived from, so the
 * copy that survives is the one the app itself serves — the raw files exist to
 * rebuild from, not to be preferred.
 */
const PREFERRED_ORDER = [
  'famous-games.pgn',
  'world-championship-title-matches.pgn',
  'world-championship-knockout.pgn',
  'modern-championships.pgn',
  'careers-champions.pgn',
  'careers-elite.pgn',
]

const present = readdirSync(DIR)
  .filter((name) => name.endsWith('.pgn') && name !== basename(OUT))
  .sort()

const ordered = [
  ...PREFERRED_ORDER.filter((name) => present.includes(name)),
  ...present.filter((name) => !PREFERRED_ORDER.includes(name)),
]

const seen = new Set()
const kept = []
const stats = []

for (const file of ordered) {
  const games = readFileSync(join(DIR, file), 'utf8')
    .split(/(?=\[Event )/)
    .filter((game) => game.trim() !== '')

  let added = 0
  let skipped = 0

  for (const game of games) {
    const key = identity(game)
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)

    // Provenance, without disturbing the move text: appended to the tag block.
    const trimmed = game.trimEnd()
    const lastTag = trimmed.lastIndexOf(']')
    const withSource =
      lastTag === -1
        ? `[Source "${file}"]\n${trimmed}`
        : `${trimmed.slice(0, lastTag + 1)}\n[Source "${file}"]${trimmed.slice(lastTag + 1)}`

    kept.push(withSource)
    added += 1
  }

  stats.push({ file, games: games.length, added, skipped })
  process.stderr.write(`  ${file}: kept ${added}, dropped ${skipped}\n`)
}

writeFileSync(OUT, `${kept.join('\n\n')}\n`, 'utf8')

const total = stats.reduce((n, r) => n + r.games, 0)
const dropped = stats.reduce((n, r) => n + r.skipped, 0)

console.log('')
console.log(`DEDUPLICATED ${DIR} -> ${OUT}`)
console.log('='.repeat(72))
console.log('source'.padEnd(40) + 'read'.padStart(9) + 'kept'.padStart(9) + 'dropped'.padStart(9))
console.log('-'.repeat(72))
for (const row of stats) {
  console.log(
    row.file.padEnd(40) + String(row.games).padStart(9) +
    String(row.added).padStart(9) + String(row.skipped).padStart(9),
  )
}
console.log('-'.repeat(72))
console.log(
  'TOTAL'.padEnd(40) + String(total).padStart(9) +
  String(kept.length).padStart(9) + String(dropped).padStart(9),
)
console.log('')
console.log(`distinct games written : ${kept.length.toLocaleString()}`)
console.log(`duplicates removed    : ${dropped.toLocaleString()}`)
