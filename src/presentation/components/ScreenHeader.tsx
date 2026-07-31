import type { ReactNode } from 'react'
import { AppIcon } from './AppIcon'

interface ScreenHeaderProps {
  readonly kicker: string
  readonly title: string
  readonly description?: string
  readonly onBack?: () => void
  readonly backLabel?: string
  readonly actions?: ReactNode
  readonly metrics?: ReactNode
}

/**
 * Shared page-heading structure for presentation screens.
 *
 * It owns only semantic and visual composition. Navigation remains injected by
 * the parent, so the component has no knowledge of routes, services, or game
 * state.
 */
export function ScreenHeader({
  kicker,
  title,
  description,
  onBack,
  backLabel = 'Back',
  actions,
  metrics,
}: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header__leading">
        {onBack ? (
          <button type="button" className="phase2-back-button" onClick={onBack}>
            <AppIcon name="arrow-left" size={16} />
            <span>{backLabel}</span>
          </button>
        ) : null}
        <div className="screen-header__copy">
          <p className="phase2-kicker">{kicker}</p>
          <h1>{title}</h1>
          {description ? <p className="screen-header__description">{description}</p> : null}
        </div>
      </div>

      {metrics ? <div className="screen-header__metrics">{metrics}</div> : null}
      {actions ? <div className="screen-header__actions">{actions}</div> : null}
    </header>
  )
}
