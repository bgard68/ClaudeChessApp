import type { ReactNode } from 'react'
import type { GameOutcome } from '@domain/chess/GameOutcome'
import { AppIcon } from './AppIcon'

const DRAW_REASONS: Readonly<Record<string, string>> = {
  stalemate: 'Stalemate',
  insufficient_material: 'Insufficient material',
  threefold_repetition: 'Threefold repetition',
  fifty_move_rule: 'Fifty-move rule',
  agreement: 'Agreement',
}

const DECISIVE_REASONS: Readonly<Record<string, string>> = {
  checkmate: 'by checkmate',
  timeout: 'on time',
  resignation: 'by resignation',
  unknown: '',
}

export function describeOutcome(outcome: GameOutcome): string {
  switch (outcome.status) {
    case 'in_progress':
      return ''
    case 'draw':
      return `Draw — ${DRAW_REASONS[outcome.reason] ?? outcome.reason}`
    case 'decisive': {
      const winner = outcome.winner === 'white' ? 'White' : 'Black'
      const reason = DECISIVE_REASONS[outcome.reason] ?? ''
      return reason === '' ? `${winner} won` : `${winner} won ${reason}`
    }
  }
}

export function OutcomeBanner({
  outcome,
  onNewGame,
  children,
}: {
  outcome: GameOutcome
  onNewGame?: () => void
  /** Extra actions — the moment a finished game is worth keeping is right here. */
  children?: ReactNode
}) {
  if (outcome.status === 'in_progress') return null

  return (
    <div className="outcome-banner phase46-outcome-banner" role="status">
      <span className="phase46-outcome-banner__icon" aria-hidden="true"><AppIcon name="trophy" size={20} /></span>
      <div className="phase46-outcome-banner__copy">
        <small>Game complete</small>
        <strong>{describeOutcome(outcome)}</strong>
      </div>
      <div className="outcome-banner__actions">
        {children}
        {onNewGame ? (
          <button type="button" className="button button--primary" onClick={onNewGame}>
            <AppIcon name="play" size={16} />
            New game
          </button>
        ) : null}
      </div>
    </div>
  )
}
