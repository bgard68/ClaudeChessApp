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
    const isTagLine = /^\s*\[/.test(line)

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
