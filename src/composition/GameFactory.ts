import { opposite } from '@domain/chess/Piece'
import { EngineOpponent } from '@application/EngineOpponent'
import type { GameConfiguration } from '@application/GameConfiguration'
import { HumanOpponent } from '@application/HumanOpponent'
import { LiveGame } from '@application/LiveGame'
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
    const playerSeat = new HumanOpponent(
      configuration.opponent === 'computer' ? 'You' : seatName(configuration.playerColor),
    )
    const otherSeat: Opponent =
      configuration.opponent === 'computer'
        ? new EngineOpponent(
            this.services.createEngine(),
            configuration.difficulty.configuration,
            `Computer · ${configuration.difficulty.label}`,
          )
        : new HumanOpponent(seatName(opposite(configuration.playerColor)))

    const white = configuration.playerColor === 'white' ? playerSeat : otherSeat
    const black = configuration.playerColor === 'white' ? otherSeat : playerSeat

    return new LiveGame(
      { rules: this.services.rules, ticker: this.services.createTicker() },
      { white, black, timeControl: configuration.timeControl },
    )
  }

  createReplaySession(game: ArchivedGame): ReplaySession {
    return new ReplaySession(this.services.createTicker(), game)
  }
}

function seatName(color: 'white' | 'black'): string {
  return color === 'white' ? 'White' : 'Black'
}
