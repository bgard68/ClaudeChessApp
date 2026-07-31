import { useState, type ReactNode } from 'react'
import type { PieceColor } from '@domain/chess/Piece'
import { STARTING_FEN } from '@domain/chess/Position'
import { TIME_CONTROL_PRESETS } from '@domain/clock/TimeControl'
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTY_LEVELS,
  difficultyById,
} from '@application/Difficulty'
import type { GameConfiguration, OpponentChoice } from '@application/GameConfiguration'
import { BOARD_THEMES, currentBoardTheme, rememberBoardTheme } from '../boardThemes'
import { ChessBoardView } from '../components/ChessBoardView'
import { Credits } from '../components/Credits'

type ColourChoice = PieceColor | 'random'

const DEFAULT_TIME_CONTROL_ID = '10+0'

interface NewGameScreenProps {
  readonly onStart: (configuration: GameConfiguration) => void
}

/**
 * Coordinates the new-game form and translates presentation choices into the
 * application-layer GameConfiguration contract.
 *
 * The screen owns only temporary UI state. Game creation remains in App and
 * the composition root, so this component never names a concrete opponent,
 * engine, clock, rules implementation, or storage adapter.
 */
export function NewGameScreen({ onStart }: NewGameScreenProps) {
  const [opponent, setOpponent] = useState<OpponentChoice>('computer')
  const [colour, setColour] = useState<ColourChoice>('white')
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL_ID)
  const [difficultyId, setDifficultyId] = useState(DEFAULT_DIFFICULTY_ID)
  const [themeId, setThemeId] = useState(currentBoardTheme().id)

  const preset =
    TIME_CONTROL_PRESETS.find((candidate) => candidate.id === timeControlId) ??
    TIME_CONTROL_PRESETS[0]
  const difficulty = difficultyById(difficultyId)

  const start = () => {
    if (preset === undefined) return
    onStart({
      opponent,
      playerColor: colour === 'random' ? randomColour() : colour,
      timeControl: preset.control,
      difficulty,
    })
  }

  const summary = summarise(opponent, colour, difficulty.label, preset?.label ?? '')

  return (
    <div className="screen screen--setup phase2-setup">
      <header className="phase2-setup__intro">
        <div>
          <p className="phase2-kicker">New game</p>
          <h1>Choose how you want to play</h1>
          <p>Configure the opponent, board, and clock before the first move.</p>
        </div>
      </header>

      <div className="phase2-setup__layout">
        <section className="phase2-setup__preview-card" aria-label="Board preview">
          <div className="phase2-setup__board">
            {/* The preview uses the same react-chessboard v5 wrapper as play,
                puzzle, archive preview, and replay. The wrapper remains mounted
                on the first commit to preserve its measured-container lifecycle. */}
            <ChessBoardView
              fen={STARTING_FEN}
              orientation={colour === 'black' ? 'black' : 'white'}
              interactive={false}
              legalMoves={[]}
            />
          </div>

          <div className="phase2-setup__summary">
            <span className="phase2-setup__summary-label">Current setup</span>
            <strong>{summary}</strong>
          </div>

          <Credits />
        </section>

        <aside className="phase2-setup__configuration" aria-label="Game settings">
          <header className="phase2-setup__configuration-header">
            <div>
              <p className="phase2-kicker">Game settings</p>
              <h2>Prepare the board</h2>
            </div>
            <span className="phase2-step-pill">5 choices</span>
          </header>

          <div className="phase2-setup__configuration-scroll">
            <Panel title="Opponent">
              <Choice
                label="Another player"
                hint="Share this device"
                isSelected={opponent === 'human'}
                onSelect={() => setOpponent('human')}
              />
              <Choice
                label="Computer"
                hint="Stockfish, offline"
                isSelected={opponent === 'computer'}
                onSelect={() => setOpponent('computer')}
              />
              <Choice
                label="Computer vs computer"
                hint="Watch Stockfish play itself"
                isSelected={opponent === 'engines'}
                onSelect={() => setOpponent('engines')}
              />
            </Panel>

            {opponent !== 'human' ? (
              <Panel title="Difficulty" wide>
                {DIFFICULTY_LEVELS.map((level) => (
                  <Choice
                    key={level.id}
                    label={level.rating === null ? level.label : `${level.label} · ${level.rating}`}
                    hint={level.description}
                    isSelected={difficultyId === level.id}
                    onSelect={() => setDifficultyId(level.id)}
                  />
                ))}
              </Panel>
            ) : null}

            <Panel title={opponent === 'computer' ? 'Your colour' : 'Board faces'}>
              <Choice
                label="White"
                isSelected={colour === 'white'}
                onSelect={() => setColour('white')}
              />
              <Choice
                label="Black"
                isSelected={colour === 'black'}
                onSelect={() => setColour('black')}
              />
              <Choice
                label="Random"
                isSelected={colour === 'random'}
                onSelect={() => setColour('random')}
              />
            </Panel>

            <Panel title="Time control" wide>
              {TIME_CONTROL_PRESETS.map((option) => (
                <Choice
                  key={option.id}
                  label={option.label}
                  hint={option.category}
                  isSelected={timeControlId === option.id}
                  onSelect={() => setTimeControlId(option.id)}
                />
              ))}
            </Panel>

            <Panel title="Board colours">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`choice choice--swatch${themeId === theme.id ? ' choice--selected' : ''}`}
                  aria-pressed={themeId === theme.id}
                  onClick={() => {
                    rememberBoardTheme(theme.id)
                    setThemeId(theme.id)
                  }}
                >
                  <span className="swatch" aria-hidden="true">
                    <i style={{ background: theme.light }} />
                    <i style={{ background: theme.dark }} />
                    <i style={{ background: theme.dark }} />
                    <i style={{ background: theme.light }} />
                  </span>
                  <span className="choice__label">{theme.label}</span>
                </button>
              ))}
            </Panel>
          </div>

          <footer className="phase2-setup__configuration-footer">
            <button
              type="button"
              className="button button--primary button--large setup__start"
              onClick={start}
            >
              Start game
            </button>
          </footer>
        </aside>
      </div>
    </div>
  )
}

/** A labelled group of mutually comparable choices. */
function Panel({
  title,
  wide = false,
  children,
}: {
  readonly title: string
  readonly wide?: boolean
  readonly children: ReactNode
}) {
  return (
    <section className={`panel${wide ? ' panel--wide' : ''}`}>
      <h3 className="panel__title">{title}</h3>
      <div className="panel__options" role="group" aria-label={title}>
        {children}
      </div>
    </section>
  )
}

function Choice({
  label,
  hint,
  isSelected,
  onSelect,
}: {
  readonly label: string
  readonly hint?: string
  readonly isSelected: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`choice${isSelected ? ' choice--selected' : ''}`}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <span className="choice__label">{label}</span>
      {hint ? <span className="choice__hint">{hint}</span> : null}
    </button>
  )
}

function summarise(
  opponent: OpponentChoice,
  colour: ColourChoice,
  difficultyLabel: string,
  timeLabel: string,
): string {
  if (opponent === 'engines') {
    return `Stockfish vs Stockfish · ${difficultyLabel} · ${timeLabel}`
  }

  const seat =
    colour === 'random'
      ? 'Colour drawn at random'
      : `You play ${colour === 'white' ? 'White' : 'Black'}`
  const against =
    opponent === 'computer' ? `Computer · ${difficultyLabel}` : 'Two players, one device'

  return `${seat} · ${against} · ${timeLabel}`
}

function randomColour(): PieceColor {
  return Math.random() < 0.5 ? 'white' : 'black'
}
