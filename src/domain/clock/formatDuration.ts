/**
 * Renders a clock reading. Below one minute the display switches to tenths,
 * which is the convention players expect when a flag is close.
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '∞'

  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (safeMs < 60_000) {
    const tenths = Math.floor((safeMs % 1000) / 100)
    return `${seconds}.${tenths}`
  }

  const paddedSeconds = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }
  return `${minutes}:${paddedSeconds}`
}
