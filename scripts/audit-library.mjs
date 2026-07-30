/**
 * Independent check of the built library: every game replayed, and duplicates
 * looked for by a different method than the builder uses. Run after a refetch.
 *
 *   npm run audit-library              # public/games/, or library/ if present
 *   npm run audit-library -- some/dir
 *   WORKERS=4 npm run audit-library    # cap the replay pool
 *
 * Audits public/games/ by default, because those collections are committed and
 * therefore always present. library/ is preferred when it exists, since it also
 * holds the optional collections — but it is generated, and build-library skips
 * itself once the served files exist, so a fresh clone has none of it. Reaching
 * for library/ unconditionally is what made this script crash with a readdir
 * stack trace instead of saying anything useful.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { Chess } from 'chess.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const splitGames = (text) =>
  text.split(/(?=\[Event )/).filter((game) => game.trim() !== '')

const tag = (game, name) => {
  const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)
  return match ? match[1] : ''
}

/* ------------------------------------------------------------------ worker */

if (!isMainThread) {
  const { path, stride, offset } = workerData
  const games = splitGames(readFileSync(path, 'utf8'))

  let unplayable = 0
  let plies = 0
  let forfeits = 0

  for (let index = offset; index < games.length; index += stride) {
    const game = games[index]
    const board = new Chess()
    try {
      board.loadPgn(game, { strict: false })
      const played = board.history().length
      if (played > 0) {
        plies += played
        continue
      }
      // No moves is not automatically broken. A forfeited game is a real result
      // with nothing played in it — Kramnik's no-show in 2006 stands as 0-1 —
      // and the library carries one deliberately. Only an empty record with no
      // result is a fault.
      if (['1-0', '0-1'].includes(tag(game, 'Result'))) forfeits += 1
      else unplayable += 1
    } catch {
      unplayable += 1
    }
  }

  parentPort.postMessage({ unplayable, plies, forfeits })
} else {
  /* -------------------------------------------------------------- main */

  const POOL = Math.max(1, Number(process.env.WORKERS) || Math.max(1, availableParallelism() - 1))

  /** library/ when it has been built, else the committed collections. */
  function resolveTarget() {
    const requested = process.argv[2]
    if (requested !== undefined) return requested

    const built = join(projectRoot, 'library')
    if (existsSync(built) && readdirSync(built).some((name) => name.endsWith('.pgn'))) {
      return built
    }
    return join(projectRoot, 'public', 'games')
  }

  const target = resolveTarget()

  if (!existsSync(target)) {
    console.error(`Nothing to audit: ${target} does not exist.`)
    console.error('Run "npm run prepare-assets" to fetch and build the collections.')
    process.exit(1)
  }

  const auditingOneFile = statSync(target).isFile()
  const base = auditingOneFile ? dirname(target) : target
  const files = auditingOneFile
    ? [basename(target)]
    : readdirSync(target).filter((name) => name.endsWith('.pgn'))

  if (files.length === 0) {
    console.error(`No .pgn files in ${target}.`)
    console.error('Run "npm run prepare-assets" to fetch and build the collections.')
    process.exit(1)
  }

  /**
   * Fans one file's replay across the pool.
   *
   * Replaying is nearly all of the cost, and the optional career collection runs
   * to a hundred thousand games — serially that is long enough that this script
   * simply never finished, which is a check nobody runs. Each game is
   * independent and only counters come back, so it parallelises cleanly.
   */
  const replay = (path, gameCount) => {
    const stride = Math.min(POOL, Math.max(1, gameCount))
    return Promise.all(
      Array.from({ length: stride }, (_unused, offset) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { path, stride, offset },
          })
          worker.once('message', resolve)
          worker.once('error', reject)
        }),
      ),
    ).then((parts) =>
      parts.reduce(
        (total, part) => ({
          unplayable: total.unplayable + part.unplayable,
          plies: total.plies + part.plies,
          forfeits: total.forfeits + part.forfeits,
        }),
        { unplayable: 0, plies: 0, forfeits: 0 },
      ),
    )
  }

  const all = []
  let unplayable = 0
  let plies = 0
  let forfeits = 0

  for (const file of files) {
    const path = join(base, file)
    const games = splitGames(readFileSync(path, 'utf8'))
    for (const game of games) all.push({ game, file })

    process.stderr.write(`  replaying ${file} (${games.length.toLocaleString()})…\n`)
    const result = await replay(path, games.length)
    unplayable += result.unplayable
    plies += result.plies
    forfeits += result.forfeits
  }

  const person = (game, name) => tag(game, name).toLowerCase().replace(/[^a-z]/g, '')
  const moves = (game) =>
    game
      .replace(/^\s*\[.*\]\s*$/gm, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()

  console.log(`\naudited ${target}`)
  console.log(`files ${files.length}, games ${all.length.toLocaleString()}`)
  console.log(`unplayable            : ${unplayable}`)
  console.log(`forfeits (no moves)   : ${forfeits}`)
  console.log(`half-moves replayed   : ${plies.toLocaleString()}`)

  const seen = new Map()
  let exact = 0
  for (const { game, file } of all) {
    const key = `${person(game, 'White')}|${person(game, 'Black')}|${moves(game)}`
    if (seen.has(key)) {
      exact += 1
      if (exact <= 2) console.log(`  identical: ${file} vs ${seen.get(key)}`)
    } else seen.set(key, file)
  }
  console.log(`identical duplicates  : ${exact}`)

  const groups = new Map()
  for (const { game } of all) {
    const key = `${person(game, 'White')}|${person(game, 'Black')}|${tag(game, 'Date').slice(0, 4)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(moves(game))
  }

  let prefix = 0
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => b.length - a.length)
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        // An empty move list is a prefix of everything, so a forfeit would read
        // as a truncated copy of every game by the same players that year.
        if (sorted[j] === '') continue
        if (sorted[i].startsWith(sorted[j])) prefix += 1
      }
    }
  }
  console.log(`truncated duplicates  : ${prefix}`)

  const nicknames = all.filter(({ game }) => tag(game, 'Nickname') !== '').length
  console.log(`named famous games    : ${nicknames}`)
}
