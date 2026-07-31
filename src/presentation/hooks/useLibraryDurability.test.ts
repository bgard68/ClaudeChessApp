import { describe, expect, it } from 'vitest'
import type { LibraryDurability } from '@application/ports/GameArchive'
import { describeDurability } from './useLibraryDurability'

/*
 * This is the warning that tells someone their saved games might not survive
 * closing the tab. Getting it wrong in the quiet direction — saying nothing
 * when storage is temporary — loses games with no notice at all.
 */
describe('describeDurability', () => {
  it('says nothing before the library has reported back', () => {
    expect(describeDurability(null)).toBeNull()
  })

  it('says nothing when storage is durable and promised', () => {
    expect(
      describeDurability({ kind: 'durable', evictable: false } as LibraryDurability),
    ).toBeNull()
  })

  // Storage works, but the browser has not promised to keep it. Worth one
  // gentle sentence: the games at risk are the ones it cannot rebuild.
  it('mentions eviction when the browser has made no promise', () => {
    const warning = describeDurability({
      kind: 'durable',
      evictable: true,
    } as LibraryDurability)
    expect(warning).toContain('may clear them')
    expect(warning).toContain('Export them')
  })

  it('names the other tab when that is what is in the way', () => {
    expect(
      describeDurability({ kind: 'temporary', reason: 'another-tab' } as LibraryDurability),
    ).toContain('Another tab')
  })

  it('warns plainly when nothing will be kept at all', () => {
    const warning = describeDurability({
      kind: 'temporary',
      reason: 'no-storage',
    } as LibraryDurability)
    expect(warning).toContain('will not keep saved games')
  })
})
