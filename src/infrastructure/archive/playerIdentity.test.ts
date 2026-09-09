import { describe, expect, it } from 'vitest'
import { identityKey, mergePlayers, type NameCount } from './playerIdentity'

const row = (
  name: string,
  games: number,
  firstYear: number | null = 2000,
  lastYear: number | null = 2010,
  peakElo: number | null = null,
): NameCount => ({ name, games, firstYear, lastYear, peakElo })

describe('identityKey', () => {
  it('identityKey_FullName_ReducesToSurnameAndFirstInitial', () => {
    expect(identityKey('Anand,V')).toBe('anand v')
    expect(identityKey('Anand, Viswanathan')).toBe('anand v')
    expect(identityKey('Carlsen,M')).toBe('carlsen m')
  })

  it('identityKey_DifferentForenames_AreKeptApart', () => {
    expect(identityKey('Fischer, Robert James')).not.toBe(identityKey('Fischer,Gert'))
  })

  it('identityKey_ArchivePunctuation_Survives', () => {
    expect(identityKey('Fischer, Robert J.')).toBe('fischer r')
    expect(identityKey('Nakamura,Hi')).toBe('nakamura h')
  })

  it('identityKey_SurnameAlone_Copes', () => {
    expect(identityKey('Zukertort')).toBe('zukertort')
  })

  /*
   * The point of the key is that two spellings of one player produce it, and
   * an accent is one of the ways these files disagree — the same person is
   * "Ljubojevic" in one collection and "Ljubojević" in another.
   *
   * Replacing the accented letter with a space, as this once did, split them
   * into two players: "ljubojevi l" and "ljubojevic l". It also missed the
   * FIDE directory, whose 120 keys are all ASCII.
   */
  it.each([
    ['Ljubojević, Ljubomir', 'Ljubojevic, Ljubomir'],
    ['Réti, Richard', 'Reti, Richard'],
    ['Đurić, Stefan', 'Duric, Stefan'],
    ['Polgár, Judit', 'Polgar, Judit'],
  ])('identityKey_%s_MatchesThePlainSpelling', (accented, plain) => {
    expect(identityKey(accented)).toBe(identityKey(plain))
  })

  it('identityKey_AccentedName_FoldsToTheAsciiSpelling', () => {
    // The directory is keyed in ASCII, so the folded form has to be the one
    // that is actually in it.
    expect(identityKey('Ljubojević, Ljubomir')).toBe('ljubojevic l')
  })
})

describe('mergePlayers', () => {
  it('mergePlayers_AbbreviatedAndFullSpellings_FoldIntoOnePlayer', () => {
    const players = mergePlayers([
      row('Anand,V', 2_932),
      row('Anand, Viswanathan', 1_325),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]!.games).toBe(4_257)
    expect(players[0]!.aliases).toHaveLength(2)
  })

  it('mergePlayers_SeveralSpellings_DisplaysTheFullest', () => {
    const players = mergePlayers([row('Anand,V', 2_932), row('Anand, Viswanathan', 1_325)])
    expect(players[0]!.canonical).toBe('Anand, Viswanathan')
  })

  it('mergePlayers_SameSurnameDifferentPeople_AreKeptApart', () => {
    const players = mergePlayers([
      row('Fischer, Robert James', 827),
      row('Fischer,Gert', 2),
      row('Fischer,Daniel', 1),
    ])

    expect(players).toHaveLength(3)
  })

  it('mergePlayers_CareerTooLongForOnePerson_RefusesToMerge', () => {
    // Two different "Smith,J" a century apart must not become one player.
    const players = mergePlayers([
      row('Smith,J', 10, 1890, 1900),
      row('Smith, John', 10, 1990, 2000),
    ])

    expect(players).toHaveLength(2)
  })

  it('mergePlayers_PlausiblyOneCareer_Merges', () => {
    const players = mergePlayers([
      row('Karpov,A', 100, 1970, 1990),
      row('Karpov, Anatoly', 50, 1985, 2005),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]!.firstYear).toBe(1970)
    expect(players[0]!.lastYear).toBe(2005)
  })

  it('mergePlayers_SeveralSpellings_TakesTheHighestRatingSeen', () => {
    const players = mergePlayers([
      row('Carlsen,M', 100, 2001, 2010, 2810),
      row('Carlsen, Magnus', 9, 2011, 2020, 2882),
    ])

    expect(players[0]!.peakElo).toBe(2882)
  })

  it('mergePlayers_Output_OrdersPlayersByAppearanceCount', () => {
    const players = mergePlayers([row('Minor,X', 3), row('Major,Y', 900)])
    expect(players.map((p) => p.canonical)).toEqual(['Major,Y', 'Minor,X'])
  })
})

/*
 * Added by the mutation audit: the spelling tie-break had no witness. When two
 * spellings tie on forename and total length, the first one seen wins — an
 * arbitrary rule, but a *stable* one, and stability is what keeps the display
 * name from flapping between rebuilds of the player index.
 */
describe('preferred spelling ties', () => {
  it('mergePlayers_TwoSpellingsTiedOnEveryLength_KeepsTheFirstSeen', () => {
    const rows = [row('Smith, Al', 3, 1980, 1990), row('Smith, Ab', 3, 1980, 1990)]

    const players = mergePlayers(rows)

    expect(players).toHaveLength(1)
    expect(players[0]?.canonical).toBe('Smith, Al')
  })
})
