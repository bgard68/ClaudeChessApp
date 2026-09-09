/**
 * A tag pair opening a line: `[Name "value"`.
 *
 * Matched against the format's actual grammar — a tag name, whitespace, then a
 * quoted value — rather than on the bracket alone. A bare `^\s*\[` also matches
 * a movetext line that happens to begin with an annotation, and `[%clk ...]` is
 * exactly that: broadcast PGN wrapped at a fixed column puts one at the start
 * of a line routinely. The splitter read it as the next game's tag section and
 * tore the game in half, so the file imported with a trailing fragment that had
 * no tags and no result.
 */
const TAG_PAIR_LINE = /^\s*\[[A-Za-z0-9_]+\s+"/

/**
 * Splits a multi-game PGN file into individual game texts.
 *
 * A game ends where the next one's tag section begins, which is the only
 * separator the format actually guarantees — blank-line conventions vary
 * between the databases these files come from.
 */
export function splitPgnGames(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const games: string[] = []

  let current: string[] = []
  let insideMoveText = false

  for (const line of lines) {
    const isTagLine = TAG_PAIR_LINE.test(line)

    if (isTagLine && insideMoveText) {
      games.push(current.join('\n'))
      current = []
      insideMoveText = false
    }

    if (!isTagLine && line.trim() !== '') insideMoveText = true
    current.push(line)
  }

  games.push(current.join('\n'))
  return games.filter((game) => game.trim() !== '')
}
