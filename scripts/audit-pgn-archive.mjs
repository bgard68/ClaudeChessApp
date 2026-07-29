/**
 * Audits PGN collections for validity, duplication and overlap.
 *
 * Sibling to audit-library.mjs, which checks the three built collections in
 * library/. This one takes any directory or single file — written for the
 * consolidated archive in pgn/, which holds the raw downloads and the large
 * career files too, and where the interesting question is how much the
 * collections repeat one another.
 *
 *   npm run audit-pgn                     # audits pgn/
 *   npm run audit-pgn -- pgn/all-games.pgn
 *   REPLAY=0 npm run audit-pgn            # structural checks only, seconds
 *   WORKERS=4 npm run audit-pgn           # cap the replay pool
 *
 * Game identity matches src/infrastructure/archive/gameKey.ts: white, black and
 * the move text with tags, comments and NAGs stripped. Restated here rather than
 * imported because that module is TypeScript behind path aliases, and a script
 * that needs a build step to run is a script nobody runs.
 *
 * Replaying is the expensive half — every move of every game through chess.js,
 * which for the career collections is millions of them. It is also perfectly
 * parallel, since each game is independent and only counters come back, so it
 * runs across a worker pool. Workers read the file and take every Nth game
 * rather than being handed game text, because posting tens of megabytes of
 * strings between threads costs more than the parsing saved.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { availableParallelism } from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { Chess } from 'chess.js'

const splitGames = (text) => text.split(/(?=\[Event )/).filter((game) => game.trim() !== '')

/* ------------------------------------------------------------------ worker */

