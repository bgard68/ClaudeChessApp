import { useState } from 'react'

/**
 * Who the games and the engine came from.
 *
 * Collapsed by default: it is an acknowledgement, not something anyone opens
 * the app to read. It exists because the app redistributes other people's work
 * — the engine under GPL-3.0, and three collections of games gathered by other
 * people — and saying so plainly is both the decent thing and the cheapest
 * answer to anyone wondering where the data came from.
 */
export function Credits() {
  const [open, setOpen] = useState(false)

  return (
    <div className="credits">
      <button
        type="button"
        className="credits__toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        Credits and licences
      </button>

      {open ? (
        <div className="credits__body">
          <p>
            Championship games from{' '}
            <a href="https://github.com/mainali123/Chess-Dataset" target="_blank" rel="noreferrer">
              mainali123/Chess-Dataset
            </a>
            . Famous games and title matches since 2008 from{' '}
            <a href="https://www.pgnmentor.com" target="_blank" rel="noreferrer">
              pgnmentor.com
            </a>
            . Player federations and titles derived from{' '}
            <a href="https://ratings.fide.com" target="_blank" rel="noreferrer">
              FIDE&rsquo;s rating list
            </a>
            . Game scores are factual records; the collections are the work of
            those who assembled them.
          </p>
          <p>
            Play by{' '}
            <a
              href="https://github.com/official-stockfish/Stockfish"
              target="_blank"
              rel="noreferrer"
            >
              Stockfish
            </a>
            , compiled to WebAssembly by{' '}
            <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
              stockfish.js
            </a>
            , redistributed unmodified under the{' '}
            <a href="/engine/LICENSE-stockfish.txt" target="_blank" rel="noreferrer">
              GNU GPL v3
            </a>
            .
          </p>
          <p className="credits__note">
            Not affiliated with any of the above. This app is free, runs entirely
            in your browser, and sends nothing anywhere.
          </p>
        </div>
      ) : null}
    </div>
  )
}
