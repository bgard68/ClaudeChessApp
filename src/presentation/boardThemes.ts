/**
 * The board colour schemes a player can choose from.
 *
 * A presentation concern through and through — the game neither knows nor cares
 * what colour a square is — so this lives here rather than behind a port.
 * Persistence is plain localStorage for the same reason: a cosmetic preference
 * does not justify the ceremony of the storage layer the game archive needs.
 */

export interface BoardTheme {
  readonly id: string
  readonly label: string
  /** Square fills, as CSS colours. */
  readonly dark: string
  readonly light: string
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  { id: 'green', label: 'Green', dark: '#6d8a58', light: '#eeeed2' },
  { id: 'walnut', label: 'Walnut', dark: '#b58863', light: '#f0d9b5' },
  { id: 'ocean', label: 'Ocean', dark: '#8ca2ad', light: '#dee3e6' },
  { id: 'violet', label: 'Violet', dark: '#7d6b9e', light: '#e6e1f0' },
  { id: 'charcoal', label: 'Charcoal', dark: '#787670', light: '#d9d7d1' },
]

const DEFAULT_THEME = BOARD_THEMES[0]!

const STORAGE_KEY = 'chess.board-theme'

/** The named theme, or the default — a stored id that no longer exists must
 *  not strand the board without colours. */
export function boardThemeById(id: string | null): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME
}

/*
 * Cached so the choice holds for the session even where storage is unavailable
 * (private browsing), and so every caller gets the same object identity —
 * which is what lets the board's memoised options use the theme as a
 * dependency.
 */
let current: BoardTheme | null = null

export function currentBoardTheme(): BoardTheme {
  current ??= boardThemeById(readStoredId())
  return current
}

export function rememberBoardTheme(id: string): void {
  current = boardThemeById(id)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, current.id)
  } catch {
    // Storage denied: the choice still applies until the page is closed.
  }
}

function readStoredId(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}
