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
export function ServicesProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ServicesValue>(() => {
    // `getAppServices` is idempotent, so a second render — StrictMode does
    // exactly that — cannot open a second database connection.
    const services = getAppServices()
    return { services, factory: new GameFactory(services) }
  }, [])

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>
}

export function useServices(): ServicesValue {
  const value = useContext(ServicesContext)
  if (value === null) {
    throw new Error('useServices must be used inside a <ServicesProvider>')
  }
  return value
}
