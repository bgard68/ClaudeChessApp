import type { MoveIntent } from '@domain/chess/Move'
import type { Position } from '@domain/chess/Position'
import type { ChessRules } from '@domain/ports/ChessRules'
import type { ChessEngine, EngineConfiguration } from '../ports/ChessEngine'
import { moveNumberForPly } from '@domain/chess/Move'
import { matingMoves, solvesMateWithin } from './mate'
import type { GeneratedPuzzle } from './DailyPuzzle'
import { OPENING_LINES } from './openings'

/**
 * Fixed depth, full strength: depth is what makes the game replayable from
 * the same seed on the single-threaded build, and eight plies is deep enough
 * to play a coherent game while shallow enough to walk into mating nets —
 * an engine that never gets mated would compose no puzzles.
 */
const GENERATION: EngineConfiguration = {
  strength: { kind: 'full' },
  searchLimits: { moveTimeMs: 1_500, maxDepth: 8 },
}

/** A game refusing to end is a draw in the making; reseed instead of waiting. */
const MAX_PLIES = 220

const MAX_ATTEMPTS = 6

/**
 * Composes the day's puzzle by having the engine play itself.
 *
 * Chosen over shipping a puzzle database: the only data this app ships is the
 * game library, and mining that yields too few mates to fill a calendar —
 * masters resign first. Self-play delivers checkmates on demand, works
 * offline, and ships nothing at all.
 *
 * The puzzle is the position one full move before the mate fell, offered as
 * "mate in two" only when the winning move actually forced it; otherwise the
 * final position before the mate is offered as "mate in one", which the mated
 * game guarantees exists. A draw or a marathon reseeds and plays again.
 */
export class PuzzleGenerator {
  constructor(
    private readonly rules: ChessRules,
    private readonly createEngine: () => ChessEngine,
    private readonly openings: readonly (readonly string[])[] = OPENING_LINES,
  ) {}

  async generate(seed: number, onProgress?: (ply: number) => void): Promise<GeneratedPuzzle> {
    const engine = this.createEngine()
    try {
      await engine.configure(GENERATION)
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const puzzle = await this.playOneGame(engine, seed + attempt, onProgress)
        if (puzzle !== null) return puzzle
      }
      // Six decisive-or-reseeded games without a mate would be extraordinary.
      throw new Error('The engine could not compose a puzzle today. Try again.')
    } finally {
      engine.dispose()
    }
  }

  /** Plays one seeded game out; null asks the caller to reseed. */
  private async playOneGame(
    engine: ChessEngine,
    seed: number,
    onProgress?: (ply: number) => void,
  ): Promise<GeneratedPuzzle | null> {
    const line = this.openings[seed % this.openings.length]!

    // The game so far: the position before each ply, and the move played.
    const before: Position[] = []
    const played: MoveIntent[] = []
    let position = this.rules.initialPosition()
    const history: Position[] = [position]

    for (const san of line) {
      const move = this.rules.legalMoves(position).find((legal) => legal.san === san)
      if (move === undefined) throw new Error(`Opening book move is not legal: ${san}`)
      before.push(position)
      played.push(move)
      position = this.rules.play(position, move)!.position
      history.push(position)
    }

    while (this.rules.outcome(position, history).status === 'in_progress') {
      if (history.length > MAX_PLIES) return null

      let intent: MoveIntent
      try {
        intent = await engine.chooseMove(position)
      } catch {
        return null // Search abandoned: the generator was disposed mid-game.
      }
      const result = this.rules.play(position, intent)
      if (result === null) return null

      before.push(position)
      played.push(intent)
      position = result.position
      history.push(position)
      onProgress?.(played.length)
    }

    const outcome = this.rules.outcome(position, history)
    if (outcome.status !== 'decisive' || outcome.reason !== 'checkmate') return null

    const mateOnMove = moveNumberForPly(played.length)

    // One full move before the end, if the winner's move genuinely forced it.
    const start = before.length - 3
    if (start >= 0) {
      const candidate = before[start]!
      if (
        matingMoves(this.rules, candidate).length === 0 &&
        solvesMateWithin(this.rules, candidate, played[start]!, 2)
      ) {
        return { fen: candidate.fen, mateIn: 2, mateOnMove }
      }
    }

    // The mate itself is always a puzzle: the mating move exists by definition.
    return { fen: before[before.length - 1]!.fen, mateIn: 1, mateOnMove }
  }
}
