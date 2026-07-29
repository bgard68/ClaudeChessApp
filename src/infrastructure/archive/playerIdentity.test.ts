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
})
