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
  readonly onBrowseArchive: () => void
  readonly onOpenPuzzle: () => void
}

export function NewGameScreen({ onStart, onBrowseArchive, onOpenPuzzle }: NewGameScreenProps) {
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

  return (
    <div className="screen screen--setup">
      <header className="setup__header">
        <h1>Chess</h1>
        <div className="setup__nav">
          <button type="button" className="button" onClick={onOpenPuzzle}>
            🧩 Puzzle of the day
          </button>
          <button type="button" className="button" onClick={onBrowseArchive}>
            Browse championship games
          </button>
        </div>
      </header>

      <div className="setup__body">
        <div className="setup__preview">
          {/* Shows the seat you have chosen: picking Black turns the board. */}
          <ChessBoardView
            fen={STARTING_FEN}
            orientation={colour === 'black' ? 'black' : 'white'}
            interactive={false}
            legalMoves={[]}
          />
          <p className="setup__summary">
            {summarise(opponent, colour, difficulty.label, preset?.label ?? '')}
          </p>
          <Credits />
        </div>

        <div className="setup__options">
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
            <Panel title="Difficulty">
              {DIFFICULTY_LEVELS.map((level) => (
                <Choice
                  key={level.id}
                  // The rating rides in the label rather than the hint so the
                  // levels can be compared at a glance, which is the whole point
                  // of showing a number. Maximum has none to show.
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

          <Panel title="Time control">
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
      </div>

      {/* Outside the scrolling column, so it never sits below the fold. */}
      <button
        type="button"
        className="button button--primary button--large setup__start"
        onClick={start}
      >
        Start game
      </button>
    </div>
  )
}

/** One labelled group of choices, boxed so the four decisions read separately. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>
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
  label: string
  hint?: string
  isSelected: boolean
  onSelect: () => void
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

/** Restates the four choices as one sentence, under the board. */
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
