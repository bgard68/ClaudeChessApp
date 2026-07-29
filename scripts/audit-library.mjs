/**
 * Independent check of the built library: every game replayed, and duplicates
 * looked for by a different method than the builder uses. Run after a refetch.
 *
 *   npm run audit-library
 */
import { readFileSync, readdirSync } from 'node:fs'
import { Chess } from 'chess.js'

const files = readdirSync('library').filter((n) => n.endsWith('.pgn'))
const all = []
for (const f of files) {
  for (const g of readFileSync(`library/${f}`, 'utf8').split(/(?=\[Event )/)) {
    if (g.trim() !== '') all.push({ g, f })
  }
}

const tag = (g, t) => {
  const m = g.match(new RegExp(`^\\[${t} "([^"]*)"\\]`, 'm'))
  return m ? m[1] : ''
}
const person = (g, t) => tag(g, t).toLowerCase().replace(/[^a-z]/g, '')
const moves = (g) =>
  g.replace(/^\s*\[.*\]\s*$/gm, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, '').toLowerCase()

console.log(`files ${files.length}, games ${all.length}`)

let unplayable = 0
let plies = 0
for (const { g } of all) {
  const c = new Chess()
  try {
    c.loadPgn(g, { strict: false })
    const n = c.history().length
    if (n === 0) unplayable += 1
    else plies += n
  } catch {
    unplayable += 1
  }
}
console.log(`unplayable            : ${unplayable}`)
console.log(`half-moves replayed   : ${plies.toLocaleString()}`)

const seen = new Map()
let exact = 0
for (const { g, f } of all) {
  const key = `${person(g, 'White')}|${person(g, 'Black')}|${moves(g)}`
  if (seen.has(key)) {
    exact += 1
    if (exact <= 2) console.log(`  identical: ${f} vs ${seen.get(key)}`)
  } else seen.set(key, f)
}
console.log(`identical duplicates  : ${exact}`)

const groups = new Map()
for (const { g } of all) {
  const key = `${person(g, 'White')}|${person(g, 'Black')}|${tag(g, 'Date').slice(0, 4)}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(moves(g))
}
let prefix = 0
for (const list of groups.values()) {
  const sorted = [...list].sort((a, b) => b.length - a.length)
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[i].startsWith(sorted[j])) prefix += 1
    }
  }
}
console.log(`truncated duplicates  : ${prefix}`)

const nicknames = all.filter(({ g }) => tag(g, 'Nickname') !== '').length
console.log(`named famous games    : ${nicknames}`)
