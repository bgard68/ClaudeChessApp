export type Unsubscribe = () => void

/**
 * A source of state that publishes its own changes.
 *
 * `LiveGame` and `ReplaySession` satisfy this structurally, which lets the UI
 * bind either one through a single hook instead of a near-identical hook each.
 */
export interface ObservableStore<T> {
  readonly state: T
  subscribe(listener: (value: T) => void): Unsubscribe
}

/**
 * The smallest change-notification mechanism that both long-lived use cases
 * need. Deliberately not an event bus: one value, one set of listeners, no
 * topics or wildcards to reason about.
 */
export class Observable<T> {
  private readonly listeners = new Set<(value: T) => void>()

  subscribe(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(value: T): void {
    // Copied first so a listener that unsubscribes during dispatch cannot
    // perturb the iteration.
    for (const listener of [...this.listeners]) listener(value)
  }

  clear(): void {
    this.listeners.clear()
  }
}
