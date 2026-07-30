import { opposite } from '@domain/chess/Piece'
import { EngineOpponent } from '@application/EngineOpponent'
import type { GameConfiguration } from '@application/GameConfiguration'
import { HintAdviser } from '@application/HintAdviser'
import { HumanOpponent } from '@application/HumanOpponent'
import { LiveGame } from '@application/LiveGame'
import { PuzzleGenerator } from '@application/puzzle/PuzzleGenerator'
import type { Opponent } from '@application/Opponent'
import { ReplaySession } from '@application/replay/ReplaySession'
import type { ArchivedGame } from '@domain/archive/ArchivedGame'
import type { AppServices } from './services'

/**
 * Assembles use cases from concrete parts.
 *
 * Kept out of `LiveGame` so the game itself never learns that engines,
 * workers, or difficulty settings exist — it only ever sees two opponents.
 */
export class GameFactory {
  constructor(private readonly services: AppServices) {}

  createLiveGame(configuration: GameConfiguration): LiveGame {
    const { white, black } = this.seats(configuration)

    return new LiveGame(
      { rules: this.services.rules, ticker: this.services.createTicker() },
      { white, black, timeControl: configuration.timeControl },
    )
  }

  private seats(configuration: GameConfiguration): { white: Opponent; black: Opponent } {
    // The computer playing itself: two engines, and two worker processes — each
    // seat owns its own search, so cancelling one side never interrupts the other.
    if (configuration.opponent === 'engines') {
      return {
        white: this.engineSeat(configuration, 'Stockfish (White)'),
        black: this.engineSeat(configuration, 'Stockfish (Black)'),
      }
    }

    const playerSeat = new HumanOpponent(
      configuration.opponent === 'computer' ? 'You' : seatName(configuration.playerColor),
    )
    const otherSeat: Opponent =
      configuration.opponent === 'computer'
        ? this.engineSeat(configuration, `Computer · ${configuration.difficulty.label}`)
        : new HumanOpponent(seatName(opposite(configuration.playerColor)))

    return configuration.playerColor === 'white'
      ? { white: playerSeat, black: otherSeat }
      : { white: otherSeat, black: playerSeat }
  }

  private engineSeat(configuration: GameConfiguration, name: string): Opponent {
    return new EngineOpponent(
      this.services.createEngine(),
      configuration.difficulty.configuration,
      name,
    )
  }

  createReplaySession(game: ArchivedGame): ReplaySession {
    return new ReplaySession(this.services.createTicker(), game)
  }

  createHintAdviser(): HintAdviser {
    return new HintAdviser(() => this.services.createEngine())
  }

  createPuzzleGenerator(): PuzzleGenerator {
    return new PuzzleGenerator(this.services.rules, () => this.services.createEngine())
  }
}

function seatName(color: 'white' | 'black'): string {
  return color === 'white' ? 'White' : 'Black'
}
