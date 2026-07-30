import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the dependency rule, which was previously only a convention.
 *
 * The README says dependencies point inward and nothing in `domain/` or
 * `application/` imports React, chess.js or Stockfish. That was true, but
 * nothing checked it — and a review found one breach that had gone unnoticed
 * for exactly that reason. Documentation cannot fail a build; this can.
 *
 * Hand-rolled rather than an ESLint rule because the project has no ESLint, and
 * adding a linter and its plugin to assert four things is a worse trade than
 * thirty lines that run in the existing suite and the commit hook.
 */

const SRC = join(import.meta.dirname, '.')

/** Layers, innermost first. A layer may only import from itself or inward. */
const INWARD: Readonly<Record<string, readonly string[]>> = {
  domain: ['domain'],
  application: ['domain', 'application'],
  infrastructure: ['domain', 'application', 'infrastructure'],
  // presentation and composition may reach anywhere; composition exists to.
}

/** Libraries that must not reach the inner layers. */
const OUTER_LIBRARIES = [
  'react',
  'react-dom',
  'react-chessboard',
  'chess.js',
  'stockfish',
  '@sqlite.org/sqlite-wasm',
]

/**
 * The one accepted breach, with its reason.
 *
 * `useFederations` reads a static JSON file to put flags beside player names.
 * A port plus injection would buy substitutability for something that will
 * never have a second implementation; the cost of the exception is that flag
 * rendering cannot be tested without stubbing fetch. Listed here so it stays a
 * decision rather than becoming a precedent — anything else must be argued for
 * by editing this list.
 */
const ACCEPTED: readonly string[] = ['presentation/hooks/useFederations.ts']

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(path)
    }
  }
  return found
}

/** Every `from '...'` specifier in a file. */
function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  return [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!)
}

const layerOf = (relativePath: string): string => relativePath.split(/[\\/]/)[0]!

const files = sourceFiles(SRC).map((path) => ({
  path,
  relative: relative(SRC, path).replace(/\\/g, '/'),
}))

describe('the dependency rule', () => {
  it('finds source files to check', () => {
    // Guards the guard: a broken walk would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(40)
  })

  it.each(Object.keys(INWARD))('%s imports only itself or inward', (layer) => {
    const allowed = INWARD[layer]!
    const breaches: string[] = []

    for (const file of files.filter((f) => layerOf(f.relative) === layer)) {
      if (ACCEPTED.includes(file.relative)) continue
      for (const specifier of importsOf(file.path)) {
        const alias = /^@(domain|application|infrastructure|presentation|composition)\b/.exec(
          specifier,
        )
        if (alias === null) continue
        if (!allowed.includes(alias[1]!)) {
          breaches.push(`${file.relative} imports ${specifier}`)
        }
      }
    }

    expect(breaches).toEqual([])
  })

  it('keeps outer libraries out of domain and application', () => {
    const breaches: string[] = []

    for (const file of files) {
      const layer = layerOf(file.relative)
      if (layer !== 'domain' && layer !== 'application') continue
      if (ACCEPTED.includes(file.relative)) continue

      for (const specifier of importsOf(file.path)) {
        if (OUTER_LIBRARIES.some((lib) => specifier === lib || specifier.startsWith(`${lib}/`))) {
          breaches.push(`${file.relative} imports ${specifier}`)
        }
      }
    }

    expect(breaches).toEqual([])
  })

  it('lets only the composition root name concrete adapters', () => {
    const ADAPTERS =
      /new (ChessJsRules|StockfishEngine|SqliteClient|SqliteGameArchive|IntervalTicker|HttpPgnSource)\(/

    const breaches = files
      .filter((file) => layerOf(file.relative) !== 'composition')
      .filter((file) => ADAPTERS.test(readFileSync(file.path, 'utf8')))
      .map((file) => file.relative)

    expect(breaches).toEqual([])
  })

  it('does not reach infrastructure from presentation, beyond the accepted list', () => {
    const breaches: string[] = []

    for (const file of files.filter((f) => layerOf(f.relative) === 'presentation')) {
      if (ACCEPTED.includes(file.relative)) continue
      for (const specifier of importsOf(file.path)) {
        if (specifier.startsWith('@infrastructure')) {
          breaches.push(`${file.relative} imports ${specifier}`)
        }
      }
    }

    expect(breaches).toEqual([])
  })

  it('has no stale entries in the accepted list', () => {
    // An exception that no longer applies should be deleted, not left to imply
    // a breach that has been fixed is still tolerated.
    const stale = ACCEPTED.filter((entry) => !files.some((file) => file.relative === entry))
    expect(stale).toEqual([])
  })
})
