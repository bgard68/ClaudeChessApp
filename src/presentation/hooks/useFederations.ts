import { useEffect, useState } from 'react'
import { federationFor, loadFederations } from '@infrastructure/archive/federations'

export type FederationLookup = typeof federationFor

/**
 * Makes federation data available once it has loaded.
 *
 * The lookup itself is synchronous, so rows render immediately and gain their
 * flags a moment later rather than waiting on a fetch to show any games at all.
 */
export function useFederations(): FederationLookup {
  const [, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadFederations().then(() => {
      if (!cancelled) setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return federationFor
}
