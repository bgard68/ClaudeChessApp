export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export type BoardFile = (typeof FILES)[number]
export type BoardRank = (typeof RANKS)[number]

/**
 * Algebraic square name. Expressed as a template literal type so an illegal
 * square is a compile error rather than a runtime surprise.
 */
export type Square = `${BoardFile}${BoardRank}`

const SQUARE_PATTERN = /^[a-h][1-8]$/

export function isSquare(value: string): value is Square {
  return SQUARE_PATTERN.test(value)
}

/** Parses a square coming from outside the domain (UI events, PGN, engine output). */
export function toSquare(value: string): Square {
  if (!isSquare(value)) {
    throw new Error(`"${value}" is not an algebraic square name`)
  }
  return value
}
