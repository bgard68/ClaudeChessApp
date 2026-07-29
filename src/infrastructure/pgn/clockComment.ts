/**
 * `[%clk H:MM:SS]` or `[%clk H:MM:SS.s]` — the clock reading a broadcast PGN
 * records after a move. Some sources emit `MM:SS`, so the hour field is
 * optional.
 */
const CLOCK_PATTERN = /\[%clk\s+(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*\]/

/** The inverse of {@link parseClockComment}, for games this app records. */
export function formatClockComment(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `[%clk ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`
}

export function parseClockComment(comment: string): number | null {
  const match = CLOCK_PATTERN.exec(comment)
  if (match === null) return null

  const [, hoursText, minutesText, secondsText] = match
  const hours = hoursText === undefined ? 0 : Number.parseInt(hoursText, 10)
  const minutes = Number.parseInt(minutesText ?? '', 10)
  const seconds = Number.parseFloat(secondsText ?? '')

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
}
