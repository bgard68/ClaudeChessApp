import { useState, type ReactNode } from 'react'
import type { PieceColor } from '@domain/chess/Piece'
import { STARTING_FEN } from '@domain/chess/Position'
import { TIME_CONTROL_PRESETS, type TimeControlPreset } from '@domain/clock/TimeControl'
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
import { ScreenHeader } from '../components/ScreenHeader'

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
        actions={
          <>
            <button type="button" className="button" onClick={onOpenPuzzle}>
              <AppIcon name="puzzle" size={17} />
              Puzzle of the day
            </button>
            <button type="button" className="button" onClick={onBrowseArchive}>
              <AppIcon name="trophy" size={17} />
              Browse championships
            </button>
          </>
        }
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
          <p id="setup-summary" className="setup__summary" aria-live="polite">
            {summary}
          </p>
          <Credits />
        </section>

        <section className="setup__settings" aria-label="Game settings">
          <div className="setup__settings-heading">
            <div>
              <p className="phase2-kicker">Game settings</p>
              <h2>Ready your board</h2>
            </div>
            <span className="setup__step-count">5 choices</span>
          </div>

          <div className="setup__options">
            <Panel
              index={1}
              title="Opponent"
              description="Choose who controls the other side."
              icon="computer"
            >
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
              <Panel
                index={2}
                title="Difficulty"
                description="Tune Stockfish for the kind of game you want."
                icon="sparkles"
              >
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

            <Panel
              index={opponent === 'human' ? 2 : 3}
              title={opponent === 'computer' ? 'Your colour' : 'Board faces'}
              description="Set the opening orientation."
              icon="user"
            >
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

            <Panel
              index={opponent === 'human' ? 3 : 4}
              title="Time control"
              description="Pick a relaxed game or a faster test."
              icon="clock"
            >
              {groupByCategory(TIME_CONTROL_PRESETS).map(([category, presets]) => (
                <div className="time-group" key={category}>
                  <span className="time-group__label">{category}</span>
                  <div className="time-group__options" role="group" aria-label={category}>
                    {presets.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`time-chip${
                          timeControlId === option.id ? ' time-chip--selected' : ''
                        }`}
                        aria-pressed={timeControlId === option.id}
                        onClick={() => setTimeControlId(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Panel>

            <Panel
              index={opponent === 'human' ? 4 : 5}
              title="Board colours"
              description="Choose a board theme for every game screen."
              icon="palette"
            >
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
                  <SelectedMark selected={themeId === theme.id} />
                </button>
              ))}
            </Panel>
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
            <p className="setup__action-summary">{summary}</p>
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
        </section>
      </div>
    </div>
  )
}

/** One labelled group of choices, kept local because it is specific to setup. */
function Panel({
  index,
  title,
  description,
  icon,
  children,
}: {
  readonly index: number
  readonly title: string
  readonly description: string
  readonly icon: AppIconName
  readonly children: ReactNode
}) {
  return (
    <section className="panel phase46-choice-panel">
      <header className="phase46-choice-panel__heading">
        <span className="phase46-choice-panel__step" aria-hidden="true">{index}</span>
        <span className="phase46-choice-panel__icon" aria-hidden="true">
          <AppIcon name={icon} size={17} />
        </span>
        <span>
          <h3 className="panel__title">{title}</h3>
          <small>{description}</small>
        </span>
      </header>
      <div className="panel__options" role="group" aria-label={title}>
        {children}
      </div>
    </section>
  )
}

/**
 * The presets in category order, each category once.
 *
 * The category was previously repeated as a hint under all ten labels, which
 * said "Blitz" three times in a row and made the tallest panel on the screen.
 * Stated once per group, the labels themselves fit several to a line.
 */
function groupByCategory(
  presets: readonly TimeControlPreset[],
): readonly (readonly [string, readonly TimeControlPreset[]])[] {
  const groups = new Map<string, TimeControlPreset[]>()
  for (const preset of presets) {
    const existing = groups.get(preset.category)
    if (existing === undefined) groups.set(preset.category, [preset])
    else existing.push(preset)
  }
  return [...groups]
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
      <span className="choice__copy">
        <span className="choice__label">{label}</span>
        {hint ? <span className="choice__hint">{hint}</span> : null}
      </span>
      <SelectedMark selected={isSelected} />
    </button>
  )
}

function SelectedMark({ selected }: { readonly selected: boolean }) {
  return (
    <span className="phase46-selected-mark" aria-hidden="true">
      {selected ? <AppIcon name="check" size={13} /> : null}
    </span>
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
