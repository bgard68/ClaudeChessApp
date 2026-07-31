import type { ReactNode } from 'react'

type NavigationTarget = 'setup' | 'puzzle' | 'archive'

interface AppShellProps {
  readonly active: NavigationTarget
  readonly children: ReactNode
  readonly onNavigate: (target: NavigationTarget) => void
}

interface NavItem {
  readonly target: NavigationTarget
  readonly label: string
  readonly icon: ReactNode
}

const navItems: readonly NavItem[] = [
  { target: 'setup', label: 'Play', icon: <PlayIcon /> },
  { target: 'puzzle', label: 'Puzzle', icon: <PuzzleIcon /> },
  { target: 'archive', label: 'Championships', icon: <TrophyIcon /> },
]

/**
 * Presentation-only application chrome.
 *
 * Navigation intent is injected by App rather than reaching into application
 * services. That keeps routing responsibility in the composition-facing App
 * while this component owns only visual structure and accessible controls.
 */
export function AppShell({ active, children, onNavigate }: AppShellProps) {
  return (
    <div className="app-shell">
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
          {navItems.map((item) => (
            <button
              key={item.target}
              type="button"
              className={`app-nav__item${active === item.target ? ' app-nav__item--active' : ''}`}
              aria-current={active === item.target ? 'page' : undefined}
              onClick={() => onNavigate(item.target)}
            >
              <span className="app-nav__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-rail__footer">
          <span className="app-status-dot" aria-hidden="true" />
          <span>Offline ready</span>
        </div>
      </aside>

      <div className="app-stage">
        <header className="app-topbar">
          <div>
            <p className="app-topbar__eyebrow">ClaudeChess</p>
            <p className="app-topbar__title">{pageTitle(active)}</p>
          </div>
          <div className="app-topbar__meta">
            <span className="app-chip">Stockfish 18</span>
            <span className="app-chip app-chip--accent">Local-first</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6v4a2 2 0 1 0 0 4v4h-4a2 2 0 1 0-4 0H3V9h4a2 2 0 1 0 0-4h2z" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v3c0 4-2 7-5 8-3-1-5-4-5-8V4zm-3 2h3v2c0 2-1 3-3 3V6zm13 0h3v5c-2 0-3-1-3-3V6zM9 18h6v2H9z" />
    </svg>
  )
}
