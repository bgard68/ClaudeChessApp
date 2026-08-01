import { useEffect, useState } from 'react'

/**
 * The query, or null where there is nothing to ask.
 *
 * `renderToStaticMarkup` runs these screens with no DOM at all, so reaching
 * for `matchMedia` there is not a degraded answer but a thrown one — and a
 * component that only wanted to know whether it was on a phone took the whole
 * render down with it.
 */
function listFor(query: string): MediaQueryList | null {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null
}

/** Tracks a media query, so layout-dependent behaviour can follow the CSS. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => listFor(query)?.matches ?? false)

  useEffect(() => {
    const list = listFor(query)
    if (list === null) return

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    // The query may have changed since the state initialiser ran.
    setMatches(list.matches)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
