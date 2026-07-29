import { describe, expect, it } from 'vitest'
import {
  describeOversizeImport,
  MAX_IMPORT_BYTES,
  type ImportCandidate,
} from './importLimits'

const MB = 1024 * 1024

const file = (name: string, size: number): ImportCandidate => ({ name, size })

describe('describeOversizeImport', () => {
  it('rejects a file over the limit', () => {
    const message = describeOversizeImport(file('huge.pgn', MAX_IMPORT_BYTES + 1))

    expect(message).not.toBeNull()
    expect(message).toContain('huge.pgn')
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
