import { toResultTag } from '@domain/chess/GameOutcome'
import type { RecordedGame } from '@application/ports/GameStore'
import { formatClockComment } from './clockComment'
import { formatTimeControlTag } from './timeControlTag'

const MAX_LINE_LENGTH = 80

/**
 * Serialises a game this app played into PGN.
 *
 * Clock readings are written as `[%clk]` comments — the same annotation
 * broadcast games use, and the one the replay clock already recognises. That is
 * what lets your own games replay with real times while historical ones can
 * only be estimated, without a second code path anywhere.
 */
export function writePgn(game: RecordedGame): string {
  const tags: Array<[string, string]> = [
    ['Event', game.event],
    ['Site', game.site],
    ['Date', game.playedOn],
    ['Round', '-'],
    ['White', game.white],
    ['Black', game.black],
    ['Result', toResultTag(game.outcome)],
    ['TimeControl', formatTimeControlTag(game.timeControl)],
  ]

  if (game.outcome.status === 'decisive' && game.outcome.reason !== 'unknown') {
    tags.push(['Termination', game.outcome.reason])
  } else if (game.outcome.status === 'draw') {
    tags.push(['Termination', game.outcome.reason])
  }

  const header = tags
    .map(([name, value]) => `[${name} "${escapeTagValue(value)}"]`)
    .join('\n')

  return `${header}\n\n${buildMoveText(game)}\n`
}

function escapeTagValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildMoveText(game: RecordedGame): string {
  const tokens: string[] = []

  for (const move of game.moves) {
    if (move.color === 'white') tokens.push(`${Math.floor((move.ply - 1) / 2) + 1}.`)
    tokens.push(move.san)
    if (move.clockAfterMs !== null) {
      tokens.push(`{${formatClockComment(move.clockAfterMs)}}`)
    }
  }
  tokens.push(toResultTag(game.outcome))

  return wrap(tokens, MAX_LINE_LENGTH)
}

/** PGN keeps movetext lines within 80 columns; readers are happier for it. */
function wrap(tokens: readonly string[], limit: number): string {
  const lines: string[] = []
  let line = ''

  for (const token of tokens) {
    if (line === '') {
      line = token
    } else if (line.length + 1 + token.length <= limit) {
      line = `${line} ${token}`
    } else {
      lines.push(line)
      line = token
    }
  }
  if (line !== '') lines.push(line)

  return lines.join('\n')
}
