import { describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import type { ChessRules } from '@domain/ports/ChessRules'
import type { ChessEngine, EngineConfiguration } from '../ports/ChessEngine'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { PuzzleGenerator } from './PuzzleGenerator'

const rules = new ChessJsRules()

/** Plays a fixed script of moves, whatever it is asked. */
class ScriptedEngine implements ChessEngine {
  readonly configurations: EngineConfiguration[] = []
  disposed = false
  private index = 0

  constructor(private readonly moves: readonly MoveIntent[]) {}

  init(): Promise<void> {
    return Promise.resolve()
  }

  configure(configuration: EngineConfiguration): Promise<void> {
    this.configurations.push(configuration)
    return Promise.resolve()
  }

  chooseMove(): Promise<MoveIntent> {
    const move = this.moves[this.index]
    this.index += 1
    if (move === undefined) return new Promise<never>(() => {})
    return Promise.resolve(move)
  }

  stop(): void {}

  dispose(): void {
    this.disposed = true
  }
}

/** The scholar's mate finish, after a 1.e4 e5 book: mate falls on move 4. */
const SCHOLARS_FINISH: readonly MoveIntent[] = [
  { from: 'f1', to: 'c4' },
  { from: 'b8', to: 'c6' },
  { from: 'd1', to: 'h5' },
  { from: 'g8', to: 'f6' },
  { from: 'h5', to: 'f7' },
]

const BOOK = [['e4', 'e5']] as const

/**
 * A real game whose last three plies are a forced mate: 30...Bf5+ leaves
 * White no escape, and Black mates on move 16. The book carries the first
 * twenty-nine plies; the engine plays the finish.
 */
const FORCED_MATE_BOOK = [
  'h4', 'c5', 'g4', 'Qc7', 'Nh3', 'h6', 'd4', 'Kd8', 'e4', 'cxd4',
  'Kd2', 'd5', 'Rg1', 'Nc6', 'g5', 'Bf5', 'Qh5', 'f6', 'g6', 'Rc8',
  'Be2', 'Bxh3', 'a3', 'a6', 'Qxh6', 'Ne5', 'exd5', 'Nc4+', 'Kd3',
]

const FORCED_FINISH: readonly MoveIntent[] = [
  { from: 'h3', to: 'f5' },
  { from: 'd3', to: 'd4' },
  { from: 'c7', to: 'e5' },
]

/** The position 30...Bf5+ is played from — the puzzle this game yields. */
const FORCED_MATE_FEN = '2rk1bnr/1pq1p1p1/p4pPQ/3P4/2np3P/P2K3b/1PP1BP2/RNB3R1 b - - 2 15'

/** The fastest stalemate: a finished game with no mate anywhere in it. */
const STALEMATE_BOOK = [
  'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'Qxc7', 'Rah6', 'h4', 'f6',
  'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
]

/**
 * A legal game of the requested length, built by always taking the same
 * position in the move list. Deterministic, and long enough to trip the
 * generator's ply ceiling without ending on its own.
 */
function longLegalOpening(plies: number): string[] {
  const sans: string[] = []
  let position = rules.initialPosition()

  while (sans.length < plies) {
    const moves = rules.legalMoves(position)
    if (moves.length === 0) break
    const move = moves[(sans.length * 7) % moves.length]!
    sans.push(move.san)
    position = rules.play(position, move)!.position
  }
  return sans
}

/**
 * Rules under which the game is over after a single ply — the case real chess
 * cannot produce, and the generator must survive anyway.
 */
function shortGameRules(): { rules: ChessRules; book: string[] } {
  const start = rules.initialPosition()
  const move = rules.legalMoves(start)[0]!
  let played = 0

  return {
    book: [move.san],
    rules: {
      initialPosition: () => start,
      positionFromFen: (fen) => rules.positionFromFen(fen),
      legalMoves: () => [move],
      legalMovesFrom: () => [move],
      isCheck: () => false,
      play: (position) => {
        played += 1
        return { move, position }
      },
      outcome: () =>
        played === 0
          ? { status: 'in_progress' }
          : { status: 'decisive', winner: 'white', reason: 'checkmate' },
    },
  }
}

describe('PuzzleGenerator', () => {
  it('turns a self-play mate into a puzzle, and cleans up its engine', async () => {
    const engine = new ScriptedEngine(SCHOLARS_FINISH)
    const generator = new PuzzleGenerator(rules, () => engine, BOOK)

    const progress: number[] = []
    const puzzle = await generator.generate(0, (ply) => progress.push(ply))

    // Qh5 did not force the mate — Black simply blundered — so the honest
    // offer is the final position as a mate in one.
    expect(puzzle.mateIn).toBe(1)
    expect(puzzle.mateOnMove).toBe(4)

    // The offered position really is the one before Qxf7#.
    let position = rules.initialPosition()
    for (const san of ['e4', 'e5']) {
      position = rules.play(
        position,
        rules.legalMoves(position).find((move) => move.san === san)!,
      )!.position
    }
    for (const intent of SCHOLARS_FINISH.slice(0, 4)) {
      position = rules.play(position, intent)!.position
    }
    expect(puzzle.fen).toBe(position.fen)

    expect(progress).toEqual([3, 4, 5, 6, 7])
    expect(engine.disposed).toBe(true)
  })

  it('seats a full-strength attacker against a weakened defender', async () => {
    // The seats must differ. Matched strength does not get mated: at equal
    // depth the self-play games ran past 130 plies and drew on insufficient
    // material every time, so every generation attempt failed and the screen
    // could only ever say the engine composed nothing.
    const engine = new ScriptedEngine(SCHOLARS_FINISH)
    await new PuzzleGenerator(rules, () => engine, BOOK).generate(0)

    // Reconfigured every ply, because the seat changes every ply.
    expect(engine.configurations).toHaveLength(SCHOLARS_FINISH.length)

    // Seed 0 mates with White, and White delivers plies 1, 3 and 5 here.
    const kinds = engine.configurations.map((c) => c.strength.kind)
    expect(kinds).toEqual(['full', 'rated', 'full', 'rated', 'full'])

    const defender = engine.configurations[1]!
    expect(defender.strength).toMatchObject({ kind: 'rated' })
    // A defender that searches deeply enough to see the net is no defender.
    expect(defender.searchLimits.maxDepth).toBeLessThan(
      engine.configurations[0]!.searchLimits.maxDepth!,
    )
  })

  it('reseeds after a spoiled game instead of giving up', async () => {
    // First move is not legal: the first game aborts, the retry succeeds.
    const engine = new ScriptedEngine([{ from: 'a1', to: 'a1' }, ...SCHOLARS_FINISH])
    const generator = new PuzzleGenerator(rules, () => engine, [...BOOK, ...BOOK])

    const puzzle = await generator.generate(0)
    expect(puzzle.mateIn).toBe(1)
  })

  /*
   * The position a full move before the mate is only worth offering when the
   * winner's move genuinely forced it. A blunder that happened to be punished
   * would make a puzzle with no answer, so the check is the whole point.
   */
  it('offers the forced finish as a mate in two', async () => {
    const engine = new ScriptedEngine(FORCED_FINISH)
    const generator = new PuzzleGenerator(rules, () => engine, [FORCED_MATE_BOOK])

    const puzzle = await generator.generate(0)

    expect(puzzle).toEqual({
      fen: FORCED_MATE_FEN,
      mateIn: 2,
      // Thirty-two plies is White's move 16.
      mateOnMove: 16,
    })
  })

  it('refuses an opening book that is not legal', async () => {
    const generator = new PuzzleGenerator(rules, () => new ScriptedEngine([]), [['e4', 'e4']])

    await expect(generator.generate(0)).rejects.toThrow('Opening book move is not legal: e4')
  })

  it('gives up on a game that ends in anything but mate', async () => {
    // Stalemate on move ten: a finished game with no mate in it, so there is
    // no puzzle to take from it however the search went.
    const generator = new PuzzleGenerator(rules, () => new ScriptedEngine([]), [STALEMATE_BOOK])

    await expect(generator.generate(0)).rejects.toThrow('could not compose a puzzle')
  })

  it('reseeds a game that will not end rather than waiting it out', async () => {
    const marathon = longLegalOpening(221)
    // Proof the fixture is what the test claims, rather than a short game
    // that would pass for the wrong reason.
    expect(marathon).toHaveLength(221)

    const generator = new PuzzleGenerator(rules, () => new ScriptedEngine([]), [marathon])

    await expect(generator.generate(0)).rejects.toThrow('could not compose a puzzle')
    // Replaying a 221-ply book once per attempt is real work; the ceiling
    // exists precisely so the engine is not asked to play it out.
  }, 30_000)

  it('still offers a mate in one when there is no full move to look back on', async () => {
    // Real chess cannot mate inside three plies, but the generator is written
    // against the rules port, and reading past the start of the move list
    // would be a crash rather than a missing puzzle.
    const short = shortGameRules()
    const generator = new PuzzleGenerator(short.rules, () => new ScriptedEngine([]), [short.book])

    await expect(generator.generate(0)).resolves.toEqual({
      fen: short.rules.initialPosition().fen,
      mateIn: 1,
      mateOnMove: 1,
    })
  })
})
