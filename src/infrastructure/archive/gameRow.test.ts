import { describe, expect, it } from 'vitest'
import type { SqlRow, SqlValue } from '../sqlite/protocol'
import { insertStatement, toSummary, type GameSource } from './gameRow'

const pgn = (tags: Record<string, string>, movetext = '1. e4 e5 2. Nf3 *') =>
  `${Object.entries(tags)
    .map(([name, value]) => `[${name} "${value}"]`)
    .join('\n')}\n\n${movetext}\n`

/** The values bound to the insert; `bind` is optional on the type, never here. */
const bindings = (
  pgn: string,
  source: GameSource,
  recordedAt: string | null = null,
): readonly SqlValue[] => {
  const { bind } = insertStatement(pgn, source, recordedAt)
  if (bind === undefined) throw new Error('the insert bound no values')
  return bind
}

/** The bind list, by the column order INSERT_SQL declares. */
const COLUMN = {
  source: 0,
  white: 1,
  black: 2,
  whiteElo: 3,
  blackElo: 4,
  event: 5,
  site: 6,
  round: 7,
  playedOn: 8,
  year: 9,
  result: 10,
  status: 11,
  reason: 12,
  eco: 13,
  opening: 14,
  timeControl: 15,
  moveCount: 16,
  hasClock: 17,
  nickname: 18,
  gameKey: 19,
  pgn: 20,
  recordedAt: 21,
} as const

describe('insertStatement', () => {
  it('reads the tags a full record carries', () => {
    const bind = bindings(
      pgn({
        White: 'Fischer, Robert James',
        Black: 'Spassky, Boris V',
        WhiteElo: '2785',
        BlackElo: '2660',
        Event: 'World Championship',
        Site: 'Reykjavik ISL',
        Round: '6',
        Date: '1972.07.23',
        Result: '1-0',
        Termination: 'resignation',
        ECO: 'D59',
        Opening: 'Queen’s Gambit Declined',
        TimeControl: '40/7200:1800',
        Nickname: 'The Game of the Century',
      }),
      'championship',
    )

    expect(bind[COLUMN.source]).toBe('championship')
    expect(bind[COLUMN.white]).toBe('Fischer, Robert James')
    expect(bind[COLUMN.whiteElo]).toBe(2785)
    expect(bind[COLUMN.blackElo]).toBe(2660)
    expect(bind[COLUMN.site]).toBe('Reykjavik ISL')
    expect(bind[COLUMN.playedOn]).toBe('1972.07.23')
    expect(bind[COLUMN.year]).toBe(1972)
    expect(bind[COLUMN.result]).toBe('1-0')
    expect(bind[COLUMN.status]).toBe('decisive')
    expect(bind[COLUMN.reason]).toBe('resignation')
    expect(bind[COLUMN.eco]).toBe('D59')
    expect(bind[COLUMN.timeControl]).toBe('40/7200:1800')
    expect(bind[COLUMN.moveCount]).toBe(2)
    expect(bind[COLUMN.nickname]).toBe('The Game of the Century')
    expect(bind[COLUMN.recordedAt]).toBeNull()
  })

  it('falls back for every tag a sparse record omits', () => {
    const bind = bindings('1. e4 *', 'imported')

    expect(bind[COLUMN.white]).toBe('Unknown')
    expect(bind[COLUMN.black]).toBe('Unknown')
    expect(bind[COLUMN.whiteElo]).toBeNull()
    expect(bind[COLUMN.event]).toBe('Unknown event')
    expect(bind[COLUMN.site]).toBeNull()
    expect(bind[COLUMN.round]).toBe('-')
    expect(bind[COLUMN.playedOn]).toBe('????.??.??')
    expect(bind[COLUMN.year]).toBeNull()
    expect(bind[COLUMN.eco]).toBeNull()
    expect(bind[COLUMN.nickname]).toBeNull()
  })

  it('constrains the result to the four the schema allows', () => {
    const draw = bindings(pgn({ Result: '1/2-1/2' }), 'famous')
    expect(draw[COLUMN.result]).toBe('1/2-1/2')
    expect(draw[COLUMN.status]).toBe('draw')

    const black = bindings(pgn({ Result: '0-1' }), 'famous')
    expect(black[COLUMN.result]).toBe('0-1')
    expect(black[COLUMN.status]).toBe('decisive')

    // Anything else — including an unfinished game — lands on "*".
    const odd = bindings(pgn({ Result: 'nonsense' }), 'famous')
    expect(odd[COLUMN.result]).toBe('*')
    expect(odd[COLUMN.status]).toBe('in_progress')
  })

  it('rejects an Elo tag that is not a number', () => {
    const bind = bindings(pgn({ WhiteElo: '????' }), 'career')
    expect(bind[COLUMN.whiteElo]).toBeNull()
  })

  it('notes whether the movetext carries clock annotations', () => {
    expect(bindings(pgn({}, '1. e4 {[%clk 1:59:00]} *'), 'played')[COLUMN.hasClock]).toBe(1)
    expect(bindings(pgn({}), 'played')[COLUMN.hasClock]).toBe(0)
  })

  it('exempts your own games from the duplicate key', () => {
    // Two short games of your own would otherwise hash alike and the second
    // would be silently dropped.
    expect(bindings(pgn({}), 'played')[COLUMN.gameKey]).toBeNull()
    expect(bindings(pgn({}), 'imported')[COLUMN.gameKey]).toEqual(expect.any(String))
  })

  it('stamps a recording time when one is given', () => {
    const bind = bindings(pgn({}), 'played', '2026-08-24T10:00:00.000Z')
    expect(bind[COLUMN.recordedAt]).toBe('2026-08-24T10:00:00.000Z')
  })

  it('counts by the highest move number, ignoring the tags', () => {
    // A year in a tag is a four-digit number; only movetext may be counted.
    const bind = bindings(pgn({ Date: '1972.07.23' }, '1. e4 e5 2. Nf3 Nc6 3. Bb5 *'), 'famous')
    expect(bind[COLUMN.moveCount]).toBe(3)
  })

  it('keeps the highest move number, not the last one seen', () => {
    // Damaged movetext restarts its numbering; the count must not fall back
    // down when it does.
    const bind = bindings(pgn({}, '1. e4 e5 2. Nf3 Nc6 1. d4 *'), 'imported')
    expect(bind[COLUMN.moveCount]).toBe(2)
  })
})

