import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface ElementSize {
  readonly width: number
  readonly height: number
}

/**
 * Measures an element's rendered box.
 *
 * The board needs both dimensions, not just width: a square sized purely by the
 * space available across will run off the bottom of a laptop screen. The
 * measured element must get its height from the layout rather than from its
 * contents, or the measurement would chase itself.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    // Mobile browsers change the viewport height as their toolbars collapse,
    // which does not always resize the observed element.
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  return [ref, size]
}
