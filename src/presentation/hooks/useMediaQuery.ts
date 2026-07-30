import { useEffect, useState } from 'react'

/** Tracks a media query, so layout-dependent behaviour can follow the CSS. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    // The query may have changed since the state initialiser ran.
    setMatches(list.matches)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