if (!isMainThread) {
  const { path, stride, offset } = workerData
  const games = splitGames(readFileSync(path, 'utf8'))

  let unplayable = 0
  let noMoves = 0
  let plies = 0
  /** A count alone cannot be acted on; keep a few offenders to name them. */
  const offenders = []
  const describe = (game, why) => {
    const of = (name) => {
      const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)
      return match ? match[1] : '?'
    }
    if (offenders.length < 5)
      offenders.push(`${why}: ${of('White')} vs ${of('Black')}, ${of('Event')} ${of('Date')}`)
  }

  for (let index = offset; index < games.length; index += stride) {
    const board = new Chess()
    try {
      board.loadPgn(games[index], { strict: false })
      const played = board.history().length
      if (played === 0) {
        noMoves += 1
        describe(games[index], 'no moves')
      } else plies += played
    } catch (error) {
      unplayable += 1
      describe(games[index], `unplayable (${error instanceof Error ? error.message.slice(0, 60) : 'error'})`)
    }
  }

  parentPort.postMessage({ unplayable, noMoves, plies, offenders })
} else {
  /* -------------------------------------------------------------- main */

  const TARGET = process.argv[2] ?? 'pgn'
  const REPLAY = process.env.REPLAY !== '0'
  const POOL = Math.max(1, Number(process.env.WORKERS) || Math.max(1, availableParallelism() - 1))

  /**
   * Prefix-duplicate detection has to hold every move list in memory to compare
   * them, which the 67 MB career file will not tolerate. Large files are left
   * out of that check alone — and named in the output, because a coverage gap
   * that goes unreported reads as a clean result.
   */
  const PREFIX_LIMIT_BYTES = (Number(process.env.PREFIX_LIMIT_MB) || 5) * 1024 * 1024

  if (!existsSync(TARGET)) {
    console.error(`No such path: ${TARGET}`)
    process.exit(1)
  }

  const tag = (game, name) => {
    const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(game)
    return match ? match[1] : ''
  }
  const person = (game, name) => tag(game, name).toLowerCase().replace(/[^a-z]/g, '')
  const moveText = (game) =>
    game
      .replace(/^\s*\[.*\]\s*$/gm, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\$\d+/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
  const identity = (game) =>
    `${person(game, 'White')}|${person(game, 'Black')}|${moveText(game)}`

  const oneFile = statSync(TARGET).isFile()
  const base = oneFile ? dirname(TARGET) : TARGET
  const files = oneFile
    ? [basename(TARGET)]
    : readdirSync(TARGET).filter((name) => name.endsWith('.pgn')).sort()

  if (files.length === 0) {
    console.error(`No .pgn files in ${TARGET}`)
    process.exit(1)
  }

  /** Fans one file's replay out across the pool and sums what comes back. */
  const replayInParallel = (path, gameCount) => {
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
    ).then((results) =>
      results.reduce(
        (total, part) => ({
          unplayable: total.unplayable + part.unplayable,
          noMoves: total.noMoves + part.noMoves,
          plies: total.plies + part.plies,
          offenders: [...total.offenders, ...part.offenders].slice(0, 10),
        }),
        { unplayable: 0, noMoves: 0, plies: 0, offenders: [] },
      ),
    )
  }

  const perFile = []
  /** identity -> the files holding it, which is what makes overlap visible. */
  const owners = new Map()
  const prefixGroups = new Map()
  const prefixSkipped = []

  for (const file of files) {
    const path = join(base, file)
    const bytes = statSync(path).size
    const games = splitGames(readFileSync(path, 'utf8'))

    const checkPrefixes = bytes <= PREFIX_LIMIT_BYTES
    if (!checkPrefixes) prefixSkipped.push(file)

    const local = new Set()
    let repeated = 0
    let untitled = 0

    for (const game of games) {
      if (tag(game, 'White') === '' || tag(game, 'Black') === '') untitled += 1

      const key = identity(game)
      if (local.has(key)) repeated += 1
      local.add(key)

      let holders = owners.get(key)
      if (holders === undefined) owners.set(key, (holders = new Set()))
      holders.add(file)

      if (checkPrefixes) {
        const pairing = `${person(game, 'White')}|${person(game, 'Black')}|${tag(game, 'Date').slice(0, 4)}`
        let list = prefixGroups.get(pairing)
        if (list === undefined) prefixGroups.set(pairing, (list = []))
        list.push(moveText(game))
      }
    }

    const replay = REPLAY
      ? await replayInParallel(path, games.length)
      : { unplayable: 0, noMoves: 0, plies: 0, offenders: [] }

    perFile.push({
      file,
      mb: (bytes / 1048576).toFixed(1),
      games: games.length,
      unique: local.size,
      repeated,
      bad: replay.unplayable + untitled,
      noMoves: replay.noMoves,
      plies: replay.plies,
      offenders: replay.offenders,
    })
    process.stderr.write(`  audited ${file}\n`)
  }

  /** One game a truncated copy of another by the same players in the same year. */
  let truncated = 0
  for (const list of prefixGroups.values()) {
    if (list.length < 2) continue
    const longestFirst = [...list].sort((a, b) => b.length - a.length)
    for (let i = 0; i < longestFirst.length; i += 1)
      for (let j = i + 1; j < longestFirst.length; j += 1)
        if (longestFirst[i] !== longestFirst[j] && longestFirst[i].startsWith(longestFirst[j]))
          truncated += 1
  }

  const overlap = new Map()
  for (const holders of owners.values()) {
    if (holders.size < 2) continue
    const named = [...holders].sort()
    for (let i = 0; i < named.length; i += 1)
      for (let j = i + 1; j < named.length; j += 1) {
        const pair = `${named[i]}  +  ${named[j]}`
        overlap.set(pair, (overlap.get(pair) ?? 0) + 1)
      }
  }

  const total = perFile.reduce((n, r) => n + r.games, 0)
  const plies = perFile.reduce((n, r) => n + r.plies, 0)
  const bad = perFile.reduce((n, r) => n + r.bad, 0)
  const noMoves = perFile.reduce((n, r) => n + r.noMoves, 0)
  const repeated = perFile.reduce((n, r) => n + r.repeated, 0)

  const report = []
  report.push(`PGN ARCHIVE AUDIT — ${TARGET}`)
  report.push('='.repeat(78))
  report.push(
    `replay validation: ${REPLAY ? `every game, chess.js across ${POOL} workers` : 'SKIPPED (REPLAY=0)'}`,
  )
  report.push('')
  report.push(
    'file'.padEnd(38) + 'MB'.padStart(6) + 'games'.padStart(8) +
    'unique'.padStart(8) + 'dup'.padStart(6) + 'bad'.padStart(6) + 'nomv'.padStart(6),
  )
  report.push('-'.repeat(78))
  for (const row of perFile) {
    report.push(
      row.file.padEnd(38) + String(row.mb).padStart(6) + String(row.games).padStart(8) +
      String(row.unique).padStart(8) + String(row.repeated).padStart(6) +
      String(row.bad).padStart(6) + String(row.noMoves).padStart(6),
    )
  }
  report.push('')
  report.push(`total games              : ${total.toLocaleString()}`)
  report.push(`distinct identities      : ${owners.size.toLocaleString()}`)
  report.push(`redundant copies         : ${(total - owners.size).toLocaleString()}`)
  report.push(`duplicated within a file : ${repeated.toLocaleString()}`)
  report.push(`half-moves replayed      : ${plies.toLocaleString()}`)
  report.push(`unplayable or untitled   : ${bad.toLocaleString()}`)
  report.push(`parsed but no moves      : ${noMoves.toLocaleString()}`)
  report.push(
    `truncated duplicates     : ${truncated.toLocaleString()}` +
      (prefixSkipped.length ? `   (not checked in ${prefixSkipped.join(', ')})` : ''),
  )
  const offenders = perFile.flatMap((r) => r.offenders.map((o) => `${r.file}  ${o}`))
  if (offenders.length > 0) {
    report.push('')
    report.push('GAMES THAT DID NOT REPLAY')
    for (const line of offenders) report.push(`  ${line}`)
  }

  report.push('')
  report.push('SHARED GAMES BETWEEN FILES')
  if (overlap.size === 0) report.push('  none — every collection is disjoint')
  for (const [pair, count] of [...overlap.entries()].sort((a, b) => b[1] - a[1]))
    report.push(`  ${String(count).padStart(7)}  ${pair}`)

  console.log(report.join('\n'))
}
