import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { ChessBoardView } from '../components/ChessBoardView'
import { Credits } from '../components/Credits'
import { RIGHT_RAIL_ID } from '../components/AppShell'
import { ScreenHeader } from '../components/ScreenHeader'

type ColourChoice = PieceColor | 'random'

const DEFAULT_TIME_CONTROL_ID = '10+0'

interface NewGameScreenProps {
  readonly onStart: (configuration: GameConfiguration) => void
}

/** The rail is mounted by the shell, so it is only there after first paint. */
function useRightRail(): HTMLElement | null {
  const [rail, setRail] = useState<HTMLElement | null>(null)
  useEffect(() => setRail(document.getElementById(RIGHT_RAIL_ID)), [])
  return rail
}

export function NewGameScreen({ onStart }: NewGameScreenProps) {
  const rightRail = useRightRail()
  const [opponent, setOpponent] = useState<OpponentChoice>('computer')
  const [colour, setColour] = useState<ColourChoice>('white')
  const [timeControlId, setTimeControlId] = useState(DEFAULT_TIME_CONTROL_ID)
  const [difficultyId, setDifficultyId] = useState(DEFAULT_DIFFICULTY_ID)
  const [themeId, setThemeId] = useState(currentBoardTheme().id)

  const preset =
    TIME_CONTROL_PRESETS.find((candidate) => candidate.id === timeControlId) ??
    TIME_CONTROL_PRESETS[0]
  const difficulty = difficultyById(difficultyId)
  const summary = summarise(opponent, colour, difficulty.label, preset?.label ?? '')

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
    <div className="screen screen--setup phase3-setup phase46-setup">
      <ScreenHeader
        kicker="New game"
        title="Choose your match"
        description="Configure the opponent, seat, clock, and board before the first move."
      />

      <div className="setup__body">
        <section className="setup__preview" aria-labelledby="setup-preview-title">
          <div className="phase46-preview-heading">
            <div>
              <p className="phase2-kicker">Live preview</p>
              <h2 id="setup-preview-title">Your board</h2>
            </div>
            <span className="phase46-preview-badge">
              <AppIcon name={colour === 'black' ? 'flip' : 'check'} size={15} />
              {colour === 'black' ? 'Black perspective' : 'White perspective'}
            </span>
          </div>

          {/* Shows the selected seat without changing the board component's v5 contract. */}
          <div className="setup__board-frame">
            <ChessBoardView
              fen={STARTING_FEN}
              orientation={colour === 'black' ? 'black' : 'white'}
              interactive={false}
              legalMoves={[]}
            />
          </div>

          <Credits />
        </section>

      </div>

      {rightRail === null ? null : createPortal(
        <section className="setup__settings" aria-label="Game settings">
          <div className="setup__options">
            <ChipGroup label="Opponent">
              <Chip
                label="Another player"
                isSelected={opponent === 'human'}
                onSelect={() => setOpponent('human')}
              />
              <Chip
                label="Computer"
                isSelected={opponent === 'computer'}
                onSelect={() => setOpponent('computer')}
              />
              <Chip
                label="Watch it play"
                title="Computer vs computer — watch Stockfish play itself"
                isSelected={opponent === 'engines'}
                onSelect={() => setOpponent('engines')}
              />
            </ChipGroup>

            {opponent !== 'human' ? (
              <ChipGroup label="Difficulty">
                {DIFFICULTY_LEVELS.map((level) => (
                  <Chip
                    key={level.id}
                    label={level.rating === null ? 'Max' : String(level.rating)}
                    title={`${level.label} — ${level.description}`}
                    isSelected={difficultyId === level.id}
                    onSelect={() => setDifficultyId(level.id)}
                  />
                ))}
              </ChipGroup>
            ) : null}

            <ChipGroup label={opponent === 'computer' ? 'You play' : 'Board faces'}>
              <Chip
                label="White"
                isSelected={colour === 'white'}
                onSelect={() => setColour('white')}
              />
              <Chip
                label="Black"
                isSelected={colour === 'black'}
                onSelect={() => setColour('black')}
              />
              <Chip
                label="Random"
                isSelected={colour === 'random'}
                onSelect={() => setColour('random')}
              />
            </ChipGroup>

            <ChipGroup label="Clock">
              {TIME_CONTROL_PRESETS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  title={option.category}
                  isSelected={timeControlId === option.id}
                  onSelect={() => setTimeControlId(option.id)}
                />
              ))}
            </ChipGroup>

            <ChipGroup label="Board">
              {BOARD_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`setup-chip setup-chip--swatch${themeId === theme.id ? ' setup-chip--selected' : ''}`}
                  aria-pressed={themeId === theme.id}
                  aria-label={theme.label}
                  title={theme.label}
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
                </button>
              ))}
            </ChipGroup>
          </div>

          <footer className="setup__actions">
            <div className="phase46-selection-summary" aria-hidden="true">
              <span>
                <AppIcon name={opponentIcon(opponent)} size={15} />
                {opponentLabel(opponent)}
              </span>
              <span>
                <AppIcon name="clock" size={15} />
                {preset?.label ?? ''}
              </span>
              <span>
                <AppIcon name="palette" size={15} />
                {BOARD_THEMES.find((theme) => theme.id === themeId)?.label ?? 'Board'}
              </span>
            </div>
            <p id="setup-summary" className="setup__action-summary" aria-live="polite">
              {summary}
            </p>
            <button
              type="button"
              className="button button--primary button--large setup__start"
              aria-describedby="setup-summary"
              onClick={start}
            >
              <AppIcon name="play" size={18} />
              Start game
              <span className="phase46-button-arrow" aria-hidden="true">→</span>
            </button>
          </footer>

          <div className="setup__panel-credits">
            <Credits />
          </div>
        </section>,
        rightRail,
      )}
    </div>
  )
}

/**
 * One labelled row of choices, kept local because it is specific to setup.
 *
 * Replaces the boxed, numbered panel each choice used to sit in. Five panels,
 * each with a step badge, an icon, a title, a description sentence and a
 * column of full-width rows carrying a second line apiece, came to 1744px of
 * settings in a 641px column — nearly three screens of scrolling to make five
 * decisions. The label and the choices are what the decision needs; the rest
 * was chrome around it.
 */
function ChipGroup({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="setup-chip-group">
      <span className="setup-chip-group__label">{label}</span>
      <div className="setup-chip-row" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

/**
 * `title` carries what the old hint line said — the difficulty's description,
 * what "watch it play" means — as a tooltip rather than a permanent second
 * line. Present for anyone who wants it, costing no height for everyone else.
 */
function Chip({
  label,
  title,
  isSelected,
  onSelect,
}: {
  readonly label: string
  readonly title?: string
  readonly isSelected: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`setup-chip${isSelected ? ' setup-chip--selected' : ''}`}
      aria-pressed={isSelected}
      title={title}
      onClick={onSelect}
    >
      {label}
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

function opponentLabel(opponent: OpponentChoice): string {
  switch (opponent) {
    case 'human':
      return 'Local player'
    case 'computer':
      return 'Computer'
    case 'engines':
      return 'Engine match'
  }
}

function opponentIcon(opponent: OpponentChoice): AppIconName {
  switch (opponent) {
    case 'human':
      return 'user'
    case 'computer':
      return 'computer'
    case 'engines':
      return 'engines'
  }
}

function randomColour(): PieceColor {
  return Math.random() < 0.5 ? 'white' : 'black'
}
