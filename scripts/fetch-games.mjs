/**
 * Downloads the World Championship game collection and merges it into the
 * single PGN file the app serves.
 *
 * Run once with `npm run fetch-games`. The result is committed, so a fresh
 * clone does not need network access to browse the library.
 *
 * Source: https://github.com/mainali123/Chess-Dataset (public repository of
 * World Championship match scores). Game move scores are factual records.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'mainali123/Chess-Dataset'
const FOLDER = 'World_Chess_Champoinship'
const CONTENTS_URL = `https://api.github.com/repos/${REPO}/contents/${FOLDER}?per_page=100`

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetFile = join(projectRoot, 'public', 'games', 'raw', 'world-championship.pgn')

async function main() {
  // Idempotent: dev starts and rebuilds must not re-download fifty files.
  // FORCE=1 refreshes anyway.
  if (process.env.FORCE !== '1' && existsSync(targetFile) && statSync(targetFile).size > 0) {
    process.stdout.write(
      `Games already present at public/games/raw/world-championship.pgn ` +
        `(${(statSync(targetFile).size / 1_048_576).toFixed(2)} MB). ` +
        `Run with FORCE=1 to refresh.\n`,
    )
    return
  }

  process.stdout.write(`Listing ${REPO}/${FOLDER}…\n`)

  const listing = await fetchJson(CONTENTS_URL)
  const files = listing
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.pgn'))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (files.length === 0) throw new Error('No .pgn files found at the source')

  const chunks = []
  for (const [index, file] of files.entries()) {
    process.stdout.write(`  [${index + 1}/${files.length}] ${file.name}\n`)
    const text = await fetchText(file.download_url)
    chunks.push(text.trim())
  }

  const merged = `${chunks.join('\n\n')}\n`
  await mkdir(dirname(targetFile), { recursive: true })
  await writeFile(targetFile, merged, 'utf8')

  const games = (merged.match(/^\[Event /gm) ?? []).length
  process.stdout.write(
    `\nWrote ${games} games (${(merged.length / 1_048_576).toFixed(2)} MB) to public/games/raw/world-championship.pgn\n`,
  )
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`${url} -> ${response.status} ${response.statusText}`)
  return response.json()
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> ${response.status} ${response.statusText}`)
  return response.text()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
