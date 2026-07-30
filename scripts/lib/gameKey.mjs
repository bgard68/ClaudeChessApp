/**
 * A stable identity for a game, so the same game is never counted twice.
 *
 * The plain-JavaScript twin of src/infrastructure/archive/gameKey.ts. The app's
 * copy is TypeScript behind path aliases, and a build script that needs a
 * compile step to run is a script nobody runs — so the logic exists twice on
 * purpose. What was missing was anything holding the two in agreement:
 * `gameKey.test.ts` pins them to identical output over a fixture set, and fails
 * if either drifts.
 *
 * The consequence of drift, if it were unchecked, is quiet and in the data
 * layer: the app would store a game the audit calls a duplicate, or the dedupe
 * script would collapse two games the app considers distinct.
 *
 * Also exports the tag helpers the audit and dedupe scripts share, for the same
 * reason — three private copies of "how do you read a PGN tag" is three chances
 * to read it differently.
 */

/** The raw value of a PGN tag, or '' when absent. */
export function tagOf(pgn, name) {
  const match = new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm').exec(pgn)
  return match === null ? '' : (match[1] ?? '')
}

/** A player's name reduced to comparable letters. */
export function personOf(pgn, name) {
  return tagOf(pgn, name).toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * The move text alone: tag pairs, comments, NAGs and whitespace removed.
 *
 * Stripping comments is what makes the same game recognisable with and without
 * clock annotations.
 */
export function moveTextOf(pgn) {
  return pgn
    .replace(/^\s*\[.*\]\s*$/gm, '') // tag pairs
    .replace(/\{[^}]*\}/g, '') // comments, including clock annotations
    .replace(/\$\d+/g, '') // numeric annotation glyphs
    .replace(/\s+/g, '') // all whitespace
    .toLowerCase()
}

/**
 * Identity before hashing: white, black, and the move text.
 *
 * Exposed separately because the audit and dedupe scripts compare identities
 * rather than store them, and an unhashed key is both cheaper and legible in
 * output.
 */
export function gameIdentity(pgn) {
  return `${personOf(pgn, 'White')}|${personOf(pgn, 'Black')}|${moveTextOf(pgn)}`
}

/** Must stay byte-identical to gameKey() in gameKey.ts. */
export function gameKey(pgn) {
  return fnv1a(gameIdentity(pgn))
}

/** FNV-1a, 64-bit. Collision odds across a few thousand games are negligible. */
function fnv1a(text) {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(index))) * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
