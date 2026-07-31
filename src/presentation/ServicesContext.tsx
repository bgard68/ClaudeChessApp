import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { GameFactory } from '@composition/GameFactory'
import { getAppServices, type AppServices } from '@composition/services'

interface ServicesValue {
  readonly services: AppServices
  readonly factory: GameFactory
}

const ServicesContext = createContext<ServicesValue | null>(null)

/**
 * Injects the composed services into the component tree.
 *
 * React context is used purely as the delivery mechanism for dependencies that
 * were already wired in the composition root — components ask for what they
 * need instead of importing concrete classes.
 */
export function ServicesProvider({
  children,
  value,
}: {
  children: ReactNode
  /**
   * Stand-in services, for tests. Left unset by the app, which composes the
   * real ones below — a provider that can only ever build its own dependencies
   * is not injecting them, and opening a real database is not something a test
   * of a screen should have to do.
   */
  value?: ServicesValue
}) {
  const resolved = useMemo<ServicesValue>(() => {
    if (value !== undefined) return value
    // `getAppServices` is idempotent, so a second render — StrictMode does
    // exactly that — cannot open a second database connection.
    const services = getAppServices()
    return { services, factory: new GameFactory(services) }
  }, [value])

  return <ServicesContext.Provider value={resolved}>{children}</ServicesContext.Provider>
}

export function useServices(): ServicesValue {
  const value = useContext(ServicesContext)
  if (value === null) {
    throw new Error('useServices must be used inside a <ServicesProvider>')
  }
  return value
}
