import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppIcon } from './AppIcon'

interface ScreenErrorBoundaryProps {
  readonly children: ReactNode
  /** Takes the user somewhere that works. The shell's own navigation survives
   *  this boundary, so this is a convenience rather than the only way out. */
  readonly onReset: () => void
}

interface ScreenErrorBoundaryState {
  readonly error: Error | null
}

/**
 * Keeps one screen's failure from taking the whole app down with it.
 *
 * Without a boundary anywhere in the tree, React unmounts *everything* when a
 * render throws — the result is a blank white page with no message, no
 * navigation, and nothing to say what happened or what to do. That was this
 * app's behaviour for any render-time fault on any screen, from any cause.
 *
 * The one that prompted it: `federations.ts` fetched a JSON file and cast it
 * straight to its record type, so a partial deploy or a bad build of
 * `player-federations.json` would have the archive read properties off the wrong
 * shape while rendering. That specific hole is now closed where it belongs, in
 * the loader — but a boundary is what makes the *class* survivable rather than
 * catastrophic, and the next one will come from somewhere nobody predicted.
 *
 * Placed below the shell on purpose. The rail and the title bar are outside it,
 * so a broken screen leaves the user able to navigate out rather than reload.
 *
 * React only calls this for errors thrown while *rendering*. An error inside an
 * event handler or a promise is not caught here and never was — those are the
 * `try`/`catch` and `.catch` already on every async path.
 */
export class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ScreenErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // The only record of what happened: there is no error reporting service to
    // send it to, and the message below deliberately does not print a stack at
    // somebody trying to play chess.
    console.error('A screen failed to render.', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <section className="phase46-system-state phase46-system-state--error" role="alert">
        <span className="phase46-system-state__icon" aria-hidden="true">
          <AppIcon name="warning" size={24} />
        </span>
        <div>
          <p className="phase2-kicker">Something went wrong</p>
          <h1>This screen could not be shown</h1>
          <p>
            The rest of the app still works — your saved games are stored on this
            device and are unaffected.
          </p>
          {/* The message, not the stack. It is the only clue available on a
              device nobody can attach a debugger to. */}
          <p className="notice notice--error">{error.message}</p>
          <button type="button" className="button" onClick={this.props.onReset}>
            <AppIcon name="play" size={16} />
            Start a new game
          </button>
        </div>
      </section>
    )
  }
}
