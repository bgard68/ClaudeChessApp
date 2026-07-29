import { useEffect, useState } from 'react'

/**
 * Holds a value back until it stops changing.
 *
 * Typing "carlsen" fired seven queries, each scanning every row in the library.
 * Only the last of them was ever wanted.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