describe('toSummary', () => {
  const row = (over: Partial<SqlRow> = {}): SqlRow => ({
    id: 41,
    source: 'championship',
    white_name: 'Karpov, Anatoly',
    black_name: 'Kasparov, Garry',
    white_elo: 2725,
    black_elo: 2700,
    event: 'World Championship',
    site: 'Moscow URS',
    played_on: '1985.10.15',
    round: '16',
    result: '0-1',
    move_count: 40,
    has_clock_times: 0,
    nickname: null,
    ...over,
  })

  it('reads a full row', () => {
    expect(toSummary(row())).toEqual({
      id: '41',
      origin: 'championship',
      white: 'Karpov, Anatoly',
      black: 'Kasparov, Garry',
      whiteElo: 2725,
      blackElo: 2700,
      event: 'World Championship',
      site: 'Moscow URS',
      date: '1985.10.15',
      round: '16',
      result: '0-1',
      moveCount: 40,
      hasRecordedClocks: false,
      nickname: null,
    })
  })

  it('keeps the nulls a row is entitled to', () => {
    const summary = toSummary(row({ white_elo: null, black_elo: null, site: null, nickname: null }))

    expect(summary.whiteElo).toBeNull()
    expect(summary.blackElo).toBeNull()
    expect(summary.site).toBeNull()
    expect(summary.nickname).toBeNull()
  })

  it('reads the clock flag and a nickname when present', () => {
    const summary = toSummary(row({ has_clock_times: 1, nickname: 'The Immortal Game' }))

    expect(summary.hasRecordedClocks).toBe(true)
    expect(summary.nickname).toBe('The Immortal Game')
  })

  it('drops a placeholder site rather than printing it', () => {
    expect(toSummary(row({ site: '?' })).site).toBeNull()
  })
})
