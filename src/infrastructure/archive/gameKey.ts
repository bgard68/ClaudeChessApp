/**
 * A stable identity for a game, so the same game is never stored twice.
 *
 * Built from the moves plus the players: move text alone repeats for very short
 * games, and player names alone repeat constantly. Comments are stripped first,
 * so the same game with and without clock annotations is recognised as one.
 *
 * Kept in step with `scripts/lib/gameKey.mjs`, the plain-JavaScript twin the
 * build scripts use — they cannot import this one, being TypeScript behind path
 * aliases, and a script that needs a compile step to run is a script nobody
 * runs. `gameKey.test.ts` pins the two to identical output and fails if either
 * drifts.
 */
export function gameKey(pgn: string): string {
  const moves = pgn
    .replace(/^\s*\[.*\]\s*$/gm, '') // tag pairs
    .replace(/\{[^}]*\}/g, '') // comments, including clock annotations
    .replace(/\$\d+/g, '') // numeric annotation glyphs
    .replace(/\s+/g, '') // all whitespace
    .toLowerCase()

  const name = (tag: string): string => {
    const match = new RegExp(`^\\[${tag} "([^"]*)"\\]`, 'm').exec(pgn)
    return (match === null ? '' : match[1] ?? '').toLowerCase().replace(/[^a-z]/g, '')
  }

  return fnv1a(`${name('White')}|${name('Black')}|${moves}`)
}

/** FNV-1a, 64-bit. Collision odds across a few thousand games are negligible. */
function fnv1a(text: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(index))) * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
