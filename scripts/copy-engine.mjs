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
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
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
const FILES = [`${BUILD}.js`, `${BUILD}.wasm`]

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(`Stockfish not found at ${sourceDir}. Run "npm install" first.`)
    process.exit(1)
  }

  await mkdir(targetDir, { recursive: true })

  // Cleared first: an engine upgrade changes these filenames, and the previous
  // build left beside the new one is megabytes served to nobody and a confusing
  // thing to find later.
  for (const stale of await readdir(targetDir)) {
    if (!FILES.includes(stale)) await rm(join(targetDir, stale), { recursive: true })
  }

  for (const file of FILES) {
    await copyFile(join(sourceDir, file), join(targetDir, file))
  }
  console.log(`Copied ${BUILD} to public/engine/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
