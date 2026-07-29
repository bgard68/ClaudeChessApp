/**
 * The database schema.
 *
 * One table. Metadata columns are a queryable index over the PGN, not a
 * replacement for it — `pgn` stays the canonical record, so exporting a game
 * is lossless and nothing is lost in translation.
 *
 * There is deliberately no `move` table. PGN already encodes per-move clock
 * times as `[%clk]` comments, which the replay code already reads; a move table
 * would mean ~230,000 rows and a second source of truth competing with the
 * PGN, for no capability this app needs.
 */
/**
 * Bump for any change to the tables, indexes, or columns below — including
 * adding a table. Forgetting to means existing databases never create it, and
 * the first query against it fails on startup.
 */
export const SCHEMA_VERSION = 5

/**
 * Bump when the bundled PGN collections change.
 *
 * Separate from the schema version on purpose: the shape of the table and the
 * contents of the library move for different reasons. Without this, editing a
 * PGN file has no effect on anyone who already opened the app — bundled games
 * are only imported into an empty table, so a stale library would persist
 * indefinitely.
 */
export const LIBRARY_VERSION = 3

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS game (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     source          TEXT    NOT NULL CHECK (source IN ('championship','famous','career','played','imported')),

     white_name      TEXT    NOT NULL,
     black_name      TEXT    NOT NULL,
     white_elo       INTEGER,
     black_elo       INTEGER,

     event           TEXT    NOT NULL,
     site            TEXT,
     round           TEXT,
     played_on       TEXT    NOT NULL,
     year            INTEGER,

     result          TEXT    NOT NULL CHECK (result IN ('1-0','0-1','1/2-1/2','*')),
     outcome_status  TEXT    NOT NULL CHECK (outcome_status IN ('decisive','draw','in_progress')),
     outcome_reason  TEXT,

     eco             TEXT,
     opening         TEXT,
     time_control    TEXT,
     -- Full moves, not half-moves: it is what the list displays, and it can be
     -- read from the movetext without playing the game out.
     move_count      INTEGER NOT NULL,
     has_clock_times INTEGER NOT NULL CHECK (has_clock_times IN (0,1)),

     -- Only celebrated games carry one: "The Immortal Game".
     nickname        TEXT,

     -- Fingerprint of the moves and players. NULL for games you played, so two
     -- short games of your own can never collide with each other.
     game_key        TEXT,

     pgn             TEXT    NOT NULL,
     recorded_at     TEXT,

     -- Commas and dots become spaces so that every part of a name starts a
     -- word: "Anderssen,Adolf" must be findable by "adolf". That is what lets
     -- searching match word beginnings instead of anywhere in the string, so
     -- "tal" stops matching "Asztalos".
     search_text     TEXT GENERATED ALWAYS AS (
                       replace(replace(lower(
                         white_name || ' ' || black_name || ' ' ||
                         event || ' ' || played_on || ' ' || round ||
                         ' ' || coalesce(nickname, '')
                       ), ',', ' '), '.', ' ')
                     ) STORED
   )`,

  // Makes duplicates impossible rather than merely unlikely: a re-import is
  // rejected by the database itself. SQLite permits many NULLs here, which is
  // what leaves your own games out of the constraint.
  `CREATE UNIQUE INDEX IF NOT EXISTS game_key_unique ON game (game_key)`,

  `CREATE INDEX IF NOT EXISTS game_by_source_year ON game (source, year DESC)`,
  `CREATE INDEX IF NOT EXISTS game_by_white ON game (white_name)`,
  `CREATE INDEX IF NOT EXISTS game_by_black ON game (black_name)`,

  // search_text is intentionally not indexed: substring search cannot use a
  // B-tree, and scanning a few thousand rows is sub-millisecond. The column
  // exists so case-folding lives in exactly one place.
]
