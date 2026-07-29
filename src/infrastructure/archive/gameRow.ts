import { placeOrNull, type ArchivedGameSummary } from '@domain/archive/ArchivedGame'
import type { SqlRow, SqlStatement, SqlValue } from '../sqlite/protocol'
import { headerOr, readHeaders } from '../pgn/pgnHeaders'
import { gameKey } from './gameKey'

export type GameSource = 'championship' | 'famous' | 'career' | 'played' | 'imported'

const MOVE_NUMBER_PATTERN = /(\d+)\s*\./g
const HEADER_PATTERN = /^\s*\[(\w+)\s+"([^"]*)"\]/gm

const INSERT_SQL = `
  INSERT OR IGNORE INTO game (
    source, white_name, black_name, white_elo, black_elo,
    event, site, round, played_on, year,
    result, outcome_status, outcome_reason,
    eco, opening, time_control, move_count, has_clock_times,
    nickname, game_key, pgn, recorded_at
  ) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?,?)`

/**
 * Builds the insert for one game by reading its tags only.
 *
 * Deliberately never plays the moves: indexing thousands of games has to stay
 * in the milliseconds, and the precise outcome is recovered when a game is
 * actually opened.
 */
export function insertStatement(
  pgn: string,
  source: GameSource,
  recordedAt: string | null = null,
): SqlStatement {
  const headers = readHeaders(pgn)
  const playedOn = headerOr(headers, 'Date', '????.??.??')
  const result = normaliseResult(headers['Result'])

  const bind: SqlValue[] = [
    source,
    headerOr(headers, 'White', 'Unknown'),
    headerOr(headers, 'Black', 'Unknown'),
    toInteger(headers['WhiteElo']),
    toInteger(headers['BlackElo']),
    headerOr(headers, 'Event', 'Unknown event'),
    headers['Site'] ?? null,
    headerOr(headers, 'Round', '-'),
    playedOn,
    yearOf(playedOn),
    result,
    statusFor(result),
    headers['Termination'] ?? null,
    headers['ECO'] ?? null,
    headers['Opening'] ?? null,
    headers['TimeControl'] ?? null,
    countMoves(pgn),
    pgn.includes('%clk') ? 1 : 0,
    headers['Nickname'] ?? null,
    // Your own games are exempt: two short ones would otherwise look identical.
    source === 'played' ? null : gameKey(pgn),
    pgn,
    recordedAt,
  ]

  return { sql: INSERT_SQL, bind }
}

/** Columns the archive list needs — deliberately not the PGN itself. */
export const SUMMARY_COLUMNS =
  'id, source, white_name, black_name, white_elo, black_elo, event, site, played_on, round, result, move_count, has_clock_times, nickname'

export function toSummary(row: SqlRow): ArchivedGameSummary {
  return {
    id: String(row['id']),
    origin: String(row['source']) as GameSource,
    white: String(row['white_name']),
    black: String(row['black_name']),
    whiteElo: row['white_elo'] === null ? null : Number(row['white_elo']),
    blackElo: row['black_elo'] === null ? null : Number(row['black_elo']),
    event: String(row['event']),
    site: placeOrNull(row['site']),
    date: String(row['played_on']),
    round: String(row['round']),
    result: String(row['result']),
    moveCount: Number(row['move_count']),
    hasRecordedClocks: Number(row['has_clock_times']) === 1,
    nickname: row['nickname'] === null ? null : String(row['nickname']),
  }
}

/** The result tag, constrained to the four values the schema allows. */
function normaliseResult(value: string | undefined): string {
  return value === '1-0' || value === '0-1' || value === '1/2-1/2' ? value : '*'
}

function statusFor(result: string): string {
  if (result === '1/2-1/2') return 'draw'
  return result === '*' ? 'in_progress' : 'decisive'
}

function yearOf(playedOn: string): number | null {
  const year = Number.parseInt(playedOn.slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}

function toInteger(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Highest move number in the movetext. */
function countMoves(pgn: string): number {
  const moveText = pgn.replace(HEADER_PATTERN, '')
  let highest = 0
  for (const match of moveText.matchAll(MOVE_NUMBER_PATTERN)) {
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value) && value > highest) highest = value
  }
  return highest
}
