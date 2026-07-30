import { describe, expect, it } from 'vitest'
// The scripts' plain-JavaScript twin, imported directly. Vitest can load it;
// the build scripts cannot load the TypeScript one, which is why both exist.
import {
  gameIdentity as scriptIdentity,
  gameKey as scriptKey,
  moveTextOf as scriptMoveText,
  tagOf as scriptTag,
} from '../../../scripts/lib/gameKey.mjs'
import { gameKey } from './gameKey'

/**
 * Holds the two implementations of game identity to the same answers.
 *
 * `gameKey.ts` decides what the app stores; `scripts/lib/gameKey.mjs` decides
 * what the audit and dedupe scripts consider a duplicate. They are separate
 * because a build script cannot import TypeScript behind path aliases without a
 * compile step, and a script that needs one is a script nobody runs.
 *
 * The comment in gameKey.ts claimed this test existed long before it did. It
 * does now, because the failure mode is quiet and in the data layer: if the two
 * drift, the app stores a game the audit calls a duplicate, or dedupe collapses
 * two games the app considers distinct.
 *
 * The cases below are the ones the key exists to get right, not a sample of
 * ordinary games.
 */

const GAMES: readonly { readonly name: string; readonly pgn: string }[] = [
  {
    name: 'an ordinary short game',
    pgn: `[Event "Test"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 1-0`,
  },
  {
    name: 'the same game with clock comments — must key identically',
    pgn: `[Event "Test"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 {[%clk 0:10:00]} e5 {[%clk 0:09:58]} 2. f4 exf4 3. Bc4 Qh4+ 1-0`,
  },
  {
    name: 'the same game with numeric annotation glyphs',
    pgn: `[Event "Test"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 $1 e5 2. f4 $6 exf4 3. Bc4 Qh4+ 1-0`,
  },
  {
    name: 'punctuation and case in names must not matter',
    pgn: `[Event "Test"]
[White "ANDERSSEN,ADOLF"]
[Black "kieseritzky , lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 1-0`,
  },
  {
    name: 'a forfeit — no moves at all',
    pgn: `[Event "WCh"]
[White "Kramnik,V"]
[Black "Topalov,V"]
[Result "0-1"]
[Date "2006.09.29"]`,
  },
  {
    name: 'different players, identical moves',
    pgn: `[Event "Test"]
[White "Someone, A"]
[Black "Other, B"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 1-0`,
  },
  {
    name: 'missing tags entirely',
    pgn: `[Event "Test"]

1. d4 d5 1/2-1/2`,
  },
  {
    name: 'unicode in a name',
    pgn: `[Event "Test"]
[White "Réti, Richard"]
[Black "Boğoljubow, Efim"]
[Result "1-0"]

1. c4 e6 1-0`,
  },
]

describe('gameKey, across both implementations', () => {
  it.each(GAMES)('agrees on $name', ({ pgn }) => {
    expect(scriptKey(pgn)).toBe(gameKey(pgn))
  })

  it('is stable — a key is not accidentally derived from object identity', () => {
    const { pgn } = GAMES[0]!
    expect(gameKey(pgn)).toBe(gameKey(`${pgn}`))
  })

  it('recognises the same game with and without clock annotations as one', () => {
    expect(gameKey(GAMES[0]!.pgn)).toBe(gameKey(GAMES[1]!.pgn))
    expect(gameKey(GAMES[0]!.pgn)).toBe(gameKey(GAMES[2]!.pgn))
  })

  it('folds punctuation and case in player names', () => {
    expect(gameKey(GAMES[0]!.pgn)).toBe(gameKey(GAMES[3]!.pgn))
  })

  it('separates identical moves played by different people', () => {
    expect(gameKey(GAMES[0]!.pgn)).not.toBe(gameKey(GAMES[5]!.pgn))
  })

  it('produces a 16-character hex digest', () => {
    for (const { pgn } of GAMES) expect(gameKey(pgn)).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('the helpers the scripts share', () => {
  it('reads a tag, and returns empty for one that is absent', () => {
    expect(scriptTag(GAMES[0]!.pgn, 'White')).toBe('Anderssen, Adolf')
    expect(scriptTag(GAMES[0]!.pgn, 'Nickname')).toBe('')
  })

  it('strips tags, comments, glyphs and whitespace from the move text', () => {
    expect(scriptMoveText(GAMES[1]!.pgn)).toBe(scriptMoveText(GAMES[0]!.pgn))
    expect(scriptMoveText(GAMES[0]!.pgn)).not.toContain('[')
    expect(scriptMoveText(GAMES[0]!.pgn)).not.toContain(' ')
  })

  it('leaves a forfeit with no move text at all', () => {
    // Load-bearing: an empty move list is a prefix of every other, which is why
    // build-library and the audits special-case it rather than treating a
    // forfeit as a truncated copy of a real game.
    expect(scriptMoveText(GAMES[4]!.pgn)).toBe('')
  })

  it('builds identity as white|black|moves', () => {
    expect(scriptIdentity(GAMES[0]!.pgn)).toBe(
      'anderssenadolf|kieseritzkylionel|1.e4e52.f4exf43.bc4qh4+1-0',
    )
  })
})
