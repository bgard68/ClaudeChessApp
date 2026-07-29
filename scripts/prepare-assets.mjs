/**
 * Puts the app's assets in place before a dev start or a build.
 *
 * The engine is always copied, because public/engine/ is not committed and the
 * app cannot run without it. The game collections are a different matter: they
 * ARE committed, so the fetch-and-build chain only runs when they are missing.
 *
 * That distinction is the point of this script. Every individual fetch script is
 * already idempotent, but each one guards on its own download in
 * public/games/raw/ — which is ignored, so a fresh clone has none of them and
 * re-downloads roughly a hundred megabytes from two third-party hosts to
 * reconstruct files that were sitting in the repo the whole time. Guarding on
 * the finished collections instead means a clone, a dev start and a deploy need
 * no network at all.
 *
 *   npm run prepare-assets          # skips the chain if the collections exist
 *   FORCE=1 npm run prepare-assets  # refetch and rebuild regardless
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')
const servedDir = join(projectRoot, 'public', 'games')

/** What a usable library looks like. Any one missing means rebuild. */
const REQUIRED = [
  'famous-games.pgn',
  'world-championship-title-matches.pgn',
  'world-championship-knockout.pgn',
  'player-federations.json',
]

/** Ordered: each step consumes what the previous one produced. */
const DATA_CHAIN = [
  'fetch-games.mjs',
  'fetch-famous-games.mjs',
  'fetch-modern-championships.mjs',
  'build-library.mjs',
  'fetch-federations.mjs',
]

const run = (script) => {
  const result = spawnSync(process.execPath, [join(scriptsDir, script)], {
    stdio: 'inherit',
    cwd: projectRoot,
  })
  if (result.status !== 0) {
    console.error(`\nprepare-assets: ${script} failed`)
    process.exit(result.status ?? 1)
  }
}

// Always: the engine is gitignored, so it is never already there after a clone.
run('copy-engine.mjs')

const missing = REQUIRED.filter((name) => !existsSync(join(servedDir, name)))

if (process.env.FORCE !== '1' && missing.length === 0) {
  console.log('Game collections present; skipping fetch and build. FORCE=1 to refresh.')
  process.exit(0)
}

if (missing.length > 0) {
  console.log(`Missing from public/games: ${missing.join(', ')}`)
}
console.log('Fetching and building the game collections…')

for (const script of DATA_CHAIN) run(script)
