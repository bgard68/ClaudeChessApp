import type { ArchivedGameSummary } from '@domain/archive/ArchivedGame'

const HEADER_PATTERN = /^\s*\[(\w+)\s+"([^"]*)"\]/gm
const MOVE_NUMBER_PATTERN = /(\d+)\s*\./g

export type PgnHeaders = Readonly<Record<string, string>>

export function readHeaders(pgn: string): PgnHeaders {
  const headers: Record<string, string> = {}
  for (const match of pgn.matchAll(HEADER_PATTERN)) {
    const [, key, value] = match
    if (key !== undefined && value !== undefined) headers[key] = value
  }
  return headers
}

export function headerOr(headers: PgnHeaders, key: string, fallback: string): string {
  const value = headers[key]
  return value === undefined || value === '' || value === '?' ? fallback : value
}

/**
 * Builds a list entry without running the moves through a rules engine.
 *
 * Indexing a few thousand games this way takes milliseconds; validating every
 * move of every game would take seconds and is only needed for the one game a
 * user actually opens.
 */
export function summarise(pgn: string, id: string): ArchivedGameSummary {
  const headers = readHeaders(pgn)
  return {
    id,
    origin: 'championship',
    white: headerOr(headers, 'White', 'Unknown'),
    black: headerOr(headers, 'Black', 'Unknown'),
    whiteElo: toElo(headers['WhiteElo']),
    blackElo: toElo(headers['BlackElo']),
    event: headerOr(headers, 'Event', 'Unknown event'),
    date: headerOr(headers, 'Date', '????.??.??'),
    round: headerOr(headers, 'Round', '-'),
    result: headerOr(headers, 'Result', '*'),
    moveCount: countMoves(pgn),
    hasRecordedClocks: pgn.includes('%clk'),
    nickname: headers['Nickname'] ?? null,
  }
}

function toElo(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Highest move number in the movetext — close enough for a list column. */
function countMoves(pgn: string): number {
  const moveText = pgn.replace(HEADER_PATTERN, '')
  let highest = 0
  for (const match of moveText.matchAll(MOVE_NUMBER_PATTERN)) {
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value) && value > highest) highest = value
  }
  return highest
}
