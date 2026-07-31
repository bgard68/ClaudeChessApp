import { describe, expect, it } from 'vitest'
import { Position, STARTING_FEN } from './Position'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('Position.fromFen', () => {
  it('reads the side to move', () => {
    expect(Position.fromFen(STARTING_FEN).sideToMove).toBe('white')
    expect(Position.fromFen(AFTER_E4).sideToMove).toBe('black')
  })

  it('reads both move counters', () => {
    const position = Position.fromFen(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    )
    expect(position.fullMoveNumber).toBe(2)
    expect(position.halfMoveClock).toBe(1)
  })

  it('keeps the FEN it was given', () => {
    expect(Position.fromFen(AFTER_E4).fen).toBe(AFTER_E4)
  })

  it('tolerates the padding a PGN parser leaves behind', () => {
    expect(Position.fromFen(`  ${STARTING_FEN}  `).sideToMove).toBe('white')
  })

  /*
   * A malformed FEN throws rather than yielding a position that looks fine
   * and describes the wrong board — this is the boundary where engine and
   * PGN output stops being trusted.
   */
  it.each([
    ['too few fields', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'],
    ['nothing at all', ''],
  ])('refuses a FEN with %s', (_why, fen) => {
    expect(() => Position.fromFen(fen)).toThrow('Malformed FEN')
  })

  it('refuses a side-to-move that is neither colour', () => {
    expect(() =>
      Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'),
    ).toThrow('invalid side-to-move')
  })

  // The counters are the two fields most often missing or junk in the wild,
  // and neither is worth rejecting a position over.
  it('falls back to sane counters when they are absent or unreadable', () => {
    const position = Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
    expect(position.fullMoveNumber).toBe(1)
    expect(position.halfMoveClock).toBe(0)
  })
})

describe('Position.initial', () => {
  it('is the starting position, with White to move', () => {
    const start = Position.initial()
    expect(start.fen).toBe(STARTING_FEN)
    expect(start.sideToMove).toBe('white')
    expect(start.fullMoveNumber).toBe(1)
    expect(start.halfMoveClock).toBe(0)
  })
})

describe('comparing positions', () => {
  it('calls two identical FENs equal', () => {
    expect(Position.fromFen(AFTER_E4).equals(Position.fromFen(AFTER_E4))).toBe(true)
    expect(Position.initial().equals(Position.fromFen(AFTER_E4))).toBe(false)
  })

  /*
   * Threefold repetition is about the board, not the clocks. The same
   * arrangement reached twice has different move counters both times, so
   * `equals` would never see a repetition and the rule could not fire.
   */
  it('ignores the counters when comparing boards', () => {
    const early = Position.fromFen('8/8/8/8/8/8/8/K6k w - - 0 1')
    const later = Position.fromFen('8/8/8/8/8/8/8/K6k w - - 30 40')

    expect(early.equals(later)).toBe(false)
    expect(early.isSameBoard(later)).toBe(true)
  })

  // Castling and en-passant rights are part of the position: the same pieces
  // with different rights is a different position for repetition purposes.
  it('still counts castling and en-passant rights as part of the board', () => {
    const withRights = Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    const without = Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')
    expect(withRights.isSameBoard(without)).toBe(false)
  })
})
