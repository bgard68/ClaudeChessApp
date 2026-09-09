import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The module caches its fetch in module state — `loading ??= fetch(...)` —
 * so it loads once per page and never again. That is right for the app and
 * awkward for a test, which needs a different directory each time. Importing
 * fresh per test is what resets it.
 */
type Federations = typeof import('./federations')

const FIDE = {
  // A living Israeli player who happens to share the name. FIDE has no record
  // of the world champion, who died in 1995.
  'botvinnik m': { fed: 'ISR', title: 'GM', elo: 2352 },
  'carlsen m': { fed: 'NOR', title: 'GM', elo: 2839 },
  // In FIDE but not in the curated list, so the FIDE row is all there is.
  'wells p': { fed: 'ENG', title: 'GM', elo: 2318 },
  // A federation the country table does not name.
  'obscure p': { fed: 'ZZZ', title: 'IM', elo: 2100 },
  // In FIDE with no title recorded.
  'larsen b': { fed: 'DEN', title: '', elo: 1473 },
}

const load = async (
  directory: unknown = FIDE,
  { ok = true }: { ok?: boolean } = {},
): Promise<Federations> => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(directory) })),
  )
  const module = await import('./federations')
  await module.loadFederations()
  return module
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadFederations', () => {
  it('loadFederations_AskedRepeatedly_FetchesTheDirectoryOnce', async () => {
    const module = await load()
    await module.loadFederations()
    await module.loadFederations()

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  // A missing file costs flags, not function: the archive still lists every
  // game, just without a country beside the names.
  it('loadFederations_DirectoryWillNotLoad_Survives', async () => {
    const module = await load({}, { ok: false })
    expect(module.federationFor('Wells, Peter')).toBeNull()
  })

  it('loadFederations_FetchRejectsOutright_Survives', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const module = await import('./federations')
    await expect(module.loadFederations()).resolves.toBeUndefined()
    expect(module.federationFor('Wells, Peter')).toBeNull()
  })
})

describe('federationFor', () => {
  it('federationFor_BeforeTheDirectoryLoaded_KnowsNobody', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const module = await import('./federations')
    // Rows render immediately and gain their flags a moment later, rather
    // than waiting on a fetch to show any games at all.
    expect(module.federationFor('Wells, Peter')).toBeNull()
  })

  it('federationFor_PlayerNotInCuratedList_FallsBackToFide', async () => {
    const module = await load()
    expect(module.federationFor('Wells, Peter')).toEqual({
      code: 'ENG',
      country: 'England',
      title: 'GM',
    })
  })

  it('federationFor_CodeWithNoCountryName_ShowsTheCodeItself', async () => {
    const module = await load()
    expect(module.federationFor('Obscure, Player')).toEqual({
      code: 'ZZZ',
      country: 'ZZZ',
      title: 'IM',
    })
  })

  it('federationFor_UntitledPlayer_ReportsUntitledNotEmpty', async () => {
    const module = await load()
    expect(module.federationFor('Larsen, Bent')?.title).toBeNull()
  })

  it('federationFor_PlayerNeitherSourceKnows_KnowsNobody', async () => {
    const module = await load()
    expect(module.federationFor('Nobody, A')).toBeNull()
  })

  describe('when the curated list has an entry', () => {
    it('federationFor_CuratedEntry_WinsAndTranslatesToFideCode', async () => {
      const module = await load()
      // The curated list stores NO; FIDE and the UI both use NOR.
      expect(module.federationFor('Carlsen, Magnus')).toMatchObject({
        code: 'NOR',
        country: 'Norway',
      })
    })

    it('federationFor_BothSourcesAgree_TakesTheTitleFromFide', async () => {
      const module = await load()
      expect(module.federationFor('Carlsen, Magnus')?.title).toBe('GM')
    })

    /*
     * THE RULE THIS FILE EXISTS FOR.
     *
     * FIDE has no record of players who died before it kept one, so an exact
     * namesake gets matched instead — "botvinnik m" resolves to a living
     * Israeli player. The federations disagree, which is the tell, and a title
     * borrowed from a stranger would be no better than an invented one.
     *
     * The champion's own games are too old to carry a rating that would
     * expose the mistake, so nothing else would catch it.
     */
    it('federationFor_NamesakeInAnotherFederation_RefusesTheTitle', async () => {
      const module = await load()
      const botvinnik = module.federationFor('Botvinnik, Mikhail')

      expect(botvinnik).toEqual({ code: 'RUS', country: 'Russia', title: null })
      // Emphatically not the Israeli player's GM title, nor his federation.
      expect(botvinnik?.title).not.toBe('GM')
      expect(botvinnik?.code).not.toBe('ISR')
    })

    it('federationFor_FideNeverHeardOfThePlayer_StillNamesTheFederation', async () => {
      const module = await load({})
      expect(module.federationFor('Carlsen, Magnus')).toEqual({
        code: 'NOR',
        country: 'Norway',
        title: null,
      })
    })
  })

  // Both lookups behind this fold accents to their base letter, so a PGN
  // spelled either way finds the same player.
  it('federationFor_AccentedSpelling_FindsThePlayer', async () => {
    const module = await load({ 'ljubojevic l': { fed: 'SRB', title: 'GM', elo: 2571 } })
    expect(module.federationFor('Ljubojević, Ljubomir')).toEqual(
      module.federationFor('Ljubojevic, Ljubomir'),
    )
    expect(module.federationFor('Ljubojević, Ljubomir')?.title).toBe('GM')
  })
})
