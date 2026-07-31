import { describe, expect, it } from 'vitest'
import { federationOf } from './playerCountry'

const code = (name: string) => federationOf(name)?.code ?? null

/*
 * PGN carries no nationality, so this is a hand-kept list matched by surname
 * and first initial. What it gets wrong is invisible: a missed match shows no
 * flag rather than an error, and a wrong one shows a plausible flag beside a
 * name nobody will check.
 */
describe('federationOf', () => {
  it('finds a player written out in full', () => {
    expect(federationOf('Carlsen, Magnus')).toEqual({ code: 'NO', name: 'Norway' })
  })

  // The library spells the same person several ways — "Anand,V" and
  // "Anand, Viswanathan" are 4,257 games between them.
  it.each([
    ['Anand, Viswanathan', 'IN'],
    ['Anand,V', 'IN'],
    ['Anand, V.', 'IN'],
    ['Nakamura,Hi', 'US'],
  ])('matches %s however the forename is abbreviated', (name, expected) => {
    expect(code(name)).toBe(expected)
  })

  // Only the first initial is used, so middle names change nothing.
  it('ignores everything after the first initial', () => {
    expect(code('Fischer, Robert James')).toBe('US')
    expect(code('Fischer, R')).toBe('US')
  })

  it('does not care about case or stray spacing', () => {
    expect(code('CARLSEN, MAGNUS')).toBe('NO')
    expect(code('  carlsen ,   magnus  ')).toBe('NO')
  })

  it('knows nobody it was not told about', () => {
    expect(federationOf('Nobody, A')).toBeNull()
    expect(federationOf('')).toBeNull()
  })

  /*
   * Surname alone never matches.
   *
   * Every entry in the list carries an initial, so the fallback that looks up
   * a bare surname can never hit one — a PGN that writes "Carlsen" with no
   * comma gets no flag. Harmless with the bundled collections, which are all
   * "Surname, Forename"; worth knowing for imported files, which need not be.
   */
  it('needs the forename initial, not just a surname', () => {
    expect(federationOf('Carlsen')).toBeNull()
    expect(federationOf('Fischer')).toBeNull()
  })

  /*
   * The list is written in ASCII; PGN files are not. The same player is
   * "Ljubojevic" in one collection and "Ljubojević" in another, and both
   * spellings have to find the same entry.
   *
   * This used to delete the accented letter rather than fold it — "Réti"
   * became "rti" and matched nothing, though 'reti r' was right there in the
   * list.
   */
  it.each([
    ['an acute accent', 'Réti, Richard', 'Reti, Richard'],
    ['a caron', 'Ljubojević, Ljubomir', 'Ljubojevic, Ljubomir'],
    ['an umlaut', 'Hübner, Robert', 'Huebner, Robert'],
  ])('finds the same player through %s', (_kind, accented, plain) => {
    // Whatever the plain spelling resolves to, the accented one must match it.
    expect(code(accented)).toBe(code(plain))
  })

  it('folds an accented name to the entry it belongs to', () => {
    expect(code('Réti, Richard')).toBe('CZ')
    expect(code('Reti, Richard')).toBe('CZ')
  })

  // Hyphens are kept, because double-barrelled surnames are one surname.
  it('keeps hyphenated surnames intact', () => {
    expect(code('Polgar, Judit')).toBe('HU')
    expect(federationOf('Vachier-Lagrave, Maxime')?.code).toBe('FR')
  })

  it('answers with a country name fit to show, not just a code', () => {
    expect(federationOf('Tal, Mikhail')).toEqual({ code: 'LV', name: 'Latvia' })
    expect(federationOf('Petrosian, Tigran')).toEqual({ code: 'AM', name: 'Armenia' })
  })

  /*
   * Federations change and a player has one entry, so each is listed under
   * the federation they are best known for. This is the documented trade-off,
   * not an oversight: a 2016 Nakamura game is labelled US, not Japan.
   */
  it('labels a player by one federation for their whole career', () => {
    expect(code('Nakamura, Hikaru')).toBe('US')
    expect(code('Caruana, Fabiano')).toBe('US')
  })
})
