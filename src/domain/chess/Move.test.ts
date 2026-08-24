import { describe, expect, it } from 'vitest'
import { moveNumberForPly, sameIntent } from './Move'

describe('sameIntent', () => {
  it('matches when every field agrees', () => {
    expect(
      sameIntent({ from: 'e7', to: 'e8', promotion: 'queen' }, { from: 'e7', to: 'e8', promotion: 'queen' }),
    ).toBe(true)
    // Two ordinary moves with no promotion on either side agree too.
    expect(sameIntent({ from: 'e2', to: 'e4' }, { from: 'e2', to: 'e4' })).toBe(true)
  })

  it('differs on the origin square', () => {
    expect(sameIntent({ from: 'e2', to: 'e4' }, { from: 'd2', to: 'e4' })).toBe(false)
  })

  it('differs on the destination square', () => {
    expect(sameIntent({ from: 'e2', to: 'e4' }, { from: 'e2', to: 'e3' })).toBe(false)
  })

  it('differs on the promotion piece alone', () => {
    expect(
      sameIntent({ from: 'e7', to: 'e8', promotion: 'queen' }, { from: 'e7', to: 'e8', promotion: 'rook' }),
    ).toBe(false)
  })
})

describe('moveNumberForPly', () => {
  it('pairs plies into move numbers', () => {
    expect(moveNumberForPly(1)).toBe(1)
    expect(moveNumberForPly(2)).toBe(1)
    expect(moveNumberForPly(3)).toBe(2)
    expect(moveNumberForPly(4)).toBe(2)
  })
})
