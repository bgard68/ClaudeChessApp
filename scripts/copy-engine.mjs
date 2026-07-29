/**
 * Copies the Stockfish worker build out of node_modules and into public/.
 *
 * The engine is loaded as a classic web worker from a URL, so the files have to
 * be served as static assets rather than bundled. Copying at build time keeps
 * ~3.7 MB of binaries out of version control while leaving node_modules the
 * single source of truth for which engine build is in use.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(projectRoot, 'node_modules', 'stockfish', 'src')
const targetDir = join(projectRoot, 'public', 'engine')

const FILES = ['stockfish.js', 'stockfish.wasm']

async function main() {
  if (!existsSync(sourceDir)) {
    console.error(`Stockfish not found at ${sourceDir}. Run "npm install" first.`)
    process.exit(1)
  }

  await mkdir(targetDir, { recursive: true })
  for (const file of FILES) {
    await copyFile(join(sourceDir, file), join(targetDir, file))
  }
  console.log(`Copied ${FILES.length} engine files to public/engine/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
