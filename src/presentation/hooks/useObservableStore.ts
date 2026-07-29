import { useCallback, useSyncExternalStore } from 'react'
import type { ObservableStore } from '@application/Observable'

/**
 * Binds a use case's state into React.
 *
 * `useSyncExternalStore` is the right tool here rather than `useState` +
 * `useEffect`: the game is the source of truth and already publishes changes,
 * so React should subscribe to it, not keep a second copy in sync.
 *
 * This is the entire coupling between the application layer and React — one
 * hook, in the presentation layer, pointing inward.
 */
export function useObservableStore<T>(store: ObservableStore<T>): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store],
  )
  const getSnapshot = useCallback(() => store.state, [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
