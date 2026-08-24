/**
 * Largest PGN accepted in one import.
 *
 * Importing reads the whole file into a string and then splits it into one
 * string per game, so peak memory is roughly twice the file size before the
 * first row is written. That is survivable; an unbounded file is not, and the
 * tab freezes with nothing on screen to explain why.
 *
 * The ceiling is set by what a *legitimate* import weighs, not by what feels
 * tidy: the largest collection this project ships is optional-careers.pgn at
 * 69 MB, so anything near 10 MB would reject the app's own data. 128 MB clears
 * that with room to spare while still catching a file chosen by mistake.
 */
export const MAX_IMPORT_BYTES = 128 * 1024 * 1024

/** The parts of `File` this policy needs — so a test need not build a real one. */
export interface ImportCandidate {
  readonly name: string
  readonly size: number
}

/**
 * Why this file cannot be imported, or `null` when it can be.
 *
 * Returns the message rather than throwing: a file that is too large is an
 * ordinary thing for someone to pick, and the screen already has somewhere to
 * put an explanation.
 */
export function describeOversizeImport(file: ImportCandidate): string | null {
  if (file.size <= MAX_IMPORT_BYTES) return null

  return (
    `${file.name} is ${formatBytes(file.size)}, and the most that can be ` +
    `imported at once is ${formatBytes(MAX_IMPORT_BYTES)}. ` +
    'Split it into smaller files and import them one at a time.'
  )
}

/** Sizes a person can compare at a glance, not exact byte counts. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  // The smaller units are kept for the day the ceiling is lowered: both
  // callers pass a figure at or above MAX_IMPORT_BYTES today, so nothing here
  // can currently be under 128 MB — but a "0.0 MB" would read as a bug.
  /* v8 ignore start -- unreachable while MAX_IMPORT_BYTES is 128 MB */
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`
  /* v8 ignore stop */
}
