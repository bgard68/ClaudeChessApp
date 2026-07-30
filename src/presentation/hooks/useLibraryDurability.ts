import { useEffect, useState } from 'react'
import type { LibraryDurability } from '@application/ports/GameArchive'
import { useServices } from '../ServicesContext'

/** Null until the library has reported back. */
export function useLibraryDurability(): LibraryDurability | null {
  const { services } = useServices()
  const [durability, setDurability] = useState<LibraryDurability | null>(null)

  useEffect(() => {
    let cancelled = false
    services.archive
      .durability()
      .then((result) => {
        if (!cancelled) setDurability(result)
      })
      .catch(() => {
        if (!cancelled) setDurability({ kind: 'temporary', reason: 'no-storage' })
      })
    return () => {
      cancelled = true
    }
  }, [services.archive])

  return durability
}

/** Plain words for why a save would not last, or null when it will. */
export function describeDurability(durability: LibraryDurability | null): string | null {
  if (durability === null) return null

  if (durability.kind === 'durable') {
    // Storage works, but the browser has not promised to keep it. Worth saying
    // once, gently: the games at risk are the ones it cannot rebuild.
    return durability.evictable
      ? 'Saved games are kept on this device, but the browser may clear them if it runs short of space. Export them to keep a copy.'
      : null
  }

  return durability.reason === 'another-tab'
    ? 'Another tab has the game library open, so games saved here will not be kept.'
    : 'This browser will not keep saved games after you close the tab.'
}
