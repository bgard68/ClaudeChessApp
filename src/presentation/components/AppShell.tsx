import type { ReactNode } from 'react'
import { AppIcon, type AppIconName } from './AppIcon'

type NavigationTarget = 'setup' | 'puzzle' | 'archive'

interface AppShellProps {
  readonly active: NavigationTarget
  readonly children: ReactNode
  readonly onNavigate: (target: NavigationTarget) => void
  readonly title?: string
  readonly context?: string
}

interface NavItem {
  readonly target: NavigationTarget
  readonly label: string
  readonly shortLabel: string
  readonly icon: AppIconName
}

const navItems: readonly NavItem[] = [
  { target: 'setup', label: 'Play chess', shortLabel: 'Play', icon: 'play' },
  { target: 'puzzle', label: 'Puzzle of the day', shortLabel: 'Puzzle', icon: 'puzzle' },
  { target: 'archive', label: 'Browse championships', shortLabel: 'Archive', icon: 'trophy' },
]

/**
 * Presentation-only application chrome.
 *
 * Navigation intent and page context are injected by App. The shell therefore
 * owns visual structure and responsive navigation without reaching into game,
 * archive, engine, or persistence services.
 */
export function AppShell({
  active,
  children,
  onNavigate,
  title = pageTitle(active),
  context = 'Local chess studio',
}: AppShellProps) {
  return (
    <div className="app-shell phase46-shell" data-active={active}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="app-rail" aria-label="Primary navigation">
        <button
          type="button"
          className="app-brand"
          aria-label="ClaudeChess home"
          onClick={() => onNavigate('setup')}
        >
          <span className="app-brand__mark" aria-hidden="true">♞</span>
          <span className="app-brand__copy">
            <strong>ClaudeChess</strong>
            <small>Local chess studio</small>
          </span>
        </button>

        <nav className="app-nav">
          {navItems.map((item) => {
            const isActive = active === item.target
            return (
              <button
                key={item.target}
                type="button"
                className={`app-nav__item${isActive ? ' app-nav__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => onNavigate(item.target)}
              >
                <span className="app-nav__icon" aria-hidden="true">
                  <AppIcon name={item.icon} size={19} />
                </span>
                <span className="app-nav__label">{item.shortLabel}</span>
                <span className="app-nav__indicator" aria-hidden="true" />
              </button>
            )
          })}
        </nav>

        <div className="app-rail__footer">
          <span className="app-status-dot" aria-hidden="true" />
          <span>Offline ready</span>
        </div>
      </aside>

      <div className="app-stage">
        <header className="app-topbar">
          <div className="app-topbar__context">
            <p className="app-topbar__eyebrow">{context}</p>
            <p className="app-topbar__title">{title}</p>
          </div>
          <div className="app-topbar__meta" aria-label="Application capabilities">
            <span className="app-chip">React Chessboard v5</span>
            <span className="app-chip app-chip--accent">
              <span className="app-status-dot" aria-hidden="true" />
              Local-first
            </span>
          </div>
        </header>

        <main id="main-content" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/*
        The right rail, empty until a screen fills it.

        Rendered here rather than by the screen so it is a column of the shell
        like the left rail — full window height, flush to the edge, beside the
        top bar rather than inside the content. A screen puts its own controls
        in through a portal, which keeps that screen's state where it already
        lives while the markup lands out here.
      */}
      <aside id={RIGHT_RAIL_ID} className="app-rail app-rail--right" />
    </div>
  )
}

/** Where a screen portals its controls to reach the right rail. */
export const RIGHT_RAIL_ID = 'app-right-rail'

function pageTitle(active: NavigationTarget): string {
  switch (active) {
    case 'setup':
      return 'Play'
    case 'puzzle':
      return 'Puzzle of the day'
    case 'archive':
      return 'Browse championships'
  }
}
