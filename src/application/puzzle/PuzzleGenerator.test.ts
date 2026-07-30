import { describe, expect, it } from 'vitest'
import type { MoveIntent } from '@domain/chess/Move'
import type { ChessEngine, EngineConfiguration } from '../ports/ChessEngine'
import { ChessJsRules } from '@infrastructure/chess/ChessJsRules'
import { PuzzleGenerator } from './PuzzleGenerator'

const rules = new ChessJsRules()

/** Plays a fixed script of moves, whatever it is asked. */
class ScriptedEngine implements ChessEngine {
  configureCalls = 0
  disposed = false
  private index = 0

  constructor(private readonly moves: readonly MoveIntent[]) {}

  init(): Promise<void> {
    return Promise.resolve()
  }

  configure(_configuration: EngineConfiguration): Promise<void> {
    this.configureCalls += 1
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
    expect(engine.configureCalls).toBe(1)
    expect(engine.disposed).toBe(true)
  })

  it('reseeds after a spoiled game instead of giving up', async () => {
    // First move is not legal: the first game aborts, the retry succeeds.
    const engine = new ScriptedEngine([{ from: 'a1', to: 'a1' }, ...SCHOLARS_FINISH])
    const generator = new PuzzleGenerator(rules, () => engine, [...BOOK, ...BOOK])

    const puzzle = await generator.generate(0)
    expect(puzzle.mateIn).toBe(1)
  })
})
