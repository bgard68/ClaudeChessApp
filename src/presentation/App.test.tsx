import { describe, expect, it } from 'vitest'
import { VIEW_CHROME } from './App'

/*
 * The screens themselves need services — a database, a worker — which a test
 * of the chrome has no business opening. What is tested here is the table that
 * decides what the shell says and which nav item reads as current, which is
 * where that was previously decided three times over.
 */

describe('VIEW_CHROME', () => {
  it('chrome_EveryView_HasATitleContextAndNavTarget', () => {
    // The compiler already requires every key; this catches an entry filled in
    // with an empty string to satisfy it.
    for (const [name, chrome] of Object.entries(VIEW_CHROME)) {
      expect(chrome.title, name).not.toBe('')
      expect(chrome.context, name).not.toBe('')
      expect(chrome.shell, name).toBeTruthy()
    }
  })

  /*
   * The regression this table exists for. The ternary chain it replaced named
   * `archive`, `replay` and `puzzle` and let everything else fall through to
   * `setup`, so the "My games" nav item was never the current one — it drew
   * unhighlighted and carried no `aria-current` while its own screen was up,
   * and "Play chess" claimed the page instead.
   */
  it('navTarget_MyGames_HighlightsItsOwnNavItem', () => {
    expect(VIEW_CHROME.mine.shell).toBe('mine')
  })

  it('navTarget_ReplayAndItsLoadingStates_StayUnderTheArchive', () => {
    // A replay is reached from the archive and the error view offers a way
    // back to it, so the archive is what the rail should be showing.
    expect(VIEW_CHROME.replay.shell).toBe('archive')
    expect(VIEW_CHROME.loading.shell).toBe('archive')
    expect(VIEW_CHROME.error.shell).toBe('archive')
  })

  it('navTarget_PlayingAGame_StaysUnderPlay', () => {
    expect(VIEW_CHROME.setup.shell).toBe('setup')
    expect(VIEW_CHROME.play.shell).toBe('setup')
  })
})
