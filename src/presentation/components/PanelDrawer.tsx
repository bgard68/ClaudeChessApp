import { useState, type ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'

/** Below this the panel collapses; above it, nothing about it changes. */
const PHONE = '(max-width: 620px)'

interface PanelDrawerProps {
  /** The panel classes the card would have carried as a plain section. */
  readonly className: string
  readonly title: string
  /** The count or state that sits at the right of the title row. */
  readonly note: string
  readonly children: ReactNode
}

/**
 * A panel card that becomes a drawer on a phone.
 *
 * The move list is the tallest thing in the game panel and the least often
 * read. On a 393×727 screen it pushed Resign and New game a screen and a half
 * below the board, which is why the play screen ran to two thousand pixels.
 * Collapsed it costs one row, and it opens where it stands rather than sending
 * the reader somewhere.
 *
 * Only on a phone. Above the breakpoint the list simply fits, and a disclosure
 * nobody needs is still a control they have to work out.
 */
export function PanelDrawer({ className, title, note, children }: PanelDrawerProps) {
  const isPhone = useMediaQuery(PHONE)
  const [isOpen, setOpen] = useState(false)

  if (!isPhone) {
    return (
      <section className={className}>
        <div className="phase2-section-title">
          <span>{title}</span>
          <small>{note}</small>
        </div>
        {children}
      </section>
    )
  }

  return (
    <details
      className={`${className} panel-drawer`}
      open={isOpen}
      /* Uncontrolled would reset on the next move — the play screen re-renders
         on every ply, and a drawer that shuts itself mid-game is worse than
         one that never opened. */
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="phase2-section-title panel-drawer__summary">
        <span>{title}</span>
        <small>{note}</small>
      </summary>
      {children}
    </details>
  )
}
