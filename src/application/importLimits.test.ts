import { describe, expect, it } from 'vitest'
import {
  describeOversizeImport,
  MAX_IMPORT_BYTES,
  type ImportCandidate,
} from './importLimits'

const MB = 1024 * 1024

const file = (name: string, size: number): ImportCandidate => ({ name, size })

describe('describeOversizeImport', () => {
  /*
   * The whole message, not just that one exists: this is the only thing the
   * user sees when an import is refused, and "not null" would pass for an
   * empty string as readily as for a sentence that explains itself.
   *
   * Both figures read "128 MB" one byte over the limit, because the size is
   * rounded for people rather than reported exactly. Worth knowing about; it
   * is the boundary case, not the one anybody actually hits.
   */
  it('rejects a file one byte over the limit, and explains why', () => {
    const message = describeOversizeImport(file('huge.pgn', MAX_IMPORT_BYTES + 1))

    expect(message).toBe(
      'huge.pgn is 128 MB, and the most that can be imported at once is 128 MB. ' +
        'Split it into smaller files and import them one at a time.',
    )
  })

  it('accepts a file at exactly the limit', () => {
    expect(describeOversizeImport(file('edge.pgn', MAX_IMPORT_BYTES))).toBeNull()
  })

  it('accepts the largest collection this project ships', () => {
    // optional-careers.pgn is 69 MB. A limit that rejects it would block the
    // app's own data, which is the mistake this test exists to catch.
    expect(describeOversizeImport(file('optional-careers.pgn', 69 * MB))).toBeNull()
  })

  it('accepts an empty file, which is the parser problem, not this one', () => {
    expect(describeOversizeImport(file('empty.pgn', 0))).toBeNull()
  })

  it('names both the file size and the limit, so the number is not a mystery', () => {
    const message = describeOversizeImport(file('careers.pgn', 300 * MB))

    expect(message).toContain('300 MB')
    expect(message).toContain('128 MB')
  })
})
