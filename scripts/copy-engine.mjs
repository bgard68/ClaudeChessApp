/**
 * Copies the Stockfish worker build out of node_modules and into public/.
 *
 * The engine is loaded as a classic web worker from a URL, so the files have to
 * be served as static assets rather than bundled. Copying at build time keeps
 * the binaries out of version control while leaving node_modules the single
 * source of truth for which engine build is in use.
 *
 * WHICH BUILD, AND WHY. The package ships four, and only one of them is usable
 * here:
 *
 *   stockfish-18.wasm              113 MB, needs SharedArrayBuffer
 *   stockfish-18-single.wasm       113 MB, no threads
 *   stockfish-18-lite.wasm         7.1 MB, needs SharedArrayBuffer
 *   stockfish-18-lite-single.wasm  7.3 MB, no threads   <- this one
 *
 * `single` is not a preference. The threaded builds need SharedArrayBuffer,
 * which needs COOP and COEP response headers — exactly what the SAH-pool VFS in
 * sqlite.worker.ts was chosen to avoid. A threaded engine would cost this app
 * its ability to deploy as plain static files.
 *
 * `lite` carries the smaller neural network. The full net is 113 MB, more than
 * an order of magnitude larger than everything else the app serves put
 * together, for strength no opponent here will notice the absence of.
 */
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(projectRoot, 'node_modules', 'stockfish', 'bin')
const targetDir = join(projectRoot, 'public', 'engine')

/**
 * Names are preserved exactly. The Emscripten loader finds its own .wasm by its
 * own basename, so renaming one without the other leaves the worker fetching a
 * file that is not there.
 *
 * Kept beside ENGINE_WORKER_URL in composition/services.ts — the two have to
 * agree, and nothing but a broken engine says so if they stop.
 */
const BUILD = 'stockfish-18-lite-single'
const ENGINE_FILES = [`${BUILD}.js`, `${BUILD}.wasm`]

/**
 * The engine's licence, carried alongside the binaries it covers.
 *
 * Stockfish is GPL-3.0 and it is *distributed* — it is served to every visitor
 * as a static asset, not merely used at build time. GPL-3.0 asks that recipients
 * get the licence text and a way to the source, so shipping the WASM without
 * either is a compliance gap rather than a stylistic one. Copying it here is what
 * makes the deployed build carry it, since the licence lives in node_modules and
 * nothing else would put it in dist/.
 *
 * The written offer of source goes beside it, because the licence alone does not
 * tell anyone where the code is.
 */
const LICENCE_FILE = 'LICENSE-stockfish.txt'
const SOURCE_NOTICE_FILE = 'README-stockfish.txt'

const SOURCE_NOTICE = `Stockfish chess engine — licence and source
============================================

The files ${BUILD}.js and ${BUILD}.wasm in this directory are the
Stockfish chess engine, compiled to WebAssembly. They are NOT part of this
application's own source; they are redistributed unmodified.

Licence: GNU General Public License, version 3 — see ${LICENCE_FILE}.

Source code:
  Engine            https://github.com/official-stockfish/Stockfish
  WebAssembly build https://github.com/nmrugg/stockfish.js

The build redistributed here is the "lite-single" variant, taken unmodified from
the "stockfish" package on npm. The single-threaded build is used deliberately:
the threaded ones require SharedArrayBuffer, which requires COOP and COEP
response headers this application does not set.

Nothing in this directory has been altered. To obtain the corresponding source
for these exact binaries, see the projects above.
`

const FILES = [...ENGINE_FILES, LICENCE_FILE, SOURCE_NOTICE_FILE]

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(`Stockfish not found at ${sourceDir}. Run "npm install" first.`)
    process.exit(1)
  }

  const licenceSource = join(projectRoot, 'node_modules', 'stockfish', 'Copying.txt')
  if (!existsSync(licenceSource)) {
    // Refuse rather than ship GPL binaries with no licence beside them. If the
    // upstream package stops carrying Copying.txt, that is worth stopping for.
    console.error(`Stockfish licence not found at ${licenceSource}.`)
    console.error('Refusing to copy GPL-licensed binaries without their licence.')
    process.exit(1)
  }

  await mkdir(targetDir, { recursive: true })

  // Cleared first: an engine upgrade changes these filenames, and the previous
  // build left beside the new one is megabytes served to nobody and a confusing
  // thing to find later.
  for (const stale of await readdir(targetDir)) {
    if (!FILES.includes(stale)) await rm(join(targetDir, stale), { recursive: true })
  }

  for (const file of ENGINE_FILES) {
    await copyFile(join(sourceDir, file), join(targetDir, file))
  }

  await copyFile(licenceSource, join(targetDir, LICENCE_FILE))
  await writeFile(join(targetDir, SOURCE_NOTICE_FILE), SOURCE_NOTICE, 'utf8')

  console.log(`Copied ${BUILD} to public/engine/, with its licence and source notice`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
