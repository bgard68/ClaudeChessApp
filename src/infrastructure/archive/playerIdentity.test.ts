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
  it('reduces a name to surname and first initial', () => {
    expect(identityKey('Anand,V')).toBe('anand v')
    expect(identityKey('Anand, Viswanathan')).toBe('anand v')
    expect(identityKey('Carlsen,M')).toBe('carlsen m')
  })

  it('keeps different forenames apart', () => {
    expect(identityKey('Fischer, Robert James')).not.toBe(identityKey('Fischer,Gert'))
  })

  it('survives the punctuation these files use', () => {
    expect(identityKey('Fischer, Robert J.')).toBe('fischer r')
    expect(identityKey('Nakamura,Hi')).toBe('nakamura h')
  })

  it('copes with a surname alone', () => {
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
  ])('gives %s the same key as its plain spelling', (accented, plain) => {
    expect(identityKey(accented)).toBe(identityKey(plain))
  })

  it('folds to the ASCII spelling, not merely to something consistent', () => {
    // The directory is keyed in ASCII, so the folded form has to be the one
    // that is actually in it.
    expect(identityKey('Ljubojević, Ljubomir')).toBe('ljubojevic l')
  })
})

describe('mergePlayers', () => {
  it('folds abbreviated and full spellings into one player', () => {
    const players = mergePlayers([
      row('Anand,V', 2_932),
      row('Anand, Viswanathan', 1_325),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]!.games).toBe(4_257)
    expect(players[0]!.aliases).toHaveLength(2)
  })

  it('displays the fullest spelling', () => {
    const players = mergePlayers([row('Anand,V', 2_932), row('Anand, Viswanathan', 1_325)])
    expect(players[0]!.canonical).toBe('Anand, Viswanathan')
  })

  it('keeps different people with the same surname apart', () => {
    const players = mergePlayers([
      row('Fischer, Robert James', 827),
      row('Fischer,Gert', 2),
      row('Fischer,Daniel', 1),
    ])

    expect(players).toHaveLength(3)
  })

  it('refuses to merge a career too long for one person', () => {
    // Two different "Smith,J" a century apart must not become one player.
    const players = mergePlayers([
      row('Smith,J', 10, 1890, 1900),
      row('Smith, John', 10, 1990, 2000),
    ])

    expect(players).toHaveLength(2)
  })

  it('merges when the years plausibly belong to one career', () => {
    const players = mergePlayers([
      row('Karpov,A', 100, 1970, 1990),
      row('Karpov, Anatoly', 50, 1985, 2005),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]!.firstYear).toBe(1970)
    expect(players[0]!.lastYear).toBe(2005)
  })

  it('takes the highest rating seen across spellings', () => {
    const players = mergePlayers([
      row('Carlsen,M', 100, 2001, 2010, 2810),
      row('Carlsen, Magnus', 9, 2011, 2020, 2882),
    ])

    expect(players[0]!.peakElo).toBe(2882)
  })

  it('orders players by how often they appear', () => {
    const players = mergePlayers([row('Minor,X', 3), row('Major,Y', 900)])
    expect(players.map((p) => p.canonical)).toEqual(['Major,Y', 'Minor,X'])
  })

  it('skips a row whose name reduces to nothing', () => {
    // Punctuation-only names appear in damaged PGN files; they belong to no
    // player and must not become an empty-keyed one.
    expect(mergePlayers([row('...', 5), row('Petrosian,T', 4)]).map((p) => p.sortKey)).toEqual([
      'petrosian t',
    ])
  })

  it('prefers the longer spelling when neither carries a forename', () => {
    // No comma on either, so the forename comparison ties and length decides —
    // whichever side of the fold the longer spelling happens to be on.
    expect(
      mergePlayers([row('Torre', 3, 1920, 1930), row('Torre ', 2, 1920, 1930)])[0]?.canonical,
    ).toBe('Torre ')

    expect(
      mergePlayers([row('Torre ', 3, 1920, 1930), row('Torre', 2, 1920, 1930)])[0]?.canonical,
    ).toBe('Torre ')
  })

  it('keeps spellings apart when the career they imply is impossible', () => {
    // Two different Smiths, a century apart, share surname and initial.
    const players = mergePlayers([
      row('Smith,J', 10, 1880, 1890),
      row('Smith, John', 12, 1980, 1990),
    ])

    expect(players).toHaveLength(2)
    expect(players.every((p) => p.aliases.length === 1)).toBe(true)
  })

  it('merges rows that record no years at all', () => {
    // With no span to judge, the conservative key still decides.
    const players = mergePlayers([
      row('Réti,R', 4, null, null),
      row('Reti, Richard', 6, null, null),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]?.firstYear).toBeNull()
    expect(players[0]?.lastYear).toBeNull()
    expect(players[0]?.games).toBe(10)
  })

  it('takes the widest span and the highest rating across a merged player', () => {
    const players = mergePlayers([
      row('Anand,V', 100, 1990, 2005, 2790),
      row('Anand, Viswanathan', 50, 1995, 2015, null),
      row('Anand, V.', 25, null, null, 2817),
    ])

    expect(players).toHaveLength(1)
    expect(players[0]).toMatchObject({
      canonical: 'Anand, Viswanathan',
      games: 175,
      firstYear: 1990,
      lastYear: 2015,
      peakElo: 2817,
    })
  })
})
