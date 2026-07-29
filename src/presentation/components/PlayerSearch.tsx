import { useEffect, useState } from 'react'
import type { PlayerSuggestion } from '@application/ports/GameArchive'
import { federationOf } from '@domain/archive/playerCountry'
import { useDebounced } from '../hooks/useDebounced'
import { useServices } from '../ServicesContext'

interface PlayerSearchProps {
  readonly term: string
  readonly onChoose: (player: PlayerSuggestion) => void
}

/**
 * Offers players matching what has been typed.
 *
 * The point is not convenience but correctness: the same person appears under
 * several spellings, so typing a name finds only some of their games. Choosing
 * from this list asks for the player, and gets all of them.
 */
export function PlayerSearch({ term, onChoose }: PlayerSearchProps) {
  const { services } = useServices()
  const query = useDebounced(term)
  const [suggestions, setSuggestions] = useState<readonly PlayerSuggestion[]>([])

  useEffect(() => {
    let cancelled = false
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }

    services.archive
      .suggestPlayers(query)
      .then((found) => {
        if (!cancelled) setSuggestions(found)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })

    return () => {
      cancelled = true
    }
  }, [services.archive, query])

  if (suggestions.length === 0) return null

  return (
    <ul className="player-suggestions">
      {suggestions.map((player) => {
        const federation = federationOf(player.name)
        return (
          <li key={player.id}>
            <button
              type="button"
              className="player-suggestion"
              onClick={() => onChoose(player)}
            >
              {federation !== null ? (
                <span className="player__flag">{federation.code}</span>
              ) : null}
              <span className="player-suggestion__name">{player.name}</span>
              <span className="player-suggestion__meta">
                {player.games.toLocaleString()} games
                {player.firstYear !== null && player.lastYear !== null
                  ? ` · ${player.firstYear}–${player.lastYear}`
                  : ''}
                {player.peakElo !== null ? ` · peak ${player.peakElo}` : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
