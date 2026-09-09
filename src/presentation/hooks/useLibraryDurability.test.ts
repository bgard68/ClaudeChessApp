import { describe, expect, it } from 'vitest'
import type { LibraryDurability } from '@application/ports/GameArchive'
import { describeDurability } from './useLibraryDurability'

/*
 * This is the warning that tells someone their saved games might not survive
 * closing the tab. Getting it wrong in the quiet direction — saying nothing
 * when storage is temporary — loses games with no notice at all.
 */
describe('describeDurability', () => {
  it('useLibraryDurability_BeforeTheLibraryReports_SaysNothing', () => {
    expect(describeDurability(null)).toBeNull()
  })

  it('useLibraryDurability_DurableAndPromised_SaysNothing', () => {
    expect(
      describeDurability({ kind: 'durable', evictable: false } as LibraryDurability),
    ).toBeNull()
  })

  // Storage works, but the browser has not promised to keep it. Worth one
  // gentle sentence: the games at risk are the ones it cannot rebuild.
  it('useLibraryDurability_NoBrowserPromise_MentionsEviction', () => {
    const warning = describeDurability({
      kind: 'durable',
      evictable: true,
    } as LibraryDurability)
    expect(warning).toContain('may clear them')
    expect(warning).toContain('Export them')
  })

  it('useLibraryDurability_AnotherTabHoldsTheDatabase_NamesTheOtherTab', () => {
    expect(
      describeDurability({ kind: 'temporary', reason: 'another-tab' } as LibraryDurability),
    ).toContain('Another tab')
  })

  it('useLibraryDurability_NothingWillBeKept_WarnsPlainly', () => {
    const warning = describeDurability({
      kind: 'temporary',
      reason: 'no-storage',
    } as LibraryDurability)
    expect(warning).toContain('will not keep saved games')
  })
})
